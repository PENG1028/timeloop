export type PhaseName = "prepare" | "ready" | "hold" | "rest" | "betweenRounds" | string;

export type UnitSpec = { name: PhaseName; seconds: number; say?: string; };

export type PlanSpec = {
  id: string;
  title: string;
  rounds: number;
  prepare?: number;
  units: UnitSpec[];
  betweenRounds?: number;
};

export type Scope = "current" | "round" | "run";

export type Command =
  | { type: "START"; flowId: string; payload: PlanSpec }
  | { type: "PAUSE"; flowId: string }
  | { type: "RESUME"; flowId: string }
  | { type: "STOP"; flowId: string }
  | { type: "NEXT_UNIT"; flowId: string }
  | { type: "NEXT_ROUND"; flowId: string }
  | { type: "ADJUST_TIME"; flowId: string; scope: Scope; deltaSec?: number; setSec?: number };

export type Event =
  | { type: "FLOW_PHASE_ENTER"; flowId: string; unitIndex: number; roundIndex: number; phaseName: string; endsAt: number; totalMs: number; remainingMs:number }
  | { type: "FLOW_TICK"; flowId: string; remainingMs: number; phaseName: string; unitIndex: number; roundIndex: number }
  | { type: "FLOW_STATE"; flowId: string; paused: boolean; done: boolean }
  | { type: "FLOW_DONE"; flowId: string }
  | { type: "ADJUST_APPLIED"; flowId: string; scope: Scope; prev: number; next: number }
  | { type: "ERROR"; flowId: string; message: string };

export type PhaseRuntime = { name: string; ms: number; endAt: number; };

export type FlowRuntime = {
  flowId: string;
  title: string;
  startEpoch: number;
  paused: boolean;
  pauseRemainingMs?: number;
  roundIndex: number;
  unitIndex: number;
  timeline: PhaseRuntime[];
  unitsPerRound: number;
  hasBetweenBreak: boolean;
  prepareCount: number;   // ✅ 新增
  done: boolean;
};

export function buildTimeline(spec: PlanSpec): PhaseRuntime[] {
  const out: PhaseRuntime[] = [];
  let acc = 0;

  if (spec.prepare && spec.prepare > 0) {
    const ms = spec.prepare * 1000;
    acc += ms;
    out.push({ name: "prepare", ms, endAt: acc });
  }
  for (let r = 0; r < spec.rounds; r++) {
    for (const u of spec.units) {
      const ms = Math.max(0, Math.floor(u.seconds * 1000));
      acc += ms;
      out.push({ name: u.name, ms, endAt: acc });
    }
    if (r < spec.rounds - 1 && spec.betweenRounds && spec.betweenRounds > 0) {
      const ms = spec.betweenRounds * 1000;
      acc += ms;
      out.push({ name: "betweenRounds", ms, endAt: acc });
    }
  }
  return out;
}
