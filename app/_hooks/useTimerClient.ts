"use client";
import { useEffect, useState } from "react";
import type { Command, Event, PlanSpec } from "../_types/timer";

type FlowView = {
  flowId: string;
  title: string;
  phaseName: string;
  unitIndex: number;
  roundIndex: number;
  remainingMs: number;
  done: boolean;
  paused: boolean;
  addedMs: number;          // 当前单元“净临时加减”（毫秒）
};

type TLBus = {
  worker: Worker | null;
  flowsCache: Record<string, FlowView>;
  stateUpdaters: Set<(s: Record<string, FlowView>) => void>;
  eventListeners: Set<(ev: Event) => void>;
  audioWired: boolean;
  audio?: any;
  prefetch?: any;
  planMap: Map<string, PlanSpec>;
  lastSec: Map<string, number>;
  lastUnit: Map<string, number>;
  lastRound: Map<string, number>;
  lastPhaseName: Map<string, string>;
  lastRemainSec: Map<string, number>;
  speakKey: Map<string, string>;
  speakAt: Map<string, number>;
};

const g = globalThis as any;
if (!g.__TL_BUS__) {
  g.__TL_BUS__ = {
    worker: null,
    flowsCache: {},
    stateUpdaters: new Set(),
    eventListeners: new Set(),
    audioWired: false,
    audio: undefined,
    prefetch: undefined,
    planMap: new Map(),
    lastSec: new Map(),
    lastUnit: new Map(),
    lastRound: new Map(),
    lastPhaseName: new Map(),
    lastRemainSec: new Map(),
    speakKey: new Map(),
    speakAt: new Map(),
  } as TLBus;
}
const BUS = g.__TL_BUS__ as TLBus;

let __paintScheduled = false;
function flushToUI() {
  BUS.stateUpdaters.forEach(set => { try { set({ ...BUS.flowsCache }); } catch {} });
}
function schedulePaint() {
  if (__paintScheduled) return;
  __paintScheduled = true;
  const raf = (typeof requestAnimationFrame === "function")
    ? requestAnimationFrame
    : (cb: any) => setTimeout(cb, 16);
  raf(() => { __paintScheduled = false; flushToUI(); });
}


function ensureBusShape() {
  BUS.flowsCache     ||= {};
  BUS.stateUpdaters  ||= new Set();
  BUS.eventListeners ||= new Set();
  BUS.audioWired     ||= false;
  BUS.audio = BUS.audio ?? undefined;
  BUS.prefetch = BUS.prefetch ?? undefined;
  BUS.planMap        ||= new Map();
  BUS.lastSec        ||= new Map();
  BUS.lastUnit       ||= new Map();
  BUS.lastRound      ||= new Map();
  BUS.lastPhaseName  ||= new Map();
  BUS.lastRemainSec  ||= new Map();
  BUS.speakKey       ||= new Map();
  BUS.speakAt        ||= new Map();
}
ensureBusShape();

function defaultView(flowId: string): FlowView {
  return { flowId, title: "", phaseName: "", unitIndex: 0, roundIndex: 0, remainingMs: 0, done: false, paused: false, addedMs: 0 };
}

async function wireAudioOnce() {
  if (BUS.audioWired) return;
  const [{ AudioEngine }, { Prefetcher }] = await Promise.all([
    import("../_lib/audio"),
    import("../_lib/prefetcher"),
  ]);
  BUS.audio = new AudioEngine();
  BUS.prefetch = new Prefetcher(BUS.audio);
  BUS.audioWired = true;
  (globalThis as any).__TL_AUDIO__ = BUS.audio; // 供解锁
}

function ensureWorker() {
  if (BUS.worker) return;
  BUS.worker = new Worker(new URL("../_workers/timerWorker.ts", import.meta.url), { type: "module" });
  BUS.worker.onmessage = (e: MessageEvent<Event>) => {
    const ev: any = e.data;
    const next = { ...BUS.flowsCache };
    switch (ev.type) {
      case "FLOW_PHASE_ENTER": {
        const cur = next[ev.flowId] ?? defaultView(ev.flowId);
        cur.phaseName = ev.phaseName;
        cur.unitIndex = ev.unitIndex;
        cur.roundIndex = ev.roundIndex;
        cur.remainingMs = ev.remainingMs;
        cur.done = false;
        (cur as any).addedMs = ev.addedMs ?? 0;
        next[ev.flowId] = cur;
        BUS.lastPhaseName.set(ev.flowId, ev.phaseName);
        BUS.lastRemainSec.set(ev.flowId, Math.max(0, Math.ceil(ev.remainingMs/1000)));
        break;
      }
      case "FLOW_TICK": {
        const cur = next[ev.flowId] ?? defaultView(ev.flowId);
        cur.remainingMs = ev.remainingMs;
        cur.phaseName = ev.phaseName ?? cur.phaseName;
        cur.unitIndex = ev.unitIndex ?? cur.unitIndex;
        cur.roundIndex = ev.roundIndex ?? cur.roundIndex;
        (cur as any).addedMs = ev.addedMs ?? (cur as any).addedMs ?? 0;
        next[ev.flowId] = cur;
        BUS.lastPhaseName.set(ev.flowId, cur.phaseName);
        BUS.lastRemainSec.set(ev.flowId, Math.max(0, Math.ceil(ev.remainingMs/1000)));
        break;
      }
      case "FLOW_STATE": {
        const cur = next[ev.flowId] ?? defaultView(ev.flowId);
        cur.paused = ev.paused as any;
        cur.done = ev.done as any;
        next[ev.flowId] = cur;
        break;
      }
      case "FLOW_DONE": {
        const cur = next[ev.flowId];
        if (cur) cur.done = true;
        break;
      }
      case "ERROR": {
        console.error("[Worker ERROR]", ev.flowId, ev.message);
        break;
      }
    }
    BUS.flowsCache = next;
    schedulePaint();
    // 音频导演（统一处理播报/蜂鸣）
    audioHandle(e.data as any);
    BUS.eventListeners.forEach(fn => { try { fn(e.data); } catch {} });
  };
}

function maybeSpeak(fid: string, unitIndex: number) {
  if (!BUS.audioWired || !BUS.audio) return;
  const r = BUS.lastRound.get(fid) ?? 0;
  const key = r + "|" + unitIndex;
  const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  const lastKey = BUS.speakKey.get(fid);
  const lastAt  = BUS.speakAt.get(fid) ?? 0;
  if (key === lastKey && (now - lastAt) < 300) return; // 300ms 去重
  BUS.speakKey.set(fid, key);
  BUS.speakAt.set(fid, now);
  const plan = BUS.planMap.get(fid);
  const unit = plan?.units?.[unitIndex];
  if (unit?.say && String(unit.say).trim()) BUS.audio.speak?.(unit.say);
  else BUS.audio.beep?.();
}

function audioHandle(ev: any) {
  if (!BUS.audioWired || !BUS.audio) return;
  const fid = ev.flowId;
  if (!fid) return;
  const sec = typeof ev.remainingMs === "number" ? Math.max(0, Math.ceil(ev.remainingMs/1000)) : undefined;

  if (ev.type === "FLOW_PHASE_ENTER") {
    BUS.lastUnit.set(fid, ev.unitIndex ?? 0);
    BUS.lastRound.set(fid, ev.roundIndex ?? 0);
    maybeSpeak(fid, ev.unitIndex ?? 0);
    BUS.lastSec.delete(fid);
  }

  if (ev.type === "FLOW_TICK") {
    const uRaw = ev.unitIndex;
    const rRaw = ev.roundIndex;
    const prevU = BUS.lastUnit.get(fid);
    const prevR = BUS.lastRound.get(fid);

    // 单元变化 → 讲话
    if (typeof uRaw === "number" && uRaw !== prevU) {
      BUS.lastUnit.set(fid, uRaw);
      maybeSpeak(fid, uRaw);
      BUS.lastSec.delete(fid);
    }
    // 轮次变化 → 讲话
    if (typeof rRaw === "number" && rRaw !== prevR) {
      BUS.lastRound.set(fid, rRaw);
      const idx = typeof uRaw === "number" ? uRaw : 0;
      BUS.lastUnit.set(fid, idx);
      maybeSpeak(fid, idx);
      BUS.lastSec.delete(fid);
    }

    // 最后三秒蜂鸣（跟随最新 remaining 秒）
    const prevSec = BUS.lastSec.get(fid);
    if (typeof sec === "number" && sec !== prevSec) {
      BUS.lastSec.set(fid, sec);
      if (sec > 0 && sec <= 3) BUS.audio.beep?.();
      if (sec === 0) BUS.lastSec.delete(fid);
    }
  }

  if (ev.type === "FLOW_DONE") {
    BUS.lastSec.delete(fid);
    BUS.lastUnit.delete(fid);
    BUS.lastRound.delete(fid);
    BUS.audio.beep?.();
  }
}

function send(cmd: Command) {
  ensureWorker();
  BUS.worker!.postMessage(cmd);
}

export function useTimerClient(onEvent?: (ev: Event) => void) {
  const [flows, setFlows] = useState<Record<string, FlowView>>(() => BUS.flowsCache);

  useEffect(() => {
    ensureWorker();
    wireAudioOnce().catch(()=>{});
    BUS.stateUpdaters.add(setFlows);
    if (onEvent) BUS.eventListeners.add(onEvent);
    return () => {
      BUS.stateUpdaters.delete(setFlows);
      if (onEvent) BUS.eventListeners.delete(onEvent);
    };
  }, [onEvent]);

  return {
    flows,
    start: (flowId: string, plan: PlanSpec) => {
      ensureBusShape();
      BUS.planMap.set(flowId, plan);
      BUS.lastSec.delete(flowId);
      BUS.lastUnit.delete(flowId);
      BUS.lastRound.delete(flowId);
      BUS.lastPhaseName.delete(flowId);
      BUS.lastRemainSec.delete(flowId);
      BUS.speakKey.delete(flowId);
      BUS.speakAt.delete(flowId);
      BUS.prefetch?.onStart?.(flowId, plan);
      send({ type: "START", flowId, payload: plan } as any);
    },
    pause: (flowId: string) => send({ type: "PAUSE", flowId } as any),
    resume: (flowId: string) => send({ type: "RESUME", flowId } as any),
    stop: (flowId: string) => {
      // 本地先清视图 → UI 立即回到“未开始”
      try {
        delete BUS.flowsCache[flowId];
        BUS.stateUpdaters.forEach(set => set({ ...BUS.flowsCache }));
      } catch {}
      // 清理音频上下文计数
      BUS.lastSec.delete(flowId);
      BUS.lastUnit.delete(flowId);
      BUS.lastRound.delete(flowId);
      BUS.lastPhaseName.delete(flowId);
      BUS.lastRemainSec.delete(flowId);
      BUS.speakKey.delete(flowId);
      BUS.speakAt.delete(flowId);
      send({ type: "STOP", flowId } as any);
    },
    nextUnit: (flowId: string) => send({ type: "NEXT_UNIT", flowId } as any),
    nextRound: (flowId: string) => send({ type: "NEXT_ROUND", flowId } as any),
    adjustTime: (flowId: string, { deltaSec, setSec }: { deltaSec?: number; setSec?: number }) =>
      send({ type: "ADJUST_TIME", flowId, scope: "current", deltaSec, setSec } as any),
    registerPlanForAudio: (flowId: string, plan: PlanSpec) => { BUS.planMap.set(flowId, plan); },
  };
}

export function unlockGlobalAudio() {
  const a = (g.__TL_AUDIO__ ?? BUS.audio);
  if (!a) return;
  const fn =
    (typeof a.unlock === "function" && a.unlock) ||
    (typeof a.resume === "function" && a.resume) ||
    (typeof a.ensureUnlocked === "function" && a.ensureUnlocked) ||
    (a.audioContext && typeof a.audioContext.resume === "function" && a.audioContext.resume);
  if (fn) fn.call(a);
}
