/// <reference lib="webworker" />
export {};

type UnitSpec = { name: string; seconds: number; say?: string };
type PlanSpec = {
  title: string;
  rounds: number;
  units: UnitSpec[];
  // 你不需要 prepare/betweenRounds 就不要加；若已有字段，忽略即可
};

type BaseCmd = { type: string; flowId: string };
type CmdStart       = BaseCmd & { type: "START";        payload: PlanSpec };
type CmdPause       = BaseCmd & { type: "PAUSE" };
type CmdResume      = BaseCmd & { type: "RESUME" };
type CmdStop        = BaseCmd & { type: "STOP" };
type CmdNextUnit    = BaseCmd & { type: "NEXT_UNIT" };
type CmdNextRound   = BaseCmd & { type: "NEXT_ROUND" };
type CmdAdjustTime  = BaseCmd & { type: "ADJUST_TIME"; scope?: "current"; deltaSec?: number; setSec?: number };
type Command = CmdStart | CmdPause | CmdResume | CmdStop | CmdNextUnit | CmdNextRound | CmdAdjustTime;

// —— 事件契约（关键！）——
// 1) 进入单元：FLOW_PHASE_ENTER（必带 unitIndex / roundIndex / phaseName / totalMs / remainingMs）
// 2) 每一帧：    FLOW_TICK        （必带 unitIndex / roundIndex / phaseName / remainingMs）
// 3) 进入新一轮：FLOW_ROUND_ENTER（建议发；至少带 roundIndex，最好也带 unitIndex=0 / phaseName）
// 4) 状态同步：  FLOW_STATE       （paused/done）
// 5) 结束：      FLOW_DONE
type EvPhaseEnter = {
  type: "FLOW_PHASE_ENTER";
  flowId: string;
  unitIndex: number;
  roundIndex: number;
  phaseName: string;
  totalMs: number;
  remainingMs: number;
};
type EvTick = {
  type: "FLOW_TICK";
  flowId: string;
  unitIndex: number;
  roundIndex: number;
  phaseName: string;
  remainingMs: number;
};
type EvRoundEnter = {
  type: "FLOW_ROUND_ENTER";
  flowId: string;
  roundIndex: number;
  unitIndex?: number;
  phaseName?: string;
};
type EvState = {
  type: "FLOW_STATE";
  flowId: string;
  paused: boolean;
  done: boolean;
};
type EvDone = { type: "FLOW_DONE"; flowId: string };
type EvError = { type: "ERROR"; flowId: string; message: string };
type Event = EvPhaseEnter | EvTick | EvRoundEnter | EvState | EvDone | EvError;

// —— 工具 —— 
const ctx: DedicatedWorkerGlobalScope = self as any;
function post(ev: Event) { ctx.postMessage(ev); }
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

// —— 每个流程的独立引擎 —— 
class FlowEngine {
  readonly id: string;
  readonly plan: PlanSpec;
  private timer: number | null = null;
  private lastTs = 0;

  private unitIndex = 0;
  private roundIndex = 0;
  private remainingMs = 0;

  private paused = false;
  private done = false;

  // tick 粒度（可 100~200ms）
  private intervalMs = 200;

  constructor(id: string, plan: PlanSpec) {
    this.id = id;
    this.plan = {
      title: plan.title,
      rounds: Math.max(1, plan.rounds | 0),
      units: [...plan.units],
    };
    if (this.plan.units.length === 0) {
      throw new Error("Plan must have at least 1 unit");
    }
  }

  start() {
    // 初始化到第 0 单元第 0 轮
    this.unitIndex = 0;
    this.roundIndex = 0;
    this.remainingMs = this.curUnitTotalMs();

    // 进入单元 + 第一帧 tick
    this.emitPhaseEnter();
    this.emitTick();

    // 启动定时器（抗抖动，用时间差推进）
    this.lastTs = Date.now();
    this.timer = setInterval(() => this.onInterval(), this.intervalMs) as unknown as number;

    // 状态同步
    this.emitState();
  }

  pause() {
    if (this.done) return;
    this.paused = true;
    this.emitState();
  }

  resume() {
    if (this.done) return;
    this.paused = false;
    // 校准时间基准，避免“暂停期间”的时间被扣减
    this.lastTs = Date.now();
    this.emitState();
    // 恢复一帧 tick 让 UI/音频立刻对齐当前 remaining
    this.emitTick();
  }

  stop() {
    if (this.timer != null) { clearInterval(this.timer as any); this.timer = null; }
    this.done = true;
    this.emitState();
    // 不发 DONE（STOP 是外部主动打断）；若你希望 STOP 也视为 DONE，可以改成 post({type:"FLOW_DONE", ...})
  }

  nextUnit() {
    if (this.done) return;
    if (this.unitIndex < this.plan.units.length - 1) {
      this.unitIndex++;
    } else {
      // 到末尾切下一轮
      if (this.roundIndex < this.plan.rounds - 1) {
        this.roundIndex++;
        this.unitIndex = 0;
        this.emitRoundEnter();
      } else {
        // 真正完成
        return this.finish();
      }
    }
    this.remainingMs = this.curUnitTotalMs();
    this.emitPhaseEnter();
    this.emitTick();
  }

  nextRound() {
    if (this.done) return;
    if (this.roundIndex < this.plan.rounds - 1) {
      this.roundIndex++;
      this.unitIndex = 0;
      this.remainingMs = this.curUnitTotalMs();
      this.emitRoundEnter();
      this.emitPhaseEnter();
      this.emitTick();
    } else {
      return this.finish();
    }
  }

  adjustTime(opts: { deltaSec?: number; setSec?: number; scope?: "current" }) {
    // 仅支持 current；未来扩展 scope 可在此分支
    const totalMs = this.curUnitTotalMs();
    let next = this.remainingMs;

    if (typeof opts.setSec === "number") {
      next = clamp(Math.round(opts.setSec * 1000), 0, totalMs);
    }
    if (typeof opts.deltaSec === "number") {
      next = clamp(next + Math.round(opts.deltaSec * 1000), 0, totalMs);
    }

    this.remainingMs = next;
    // 立刻发一帧 tick：前端音频导演会据此“最后 3 秒滴滴滴”或（若剩余秒显著回升）重新播报
    this.emitTick();
  }

  // —— 内部推进 —— 
  private onInterval() {
    if (this.paused || this.done) return;
    const now = Date.now();
    const dt = now - this.lastTs;
    this.lastTs = now;

    // 扣减剩余时间
    this.remainingMs = Math.max(0, this.remainingMs - dt);

    if (this.remainingMs <= 0) {
      // 切下一单元 / 下一轮 / 完成
      if (this.unitIndex < this.plan.units.length - 1) {
        this.unitIndex++;
      } else {
        if (this.roundIndex < this.plan.rounds - 1) {
          this.roundIndex++;
          this.unitIndex = 0;
          this.emitRoundEnter();
        } else {
          return this.finish();
        }
      }
      this.remainingMs = this.curUnitTotalMs();
      this.emitPhaseEnter();
      this.emitTick();
      return;
    }

    // 普通一帧
    this.emitTick();
  }

  private finish() {
    if (this.timer != null) { clearInterval(this.timer as any); this.timer = null; }
    this.done = true;
    post({ type: "FLOW_DONE", flowId: this.id });
    this.emitState();
  }

  // —— 事件派发（契约保证）——
  private emitPhaseEnter() {
    post({
      type: "FLOW_PHASE_ENTER",
      flowId: this.id,
      unitIndex: this.unitIndex,
      roundIndex: this.roundIndex,
      phaseName: this.curUnit().name,
      totalMs: this.curUnitTotalMs(),
      remainingMs: this.remainingMs,
    });
  }
  private emitRoundEnter() {
    post({
      type: "FLOW_ROUND_ENTER",
      flowId: this.id,
      roundIndex: this.roundIndex,
      unitIndex: 0,
      phaseName: this.plan.units[0]?.name,
    });
  }
  private emitTick() {
    post({
      type: "FLOW_TICK",
      flowId: this.id,
      unitIndex: this.unitIndex,
      roundIndex: this.roundIndex,
      phaseName: this.curUnit().name,
      remainingMs: this.remainingMs,
    });
  }
  private emitState() {
    post({ type: "FLOW_STATE", flowId: this.id, paused: this.paused, done: this.done });
  }

  private curUnit() { return this.plan.units[this.unitIndex]; }
  private curUnitTotalMs() { return Math.max(0, Math.round(this.curUnit().seconds * 1000)); }
}

// —— 多流程管理 —— 
const flows = new Map<string, FlowEngine>();

function getFlow(id: string) {
  const f = flows.get(id);
  if (!f) throw new Error(`Flow ${id} not found`);
  return f;
}

ctx.onmessage = (e: MessageEvent<Command>) => {
  const cmd = e.data;
  try {
    switch (cmd.type) {
      case "START": {
        // 先停止同名的旧实例（若存在）
        try { getFlow(cmd.flowId).stop(); } catch {}
        const f = new FlowEngine(cmd.flowId, cmd.payload);
        flows.set(cmd.flowId, f);
        f.start();
        break;
      }
      case "PAUSE": getFlow(cmd.flowId).pause(); break;
      case "RESUME": getFlow(cmd.flowId).resume(); break;
      case "STOP": {
        const f = getFlow(cmd.flowId);
        f.stop();
        flows.delete(cmd.flowId);
        break;
      }
      case "NEXT_UNIT": getFlow(cmd.flowId).nextUnit(); break;
      case "NEXT_ROUND": getFlow(cmd.flowId).nextRound(); break;
      case "ADJUST_TIME": getFlow(cmd.flowId).adjustTime({ deltaSec: cmd.deltaSec, setSec: cmd.setSec, scope: cmd.scope }); break;
      default:
        post({ type: "ERROR", flowId: cmd.flowId, message: `Unknown command: ${cmd.type}` });
    }
  } catch (err: any) {
    post({ type: "ERROR", flowId: cmd.flowId, message: String(err?.message || err) });
  }
};
