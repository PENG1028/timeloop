"use client";
import { useEffect, useState } from "react";
import type { Command, Event, PlanSpec } from "../_types/timer";

/* ===== 视图模型 ===== */
type FlowView = {
  flowId: string;
  title: string;
  phaseName: string;
  unitIndex: number;
  roundIndex: number;
  remainingMs: number;
  done: boolean;
  paused: boolean;
};

/* ===== 全局总线（HMR/路由安全） ===== */
type TLBus = {
  worker: Worker | null;
  flowsCache: Record<string, FlowView>;
  stateUpdaters: Set<(s: Record<string, FlowView>) => void>;
  eventListeners: Set<(ev: Event) => void>;
  // 音频
  audioWired: boolean;
  audio?: any;      // AudioEngine
  prefetch?: any;   // Prefetcher
  // 播报所需上下文
  planMap: Map<string, PlanSpec>;
  lastSec: Map<string, number>;
  lastUnit: Map<string, number>;
  lastRound: Map<string, number>;
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
  } as TLBus;
}
const BUS = g.__TL_BUS__ as TLBus;

function ensureBusShape() {
  BUS.flowsCache     ||= {};
  BUS.stateUpdaters  ||= new Set();
  BUS.eventListeners ||= new Set();
  BUS.planMap        ||= new Map();
  BUS.lastSec        ||= new Map();
  BUS.lastUnit       ||= new Map();
  BUS.lastRound      ||= new Map();
  // 新增：作为兜底的辅助信号
  BUS.lastRemainSec  ||= new Map();   // 每 flow 最近一次剩余秒
  BUS.lastPhaseName  ||= new Map();   // 每 flow 最近一次阶段名（单元名）
  if (BUS.audioWired && !BUS.audio) BUS.audioWired = false;
}
ensureBusShape();

function defaultView(flowId: string): FlowView {
  return { flowId, title: "", phaseName: "", unitIndex: 0, roundIndex: 0, remainingMs: 0, done: false, paused: false };
}

/* ===== 音频初始化（仅一次） ===== */
async function wireAudioOnce() {
  if (BUS.audioWired) return;
  const [{ AudioEngine }, { Prefetcher }] = await Promise.all([
    import("../_lib/audio"),
    import("../_lib/prefetcher"),
  ]);
  BUS.audio = new AudioEngine();
  BUS.prefetch = new Prefetcher(BUS.audio);
  BUS.audioWired = true;
  g.__TL_AUDIO__ = BUS.audio; // 给页面按钮解锁用
}

/* ===== 统一：FLOW事件 → 说话/蜂鸣 映射 ===== */
function audioHandle(ev: Event) {
  if (!BUS.audioWired || !BUS.audio) return;

  const type = (ev as any)?.type;
  const fid  = (ev as any).flowId;

  // 统一字段
  const name = (ev as any).phaseName ?? (ev as any).unitName ?? BUS.lastPhaseName.get(fid) ?? "";
  const uRaw = (ev as any).unitIndex ?? (ev as any).unit ?? (ev as any).idx;
  const rRaw = (ev as any).roundIndex ?? (ev as any).round ?? (ev as any).loop;

  // —— 1) 进入新单元：PHASE_ENTER 优先；否则用 unitIndex 变化 / 阶段名变化 / “剩余秒回升”兜底 ——
  if (type === "FLOW_PHASE_ENTER") {
    BUS.lastUnit.set(fid, (ev as any).unitIndex ?? 0);
    BUS.lastRound.set(fid, (ev as any).roundIndex ?? 0);
    speakUnit(fid, (ev as any).unitIndex ?? 0);
    BUS.lastSec.delete(fid);
  }

  if (type === "FLOW_TICK") {
    const prevU = BUS.lastUnit.get(fid);
    const u = (typeof uRaw === "number") ? uRaw : prevU ?? 0;

    const prevName = BUS.lastPhaseName.get(fid);
    const prevSec  = BUS.lastRemainSec.get(fid);
    const sec      = Math.max(0, Math.ceil((ev as any).remainingMs / 1000));

    // 兜底1：unitIndex 变化
    if (prevU === undefined || prevU !== u) {
      BUS.lastUnit.set(fid, u);
      speakUnit(fid, u);
      BUS.lastSec.delete(fid);
    }
    // 兜底2：阶段名变化
    else if (name && prevName !== undefined && name !== prevName) {
      BUS.lastPhaseName.set(fid, name);
      speakUnit(fid, u);
      BUS.lastSec.delete(fid);
    }
    // 兜底3：剩余秒“回升”（例如切到下一单元/被调整 setSec 更大）
    else if (typeof prevSec === "number" && sec > prevSec + 1) {
      speakUnit(fid, u);
      BUS.lastSec.delete(fid);
    }

    // 最后三秒蜂鸣：任何时刻都以当前剩余秒为准，支持 adjustTime 后即时生效
    if (sec !== prevSec) {
      BUS.lastRemainSec.set(fid, sec);
      if (sec > 0 && sec <= 3) BUS.audio.beep?.();
      if (sec === 0) BUS.lastSec.delete(fid);
    }
  }

  // —— 2) 进入新一轮：事件/兜底都处理 —— 
  if (type === "FLOW_ROUND_ENTER" || type === "ROUND_ENTER") {
    const r = (typeof rRaw === "number") ? rRaw : ((BUS.lastRound.get(fid) ?? -1) + 1);
    BUS.lastRound.set(fid, r);
    const idx = (ev as any).unitIndex ?? 0;
    BUS.lastUnit.set(fid, idx);
    speakUnit(fid, idx);
    BUS.lastSec.delete(fid);
  }

  // 如果 tick 时 roundIndex 有变化，也视为新一轮（不少实现是这样）
  if (type === "FLOW_TICK" && typeof rRaw === "number") {
    const prevR = BUS.lastRound.get(fid);
    if (prevR === undefined || prevR !== rRaw) {
      BUS.lastRound.set(fid, rRaw);
      const idx = (ev as any).unitIndex ?? 0;
      BUS.lastUnit.set(fid, idx);
      speakUnit(fid, idx);
      BUS.lastSec.delete(fid);
    }
  }

  if (type === "FLOW_DONE") {
    BUS.lastSec.delete(fid);
    BUS.lastUnit.delete(fid);
    BUS.lastRound.delete(fid);
    BUS.audio.beep?.();
  }

  // 记住最新名字（供下次比较）
  if (name) BUS.lastPhaseName.set(fid, name);
}

// 读 plan 中的 say 并播报；没有 say 就轻蜂鸣
function speakUnit(flowId: string, unitIndex: number) {
  const plan = BUS.planMap.get(flowId);
  const unit = plan?.units?.[unitIndex];
  if (!unit) return;
  if (unit.say && String(unit.say).trim().length > 0) BUS.audio!.speak?.(unit.say);
  else BUS.audio!.beep?.();
}

/* ===== Worker 驱动 ===== */
function ensureWorker() {
  if (BUS.worker) return;
  BUS.worker = new Worker(new URL("../_workers/timerWorker.ts", import.meta.url), { type: "module" });
  BUS.worker.onmessage = (e: MessageEvent<Event>) => {
    const ev = e.data;

    // 更新缓存 （尽量宽容不同字段名）
    const next = { ...BUS.flowsCache };
    switch ((ev as any).type) {
      case "FLOW_PHASE_ENTER": {
        const cur = next[(ev as any).flowId] ?? defaultView((ev as any).flowId);
        cur.phaseName = (ev as any).phaseName;
        cur.unitIndex = (ev as any).unitIndex;
        cur.roundIndex = (ev as any).roundIndex;
        cur.remainingMs = (ev as any).totalMs;
        cur.done = false;
        next[(ev as any).flowId] = cur; break;
      }
      case "FLOW_TICK": {
  const cur = next[(ev as any).flowId] ?? defaultView((ev as any).flowId);

  // 宽容解析不同实现的字段名
  const name = (ev as any).phaseName ?? (ev as any).unitName ?? cur.phaseName ?? "";
  const uRaw = (ev as any).unitIndex ?? (ev as any).unit ?? (ev as any).idx;
  const rRaw = (ev as any).roundIndex ?? (ev as any).round ?? (ev as any).loop;

  // 单元索引：优先用事件字段，否则沿用上次
  const prevU = cur.unitIndex ?? 0;
  const u = (typeof uRaw === "number") ? uRaw : prevU;

  // 轮次：优先用事件字段；否则当“unit 从大跳到小”（如末尾→0）时推断为新一轮
  const prevR = cur.roundIndex ?? 0;
  let r = (typeof rRaw === "number") ? rRaw : prevR;
  if (typeof uRaw !== "number" && u < prevU) {
    r = prevR + 1; // 推断：新一轮
  }

  cur.phaseName  = name;
  cur.unitIndex  = u;
  cur.roundIndex = r;
  cur.remainingMs = (ev as any).remainingMs;
  next[(ev as any).flowId] = cur;

  // 记录辅助信号（供 audioHandle 兜底）
  BUS.lastPhaseName.set((ev as any).flowId, name);
  BUS.lastRemainSec.set((ev as any).flowId, Math.max(0, Math.ceil((ev as any).remainingMs / 1000)));
  break;
}
      case "FLOW_STATE": {
        const cur = next[(ev as any).flowId] ?? defaultView((ev as any).flowId);
        cur.paused = (ev as any).paused;
        cur.done = (ev as any).done;
        next[(ev as any).flowId] = cur; break;
      }
      case "FLOW_DONE": {
        const cur = next[(ev as any).flowId];
        if (cur) cur.done = true;
        break;
      }
      case "ERROR":
        console.error("[Worker ERROR]", (ev as any).flowId, (ev as any).message);
        break;
    }
    BUS.flowsCache = next;

    // 先通知 UI
    BUS.stateUpdaters.forEach(set => { try { set(BUS.flowsCache); } catch {} });

    // 统一音频映射（不会因切页而中断/重复）
    audioHandle(ev);

    // 用户自定义监听（若页面还要听）
    BUS.eventListeners.forEach(fn => { try { fn(ev); } catch {} });
  };
}
function send(cmd: Command) { ensureWorker(); BUS.worker!.postMessage(cmd); }

/* ===== 导出的 Hook/方法 ===== */
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
    // 开始：记录 plan → 供播报使用；预取保留
    start: (flowId: string, plan: PlanSpec) => {
  ensureBusShape();
  BUS.planMap.set(flowId, plan);
  BUS.lastSec.delete(flowId);
  BUS.lastUnit.delete(flowId);
  BUS.lastRound.delete(flowId);
  BUS.lastPhaseName.delete(flowId);
  BUS.lastRemainSec.delete(flowId);
  BUS.prefetch?.onStart?.(flowId, plan);
  send({ type: "START", flowId, payload: plan });
},
    pause:  (flowId: string) => { send({ type: "PAUSE",  flowId }); },
    resume: (flowId: string) => { send({ type: "RESUME", flowId }); },
    stop: (flowId: string) => {
  ensureBusShape();
  BUS.lastSec.delete(flowId);
  BUS.lastUnit.delete(flowId);
  BUS.lastRound.delete(flowId);
  BUS.lastPhaseName.delete(flowId);
  BUS.lastRemainSec.delete(flowId);
  send({ type: "STOP", flowId });
},
    nextUnit:  (flowId: string) => send({ type: "NEXT_UNIT", flowId }),
    nextRound: (flowId: string) => send({ type: "NEXT_ROUND", flowId }),
    adjustTime:(flowId: string, { deltaSec, setSec }: { deltaSec?: number; setSec?: number }) =>
      send({ type: "ADJUST_TIME", flowId, scope: "current", deltaSec, setSec }),

    // 若在运行中更新了模板/流程（比如修改某单元的 say），用这个同步到全局播报
    registerPlanForAudio: (flowId: string, plan: PlanSpec) => { BUS.planMap.set(flowId, plan); },
  };
}

/* 全局解锁：页面按钮调用一次即可 */
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
