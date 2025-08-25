/// <reference lib="webworker" />
export {};

type UnitSpec = { name: string; seconds: number; say?: string };
type PlanSpec = { title: string; rounds: number; units: UnitSpec[] };

type BaseCmd = { type: string; flowId: string };
type CmdStart       = BaseCmd & { type: "START"; payload: PlanSpec };
type CmdPause       = BaseCmd & { type: "PAUSE" };
type CmdResume      = BaseCmd & { type: "RESUME" };
type CmdStop        = BaseCmd & { type: "STOP" };
type CmdNextUnit    = BaseCmd & { type: "NEXT_UNIT" };
type CmdNextRound   = BaseCmd & { type: "NEXT_ROUND" };
type CmdAdjustTime  = BaseCmd & { type: "ADJUST_TIME"; scope?: "current"; deltaSec?: number; setSec?: number };
type Command = CmdStart | CmdPause | CmdResume | CmdStop | CmdNextUnit | CmdNextRound | CmdAdjustTime;

type EvPhaseEnter = {
  type: "FLOW_PHASE_ENTER";
  flowId: string;
  unitIndex: number;
  roundIndex: number;
  phaseName: string;
  totalMs: number;
  remainingMs: number;
  addedMs: number;    // 当前单元净临时加减（毫秒）
};
type EvTick = {
  type: "FLOW_TICK";
  flowId: string;
  unitIndex: number;
  roundIndex: number;
  phaseName: string;
  remainingMs: number;
  addedMs: number;    // 当前单元净临时加减（毫秒）
};
type EvRoundEnter = {
  type: "FLOW_ROUND_ENTER";
  flowId: string;
  roundIndex: number;
  unitIndex?: number;
  phaseName?: string;
};
type EvState = { type: "FLOW_STATE"; flowId: string; paused: boolean; done: boolean };
type EvDone = { type: "FLOW_DONE"; flowId: string };
type EvError = { type: "ERROR"; flowId: string; message: string };
type Event = EvPhaseEnter | EvTick | EvRoundEnter | EvState | EvDone | EvError;

const ctx: DedicatedWorkerGlobalScope = self as any;
const post = (ev: Event) => ctx.postMessage(ev);

class FlowEngine {
  readonly id: string;
  readonly plan: PlanSpec;
  private timer: number | null = null;
  private lastTs = 0;
  private unitIndex = 0;
  private roundIndex = 0;
  private remainingMs = 0;
  private addedMsAcc = 0;     // 当前单元累计净变化（毫秒）
  private paused = false;
  private done = false;
  private intervalMs = 200;

  constructor(id: string, plan: PlanSpec) {
    this.id = id;
    this.plan = { title: plan.title, rounds: Math.max(1, plan.rounds|0), units: [...plan.units] };
    if (this.plan.units.length === 0) throw new Error("Plan must have at least 1 unit");
  }

  start() {
    this.unitIndex = 0;
    this.roundIndex = 0;
    this.remainingMs = this.curUnitTotalMs();
    this.addedMsAcc = 0;
    this.emitPhaseEnter();
    this.emitTick();
    this.lastTs = Date.now();
    this.timer = setInterval(() => this.onInterval(), this.intervalMs) as unknown as number;
    this.emitState();
  }
  pause() { if (this.done) return; this.paused = true; this.emitState(); }
  resume() { if (this.done) return; this.paused = false; this.lastTs = Date.now(); this.emitState(); this.emitTick(); }
  stop() { if (this.timer!=null) { clearInterval(this.timer as any); this.timer = null; } this.done = true; this.emitState(); }
  nextUnit() {
    if (this.done) return;
    if (this.unitIndex < this.plan.units.length-1) this.unitIndex++;
    else {
      if (this.roundIndex < this.plan.rounds-1) { this.roundIndex++; this.unitIndex = 0; this.emitRoundEnter(); }
      else return this.finish();
    }
    this.remainingMs = this.curUnitTotalMs();
    this.addedMsAcc = 0;        // 新单元：清零临时累计
    this.emitPhaseEnter(); this.emitTick();
  }
  nextRound() {
    if (this.done) return;
    if (this.roundIndex < this.plan.rounds-1) {
      this.roundIndex++; this.unitIndex = 0;
      this.remainingMs = this.curUnitTotalMs();
      this.addedMsAcc = 0;      // 新一轮首单元：清零临时累计
      this.emitRoundEnter(); this.emitPhaseEnter(); this.emitTick();
    } else return this.finish();
  }
  adjustTime(opts: { deltaSec?: number; setSec?: number; scope?: "current" }) {
    let next = this.remainingMs;

    // 仅做下限 0（允许超过预设上限，且仅影响本单元本轮）
    if (typeof opts.setSec === "number") {
      const newMs = Math.max(0, Math.round(opts.setSec*1000));
      this.addedMsAcc += (newMs - this.remainingMs);
      next = newMs;
    }
    if (typeof opts.deltaSec === "number") {
      const apply = Math.round(opts.deltaSec*1000);
      const newMs = Math.max(0, this.remainingMs + apply);
      this.addedMsAcc += (newMs - this.remainingMs);
      next = newMs;
    }

    this.remainingMs = next;
    this.emitTick(); // 立即回传，带 addedMsAcc
  }

  private onInterval() {
    if (this.paused || this.done) return;
    const now = Date.now();
    const dt = now - this.lastTs;
    this.lastTs = now;
    this.remainingMs = Math.max(0, this.remainingMs - dt);

    if (this.remainingMs <= 0) {
      if (this.unitIndex < this.plan.units.length-1) this.unitIndex++;
      else {
        if (this.roundIndex < this.plan.rounds-1) { this.roundIndex++; this.unitIndex = 0; this.emitRoundEnter(); }
        else return this.finish();
      }
      this.remainingMs = this.curUnitTotalMs();
      this.addedMsAcc = 0;     // 进入新单元重置
      this.emitPhaseEnter(); this.emitTick();
      return;
    }
    this.emitTick();
  }

  private finish() {
    if (this.timer!=null) { clearInterval(this.timer as any); this.timer = null; }
    this.done = true; post({ type:"FLOW_DONE", flowId: this.id }); this.emitState();
  }

  private emitPhaseEnter() {
    post({
      type:"FLOW_PHASE_ENTER",
      flowId:this.id,
      unitIndex:this.unitIndex,
      roundIndex:this.roundIndex,
      phaseName:this.curUnit().name,
      totalMs:this.curUnitTotalMs(),
      remainingMs:this.remainingMs,
      addedMs:this.addedMsAcc,
    } as any);
  }
  private emitRoundEnter() {
    post({ type:"FLOW_ROUND_ENTER", flowId:this.id, roundIndex:this.roundIndex, unitIndex:0, phaseName:this.plan.units[0]?.name });
  }
  private emitTick() {
    post({
      type:"FLOW_TICK",
      flowId:this.id,
      unitIndex:this.unitIndex,
      roundIndex:this.roundIndex,
      phaseName:this.curUnit().name,
      remainingMs:this.remainingMs,
      addedMs:this.addedMsAcc,
    } as any);
  }
  private emitState() { post({ type:"FLOW_STATE", flowId:this.id, paused:this.paused, done:this.done }); }

  private curUnit() { return this.plan.units[this.unitIndex]; }
  private curUnitTotalMs() { return Math.max(0, Math.round(this.curUnit().seconds * 1000)); }
}

const flows = new Map<string, FlowEngine>();
function getFlow(id: string) { const f = flows.get(id); if (!f) throw new Error("Flow "+id+" not found"); return f; }

(self as any).onmessage = (e: MessageEvent<Command>) => {
  const cmd = e.data;
  try {
    switch (cmd.type) {
      case "START": {
        try { getFlow(cmd.flowId).stop(); } catch {}
        const f = new FlowEngine(cmd.flowId, cmd.payload);
        flows.set(cmd.flowId, f); f.start(); break;
      }
      case "PAUSE": getFlow(cmd.flowId).pause(); break;
      case "RESUME": getFlow(cmd.flowId).resume(); break;
      case "STOP": { const f = getFlow(cmd.flowId); f.stop(); flows.delete(cmd.flowId); break; }
      case "NEXT_UNIT": getFlow(cmd.flowId).nextUnit(); break;
      case "NEXT_ROUND": getFlow(cmd.flowId).nextRound(); break;
      case "ADJUST_TIME": getFlow(cmd.flowId).adjustTime({ deltaSec: cmd.deltaSec, setSec: cmd.setSec, scope: cmd.scope }); break;
      default: post({ type:"ERROR", flowId: (cmd as any).flowId, message: "Unknown command: "+(cmd as any).type });
    }
  } catch (err: any) {
    post({ type:"ERROR", flowId: (cmd as any).flowId, message: String(err?.message || err) });
  }
};
