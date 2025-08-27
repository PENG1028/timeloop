/// <reference lib="webworker" />
export { };

type UnitSpec = { name: string; seconds: number; say?: string };
type PlanSpec = { title: string; rounds: number; units: UnitSpec[] };

type BaseCmd = { type: string; flowId: string };
type CmdStart = BaseCmd & { type: "START"; payload: PlanSpec };
type CmdPause = BaseCmd & { type: "PAUSE" };
type CmdResume = BaseCmd & { type: "RESUME" };
type CmdStop = BaseCmd & { type: "STOP" };
type CmdNextUnit = BaseCmd & { type: "NEXT_UNIT" };
type CmdNextRound = BaseCmd & { type: "NEXT_ROUND" };
type CmdAdjustTime = BaseCmd & { type: "ADJUST_TIME"; scope?: "current"; deltaSec?: number; setSec?: number };
type CmdSyncPlan = BaseCmd & { type: "SYNC_PLAN"; payload: PlanSpec };
type Command = CmdStart | CmdPause | CmdResume | CmdStop | CmdNextUnit | CmdNextRound | CmdAdjustTime | CmdSyncPlan;

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
    public plan: PlanSpec;
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
        this.plan = { title: plan.title, rounds: Math.max(1, plan.rounds | 0), units: [...plan.units] };
        if (this.plan.units.length === 0) throw new Error("Plan must have at least 1 unit");
    }


    syncPlan(next: PlanSpec) {
        // 1) 规范化
        const newPlan: PlanSpec = {
            title: String(next?.title ?? this.plan.title ?? ""),
            rounds: Math.max(1, Number(next?.rounds ?? this.plan.rounds) || 1),
            units: Array.isArray(next?.units) ? next.units.map(u => ({
                name: String(u?.name ?? ""),
                seconds: Math.max(1, Number(u?.seconds) || 1),
                say: (u?.say ?? "") as any,
            })) : (this.plan.units ?? [])
        };

        const prevUnitsLen = this.plan.units.length;
        const prevRounds = this.plan.rounds;
        const prevRemain = this.remainingMs;

        // 2) 应用新计划
        this.plan = newPlan;
        try {
            const idx = this.unitIndex | 0;
            const prevUnit = this.plan.units?.[idx];
            const nextUnit = newPlan.units?.[idx];

            // 防御：索引合法、两侧都存在该单元，且名称未变（避免重排/替换导致误判）
            const sameSlot = !!(prevUnit && nextUnit) && String(prevUnit.name ?? "") === String(nextUnit.name ?? "");
            if (sameSlot && typeof prevUnit.seconds === "number" && typeof nextUnit.seconds === "number") {
                // 计划内 seconds 的规范化：与你文件上方一致（至少 1s）
                const oldTotal = Math.max(0, Math.round(Math.max(1, Number(prevUnit.seconds) || 1) * 1000));
                const newTotal = Math.max(0, Math.round(Math.max(1, Number(nextUnit.seconds) || 1) * 1000));

                if (oldTotal !== newTotal) {
                    const delta = newTotal - oldTotal;
                    // 只改剩余时间；不动 addedMsAcc（临时加减的净值仍独立）
                    this.remainingMs = Math.max(0, Math.min(newTotal, this.remainingMs + delta));
                }
            }
        } catch { /* 保守失败不影响后续 */ }


        // 3) 夹紧当前索引，保证不越界；剩余时间如果超过新总时长就夹到新总时长
        if (this.unitIndex >= this.plan.units.length) {
            this.unitIndex = Math.max(0, this.plan.units.length - 1);
        }
        const newTotal = this.curUnitTotalMs();
        if (this.remainingMs > newTotal) this.remainingMs = newTotal;

        if (this.roundIndex >= this.plan.rounds) {
            this.roundIndex = Math.max(0, this.plan.rounds - 1);
        }

        // 4) 如果之前已经结束（done=true），但新计划还能继续，复活继续跑
        if (this.done) {
            const wasEndOfRun =
                prevUnitsLen > 0 &&
                this.unitIndex >= prevUnitsLen - 1 &&
                this.remainingMs <= 0;

            const canContinue = this.roundIndex < this.plan.rounds - 1;
            if (canContinue) {
                this.done = false;
                // 如果就是在“末单元时间到”上结束的，直接切到下一轮第一个单元
                if (wasEndOfRun) {
                    this.roundIndex++;
                    this.unitIndex = 0;
                    this.remainingMs = this.curUnitTotalMs();
                    this.addedMsAcc = 0;
                }
                // 确保计时器在跑
                if (this.timer == null) {
                    this.lastTs = Date.now();
                    this.timer = setInterval(() => this.onInterval(), this.intervalMs) as any;
                }
            }
        }

        // 5) 通知前端当前状态（**不要**发 PHASE_ENTER，避免重复播报/蜂鸣）
        post({
            type: "FLOW_TICK",
            flowId: this.id,
            remainingMs: this.remainingMs,
            phaseName: this.curUnit().name,
            unitIndex: this.unitIndex,
            roundIndex: this.roundIndex,
            addedMs: this.addedMsAcc,
        });
        this.emitState();
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
    stop() { if (this.timer != null) { clearInterval(this.timer as any); this.timer = null; } this.done = true; this.emitState(); }
    nextUnit() {
        if (this.done) return;
        if (this.unitIndex < this.plan.units.length - 1) this.unitIndex++;
        else {
            if (this.roundIndex < this.plan.rounds - 1) { this.roundIndex++; this.unitIndex = 0; this.emitRoundEnter(); }
            else return this.finish();
        }
        this.remainingMs = this.curUnitTotalMs();
        this.addedMsAcc = 0;        // 新单元：清零临时累计
        this.emitPhaseEnter(); this.emitTick();
    }
    nextRound() {
        if (this.done) return;
        if (this.roundIndex < this.plan.rounds - 1) {
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
            const newMs = Math.max(0, Math.round(opts.setSec * 1000));
            this.addedMsAcc += (newMs - this.remainingMs);
            next = newMs;
        }
        if (typeof opts.deltaSec === "number") {
            const apply = Math.round(opts.deltaSec * 1000);
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
            if (this.unitIndex < this.plan.units.length - 1) this.unitIndex++;
            else {
                if (this.roundIndex < this.plan.rounds - 1) { this.roundIndex++; this.unitIndex = 0; this.emitRoundEnter(); }
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
        if (this.timer != null) { clearInterval(this.timer as any); this.timer = null; }
        this.done = true; post({ type: "FLOW_DONE", flowId: this.id }); this.emitState();
    }

    private emitPhaseEnter() {
        post({
            type: "FLOW_PHASE_ENTER",
            flowId: this.id,
            unitIndex: this.unitIndex,
            roundIndex: this.roundIndex,
            phaseName: this.curUnit().name,
            totalMs: this.curUnitTotalMs(),
            remainingMs: this.remainingMs,
            addedMs: this.addedMsAcc,
        } as any);
    }
    private emitRoundEnter() {
        post({ type: "FLOW_ROUND_ENTER", flowId: this.id, roundIndex: this.roundIndex, unitIndex: 0, phaseName: this.plan.units[0]?.name });
    }
    private emitTick() {
        post({
            type: "FLOW_TICK",
            flowId: this.id,
            unitIndex: this.unitIndex,
            roundIndex: this.roundIndex,
            phaseName: this.curUnit().name,
            remainingMs: this.remainingMs,
            addedMs: this.addedMsAcc,
        } as any);
    }
    private emitState() { post({ type: "FLOW_STATE", flowId: this.id, paused: this.paused, done: this.done }); }

    private curUnit() { return this.plan.units[this.unitIndex]; }
    private curUnitTotalMs() { return Math.max(0, Math.round(this.curUnit().seconds * 1000)); }
}

const flows = new Map<string, FlowEngine>();
function getFlow(id: string) { const f = flows.get(id); if (!f) throw new Error("Flow " + id + " not found"); return f; }

ctx.onmessage = (e: MessageEvent<Command>) => {
    const cmd = e.data;
    try {
        switch (cmd.type) {
            case "START": {
                // 有旧的就停掉再重建
                try { flows.get(cmd.flowId)?.stop(); } catch { }
                const eng = new FlowEngine(cmd.flowId, cmd.payload);
                flows.set(cmd.flowId, eng);
                eng.start();
                break;
            }
            case "PAUSE": getFlow(cmd.flowId).pause(); break;
            case "RESUME": getFlow(cmd.flowId).resume(); break;
            case "STOP": {
                const eng = flows.get(cmd.flowId);
                if (eng) {
                    eng.stop();
                    flows.delete(cmd.flowId);
                }
                break;
            }
            case "NEXT_UNIT": getFlow(cmd.flowId).nextUnit(); break;
            case "NEXT_ROUND": getFlow(cmd.flowId).nextRound(); break;
            case "ADJUST_TIME": {
                getFlow(cmd.flowId).adjustTime({
                    scope: cmd.scope,
                    deltaSec: cmd.deltaSec,
                    setSec: cmd.setSec,
                });
                break;
            }
            case "SYNC_PLAN": {
                getFlow(cmd.flowId).syncPlan(cmd.payload); // ← 用上面保留的那个 syncPlan
                break;
            }
            default:
                post({ type: "ERROR", flowId: (cmd as any).flowId, message: "Unknown command: " + (cmd as any).type });
        }
    } catch (err: any) {
        post({ type: "ERROR", flowId: (cmd as any).flowId, message: String(err?.message || err) });
    }
};