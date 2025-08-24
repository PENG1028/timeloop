/// <reference lib="webworker" />
import { buildTimeline, Command, Event, FlowRuntime, PlanSpec } from "../_types/timer";

type Flows = Map<string, FlowRuntime>;
const flows: Flows = new Map();

let loopTimer: number | undefined;
const TICK_MS = 50;

function now(): number {
  // @ts-ignore
  return self.performance.now();
}
function post(e: Event) {
  // @ts-ignore
  (self as any).postMessage(e);
}

function emitTick(fr: FlowRuntime) {
  const relNow = now() - fr.startEpoch;
  const pr = fr.timeline[fr.unitIndex];
  if (!pr) return;
  const remaining = Math.max(0, pr.endAt - relNow);
  post({ type: "FLOW_TICK", flowId: fr.flowId, remainingMs: remaining, phaseName: pr.name, unitIndex: fr.unitIndex, roundIndex: fr.roundIndex });
}
function emitPausedTick(fr: FlowRuntime) {
  const pr = fr.timeline[fr.unitIndex];
  if (!pr) return;
  const remaining = Math.max(0, Math.floor(fr.pauseRemainingMs ?? 0));
  post({ type: "FLOW_TICK", flowId: fr.flowId, remainingMs: remaining, phaseName: pr.name, unitIndex: fr.unitIndex, roundIndex: fr.roundIndex });
}

function ensureLoop() {
  if (loopTimer != null) return;
  const tick = () => {
    const t = now();
    let anyRunning = false;

    flows.forEach((fr) => {
      if (fr.done || fr.paused) return;

      const relNow = t - fr.startEpoch;
      const pr = fr.timeline[fr.unitIndex];
      if (!pr) return;

      const remaining = Math.max(0, pr.endAt - relNow);
      anyRunning = true;

      post({ type: "FLOW_TICK", flowId: fr.flowId, remainingMs: remaining, phaseName: pr.name, unitIndex: fr.unitIndex, roundIndex: fr.roundIndex });

      if (remaining <= 0) {
        fr.unitIndex++;
        const next = fr.timeline[fr.unitIndex];
        if (!next) {
          fr.done = true;
          post({ type: "FLOW_STATE", flowId: fr.flowId, paused: false, done: true });
          post({ type: "FLOW_DONE", flowId: fr.flowId });
          return;
        }

        // 轮推进：上一节点是 betweenRounds 则 +1
        const prev = fr.timeline[fr.unitIndex - 1];
        if (prev?.name === "betweenRounds") fr.roundIndex += 1;

        post({ type: "FLOW_PHASE_ENTER", flowId: fr.flowId, unitIndex: fr.unitIndex, roundIndex: fr.roundIndex, phaseName: next.name, endsAt: fr.startEpoch + next.endAt, totalMs: next.ms });
      }
    });

    if (!anyRunning) {
      loopTimer = undefined;
      return;
    }
    // @ts-ignore
    loopTimer = (self as any).setTimeout(tick, TICK_MS);
  };

  // @ts-ignore
  loopTimer = (self as any).setTimeout(tick, TICK_MS);
}

function startFlow(flowId: string, spec: PlanSpec) {
  const tl = buildTimeline(spec);
  const startEpoch = now();
  const hasBetween = !!(spec.betweenRounds && spec.betweenRounds > 0);
  const prepareCount = spec.prepare && spec.prepare > 0 ? 1 : 0;
  const unitsPerRound = spec.units.length + (hasBetween ? 1 : 0);

  const fr: FlowRuntime = {
    flowId,
    title: spec.title,
    startEpoch,
    paused: false,
    roundIndex: 0,
    unitIndex: 0,
    timeline: tl,
    unitsPerRound,
    hasBetweenBreak: hasBetween,
    prepareCount,
    done: false,
  };
  flows.set(flowId, fr);

  const first = tl[0];
  post({ type: "FLOW_PHASE_ENTER", flowId, unitIndex: 0, roundIndex: 0, phaseName: first?.name ?? "idle", endsAt: startEpoch + (first?.endAt ?? 0), totalMs: first?.ms ?? 0 });
  post({ type: "FLOW_STATE", flowId, paused: false, done: false });
  emitTick(fr);
  ensureLoop();
}

function pauseFlow(flowId: string) {
  const fr = flows.get(flowId);
  if (!fr || fr.paused || fr.done) return;
  const relNow = now() - fr.startEpoch;
  const pr = fr.timeline[fr.unitIndex];
  if (!pr) return;
  fr.pauseRemainingMs = Math.max(0, pr.endAt - relNow);
  fr.paused = true;
  post({ type: "FLOW_STATE", flowId, paused: true, done: false });
  emitPausedTick(fr);
}
function resumeFlow(flowId: string) {
  const fr = flows.get(flowId);
  if (!fr || !fr.paused || fr.done) return;
  const remaining = fr.pauseRemainingMs ?? 0;
  const pr = fr.timeline[fr.unitIndex];
  const newStart = now() + remaining - (pr?.endAt ?? 0);
  fr.startEpoch = newStart;
  fr.paused = false;
  fr.pauseRemainingMs = undefined;
  post({ type: "FLOW_STATE", flowId, paused: false, done: false });
  emitTick(fr);
  ensureLoop();
}
function stopFlow(flowId: string) {
  const fr = flows.get(flowId);
  if (!fr) return;
  fr.done = true;
  flows.delete(flowId);
  post({ type: "FLOW_STATE", flowId, paused: false, done: true });
  post({ type: "FLOW_DONE", flowId });
}

function nextUnit(flowId: string) {
  const fr = flows.get(flowId);
  if (!fr || fr.done) return;
  fr.unitIndex = Math.min(fr.timeline.length, fr.unitIndex + 1);
  const next = fr.timeline[fr.unitIndex];
  if (!next) {
    fr.done = true;
    post({ type: "FLOW_STATE", flowId, paused: false, done: true });
    post({ type: "FLOW_DONE", flowId });
    return;
  }
  const prev = fr.timeline[fr.unitIndex - 1];
  if (prev?.name === "betweenRounds") fr.roundIndex += 1;

  post({ type: "FLOW_PHASE_ENTER", flowId, unitIndex: fr.unitIndex, roundIndex: fr.roundIndex, phaseName: next.name, endsAt: fr.startEpoch + next.endAt, totalMs: next.ms });
  fr.paused ? emitPausedTick(fr) : emitTick(fr);
}

function nextRound(flowId: string) {
  const fr = flows.get(flowId);
  if (!fr || fr.done) return;

  const upr = fr.unitsPerRound;
  const offset = fr.prepareCount; // prepare 段偏移
  const curRound = Math.floor(Math.max(0, fr.unitIndex - offset) / upr);
  const targetRound = curRound + 1;
  const targetIndex = offset + targetRound * upr;

  if (targetIndex >= fr.timeline.length) {
    fr.done = true;
    post({ type: "FLOW_STATE", flowId, paused: false, done: true });
    post({ type: "FLOW_DONE", flowId });
    return;
  }
  fr.unitIndex = targetIndex;
  fr.roundIndex = targetRound;

  const next = fr.timeline[fr.unitIndex];
  post({ type: "FLOW_PHASE_ENTER", flowId, unitIndex: fr.unitIndex, roundIndex: fr.roundIndex, phaseName: next.name, endsAt: fr.startEpoch + next.endAt, totalMs: next.ms });
  fr.paused ? emitPausedTick(fr) : emitTick(fr);
}

function adjustTime(flowId: string, deltaSec?: number, setSec?: number) {
  const fr = flows.get(flowId);
  if (!fr || fr.done) return;
  const idx = fr.unitIndex;
  const pr = fr.timeline[idx];
  if (!pr) return;

  if (fr.paused) {
    const prev = Math.max(0, Math.floor((fr.pauseRemainingMs ?? 0) / 1000));
    let newRemaining: number;
    if (typeof setSec === "number") newRemaining = Math.max(0, Math.floor(setSec * 1000));
    else if (typeof deltaSec === "number") newRemaining = Math.max(0, (fr.pauseRemainingMs ?? 0) + Math.floor(deltaSec * 1000));
    else return;

    fr.pauseRemainingMs = newRemaining;
    post({ type: "ADJUST_APPLIED", flowId, scope: "current", prev, next: Math.floor(newRemaining / 1000) });
    emitPausedTick(fr);
    return;
  }

  // 运行态：平移时间线 endAt
  const relNow = now() - fr.startEpoch;
  const remainingBefore = Math.max(0, pr.endAt - relNow);

  let newRemaining: number;
  if (typeof setSec === "number") {
    newRemaining = Math.max(0, Math.floor(setSec * 1000));
  } else if (typeof deltaSec === "number") {
    newRemaining = Math.max(0, remainingBefore + Math.floor(deltaSec * 1000));
  } else {
    return;
  }

  const shift = (relNow + newRemaining) - pr.endAt;
  for (let j = idx; j < fr.timeline.length; j++) {
    fr.timeline[j].endAt += shift;
  }

  post({ type: "ADJUST_APPLIED", flowId, scope: "current", prev: Math.floor(remainingBefore / 1000), next: Math.floor(newRemaining / 1000) });
  emitTick(fr);
}

self.onmessage = (e: MessageEvent<Command>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case "START": return startFlow(msg.flowId, msg.payload);
      case "PAUSE": return pauseFlow(msg.flowId);
      case "RESUME": return resumeFlow(msg.flowId);
      case "STOP": return stopFlow(msg.flowId);
      case "NEXT_UNIT": return nextUnit(msg.flowId);
      case "NEXT_ROUND": return nextRound(msg.flowId);
      case "ADJUST_TIME": return adjustTime(msg.flowId, msg.deltaSec, msg.setSec);
      default: return;
    }
  } catch (err: any) {
    post({ type: "ERROR", flowId: (msg as any).flowId, message: err?.message ?? String(err) });
  }
};
