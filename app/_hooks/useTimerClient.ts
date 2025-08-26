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
function schedulePaint() {
    if (__paintScheduled) return;
    __paintScheduled = true;
    const raf = (typeof requestAnimationFrame === "function") ? requestAnimationFrame : (cb: any) => setTimeout(cb, 16);
    raf(() => {
        __paintScheduled = false;
        try {
            BUS.stateUpdaters.forEach(set => { try { set({ ...(BUS.flowsCache || {}) }); } catch { } });
        } catch { }
    });
}

function ensureBusShape() {
    BUS.flowsCache ||= {};
    BUS.stateUpdaters ||= new Set();
    BUS.eventListeners ||= new Set();
    BUS.audioWired ||= false;
    BUS.audio = BUS.audio ?? undefined;
    BUS.prefetch = BUS.prefetch ?? undefined;
    BUS.planMap ||= new Map();
    BUS.lastSec ||= new Map();
    BUS.lastUnit ||= new Map();
    BUS.lastRound ||= new Map();
    BUS.lastPhaseName ||= new Map();
    BUS.lastRemainSec ||= new Map();
    BUS.speakKey ||= new Map();
    BUS.speakAt ||= new Map();
}
ensureBusShape();

function defaultView(flowId: string): FlowView {
    return { flowId, title: "", phaseName: "", unitIndex: 0, roundIndex: 0, remainingMs: 0, done: false, paused: false, addedMs: 0 };
}
function applyHotOverrides(ev: any) {
    const fid = ev?.flowId;
    if (!fid) return;

    const plan = BUS.planMap.get(fid);
    if (!plan) return;

    // A) 切入新单元时，把该单元“总时长”校正为最新草稿的秒数
    if (ev.type === "FLOW_PHASE_ENTER") {
        const idx = typeof ev.unitIndex === "number" ? ev.unitIndex : 0;
        const want = Math.max(1, Number(plan.units?.[idx]?.seconds) || 1);
        const got = Math.max(0, Math.ceil((ev.remainingMs ?? 0) / 1000));
        if (want && want !== got) {
            // 用 setSec 直接把“本轮·当前单元”的剩余时间设为最新配置
            send({ type: "ADJUST_TIME", flowId: fid, scope: "current", setSec: want } as any);
        }
        return;
    }

    // B) 轮次“到顶”时，如果最新 plan 的总轮数更大 → 继续下一轮（不中断）
    if (ev.type === "FLOW_DONE" || (ev.type === "FLOW_STATE" && ev.done)) {
        const curRound = Math.max(1, (BUS.lastRound.get(fid) ?? 0) + 1);
        const total = Math.max(1, Number((plan as any).rounds) || 1);
        if (curRound < total) {
            // 还有余轮：让 worker 进入下一轮（不 STOP / START）
            send({ type: "NEXT_ROUND", flowId: fid } as any);
        }
        return;
    }
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


function dispatchFromWorker(ev: any) {
    const cache = (BUS && BUS.flowsCache && typeof BUS.flowsCache === "object") ? BUS.flowsCache : {};
    const next: Record<string, FlowView> = { ...(cache as any) };

    // 没有事件类型就不处理，避免 undefined 触发
    if (!ev || typeof ev !== "object" || !("type" in ev)) return;

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
            BUS.lastRemainSec.set(ev.flowId, Math.max(0, Math.ceil(ev.remainingMs / 1000)));
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
            BUS.lastRemainSec.set(ev.flowId, Math.max(0, Math.ceil(ev.remainingMs / 1000)));
            break;
        }
        case "FLOW_STATE": {
            const cur = next[ev.flowId] ?? defaultView(ev.flowId);
            cur.paused = !!ev.paused;
            cur.done = !!ev.done;
            next[ev.flowId] = cur;
            break;
        }
        case "FLOW_DONE": {
            const cur = next[ev.flowId];
            if (cur) cur.done = true;
            break;
        }
        case "ERROR": {
            console.warn("[timer worker ERROR]", ev?.message || ev);
            // 不更新 UI
            return;
        }
        default: {
            console.warn("[timer worker] unknown message", ev);
            return;
        }
    }

    BUS.flowsCache = next;
    schedulePaint();
    audioHandle(ev);
    BUS.eventListeners.forEach(fn => { try { fn(ev); } catch { } });
}


function ensureWorker() {
    // 只有在已经成功创建过 worker 时才直接返回
    if (BUS.worker) return;

    try {
        const w = new Worker(new URL("./timerWorker.ts", import.meta.url), { type: "module" });
        w.onmessage = (e) => { try { dispatchFromWorker(e.data as any); } catch { } };
        w.onerror = (e) => console.warn("[timer] worker error:", e);
        w.onmessageerror = (e) => console.warn("[timer] worker msgerror:", e);
        BUS.worker = w;
    } catch (e) {
        console.warn("[timer] Worker 创建失败，将使用本地兜底计时。原因：", e);
        BUS.worker = null; // 允许下次再尝试
    }
}
function maybeSpeak(fid: string, unitIndex: number) {
    if (!BUS.audioWired || !BUS.audio) return;
    const r = BUS.lastRound.get(fid) ?? 0;
    const key = r + "|" + unitIndex;
    const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const lastKey = BUS.speakKey.get(fid);
    const lastAt = BUS.speakAt.get(fid) ?? 0;
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
    const sec = typeof ev.remainingMs === "number" ? Math.max(0, Math.ceil(ev.remainingMs / 1000)) : undefined;

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
// ---- Local fallback engine (no worker) ----
const Local = (() => {
    type T = {
        timers: Map<string, number>;
        views: Record<string, FlowView>;
        start(fid: string, plan: PlanSpec): void;
        pause(fid: string): void;
        resume(fid: string): void;
        stop(fid: string): void;
        nextUnit(fid: string): void;
        nextRound(fid: string): void;
        adjust(fid: string, deltaSec?: number, setSec?: number): void;
        syncPlan(fid: string, plan: PlanSpec): void;
    };

    const timers = new Map<string, number>();

    function getView(fid: string): FlowView {
        const cur = BUS.flowsCache[fid] ?? defaultView(fid);
        BUS.flowsCache[fid] = cur;
        return cur;
    }

    function tick(fid: string) {
        const v = getView(fid);
        if (v.done || v.paused) return;
        v.remainingMs = Math.max(0, v.remainingMs - 250);

        // 倒计时到 0 → 进入下一个单元
        if (v.remainingMs === 0) {
            Local.nextUnit(fid);
        }
        schedulePaint();
    }

    const api: T = {
        timers,
        views: BUS.flowsCache,

        start(fid, plan) {
            if (!plan || !Array.isArray(plan.units) || plan.units.length === 0) {
                alert("当前流程没有单元，请先添加单元再开始。");
                return;
            }
            BUS.planMap.set(fid, plan);

            // 初始化视图
            const v = getView(fid);
            v.title = plan.title || "";
            v.unitIndex = 0;
            v.roundIndex = 0;
            v.phaseName = plan.units[0]?.name || "";
            v.remainingMs = Math.max(1, Number(plan.units[0]?.seconds) || 1) * 1000;
            v.paused = false;
            v.done = false;
            (v as any).addedMs = 0;

            // 启动 250ms tick
            if (timers.has(fid)) clearInterval(timers.get(fid)!);
            timers.set(fid, window.setInterval(() => tick(fid), 250));

            schedulePaint();
        },

        pause(fid) {
            const v = getView(fid);
            v.paused = true;
            schedulePaint();
        },

        resume(fid) {
            const v = getView(fid);
            v.paused = false;
            schedulePaint();
        },

        stop(fid) {
            if (timers.has(fid)) { clearInterval(timers.get(fid)!); timers.delete(fid); }
            // 清视图，保持和你原来 stop 的 UI 体验一致
            try { delete BUS.flowsCache[fid]; } catch { }
            BUS.lastSec.delete(fid);
            BUS.lastUnit.delete(fid);
            BUS.lastRound.delete(fid);
            BUS.lastPhaseName.delete(fid);
            BUS.lastRemainSec.delete(fid);
            BUS.speakKey.delete(fid);
            BUS.speakAt.delete(fid);
            schedulePaint();
        },

        nextUnit(fid) {
            const plan = BUS.planMap.get(fid);
            if (!plan) return;

            const v = getView(fid);
            const units = plan.units || [];
            let u = v.unitIndex;
            let r = v.roundIndex;
            u += 1;

            if (u >= units.length) {
                // 下一轮
                u = 0;
                r += 1;
                const total = Math.max(1, Number(plan.rounds) || 1);
                if (r >= total) {
                    v.done = true;
                    if (timers.has(fid)) { clearInterval(timers.get(fid)!); timers.delete(fid); }
                    schedulePaint();
                    return;
                }
            }

            v.unitIndex = u;
            v.roundIndex = r;
            v.phaseName = units[u]?.name || "";
            v.remainingMs = Math.max(1, Number(units[u]?.seconds) || 1) * 1000;
            (v as any).addedMs = 0;
            schedulePaint();
        },

        nextRound(fid) {
            const plan = BUS.planMap.get(fid);
            if (!plan) return;
            const v = getView(fid);
            v.unitIndex = (plan.units?.length ? 0 : 0);
            v.roundIndex += 1;
            const total = Math.max(1, Number(plan.rounds) || 1);
            if (v.roundIndex >= total) {
                v.done = true;
                if (timers.has(fid)) { clearInterval(timers.get(fid)!); timers.delete(fid); }
            } else {
                const u = v.unitIndex;
                v.phaseName = plan.units?.[u]?.name || "";
                v.remainingMs = Math.max(1, Number(plan.units?.[u]?.seconds) || 1) * 1000;
            }
            schedulePaint();
        },

        adjust(fid, deltaSec, setSec) {
            const v = getView(fid);
            if (typeof setSec === "number") {
                v.remainingMs = Math.max(0, setSec) * 1000;
                (v as any).addedMs = 0;
            } else if (typeof deltaSec === "number") {
                v.remainingMs = Math.max(0, v.remainingMs + deltaSec * 1000);
                (v as any).addedMs = ((v as any).addedMs || 0) + deltaSec * 1000;
            }
            schedulePaint();
        },

        syncPlan(fid, plan) {
            // 仅更新快照，下一单元/下一轮即会生效
            BUS.planMap.set(fid, plan);
        },
    };

    return api;
})();

function send(cmd: Command) {
    ensureWorker();

    // 无 worker：走本地兜底，不抛错
    if (!BUS.worker) {
        const { type, flowId } = (cmd as any) || {};
        switch (type) {
            case "START": return Local.start(flowId, (cmd as any).payload);
            case "PAUSE": return Local.pause(flowId);
            case "RESUME": return Local.resume(flowId);
            case "STOP": return Local.stop(flowId);
            case "NEXT_UNIT": return Local.nextUnit(flowId);
            case "NEXT_ROUND": return Local.nextRound(flowId);
            case "ADJUST_TIME": return Local.adjust(flowId, (cmd as any).deltaSec, (cmd as any).setSec);
            default: return console.warn("[local] unknown cmd", cmd);
        }
    }

    try {
        BUS.worker.postMessage(cmd);
    } catch (e) {
        console.warn("[timer] postMessage 失败，改用本地兜底。", e);
        // 失败则兜底一次
        const { type, flowId } = (cmd as any) || {};
        if (type === "START") Local.start(flowId, (cmd as any).payload);
    }
}


const syncPlan = (flowId: string, plan: PlanSpec) => {
    try { BUS.planMap.set(flowId, plan); } catch { }
};

export function useTimerClient(onEvent?: (ev: Event) => void) {
    const [flows, setFlows] = useState<Record<string, FlowView>>(() => BUS.flowsCache);

    useEffect(() => {
        ensureWorker();
        wireAudioOnce().catch(() => { });
        BUS.stateUpdaters.add(setFlows);
        if (onEvent) BUS.eventListeners.add(onEvent);
        return () => {
            BUS.stateUpdaters.delete(setFlows);
            if (onEvent) BUS.eventListeners.delete(onEvent);
        };
    }, [onEvent]);

    return {
        flows,
        start: (flowId: string, plan?: PlanSpec) => {
            ensureWorker();

            let p: PlanSpec | undefined = plan ?? BUS.planMap.get(flowId);
            if (!p || !Array.isArray(p.units) || p.units.length === 0) {
                try {
                    const raw = localStorage.getItem(`plan:${flowId}`);
                    if (raw) {
                        const parsed = JSON.parse(raw) as PlanSpec;
                        if (Array.isArray(parsed.units) && parsed.units.length > 0) {
                            p = parsed;
                        }
                    }
                } catch { }
            }

            if (!p || !Array.isArray(p.units) || p.units.length === 0) {
                console.warn("[timer] start 被调用，但未找到有效 plan.units");
                alert("当前流程没有单元，请先在详情页添加单元后再开始。");
                return;
            }

            console.log("[timer] START", flowId, p);

            BUS.planMap.set(flowId, p);
            BUS.lastSec.delete(flowId);
            BUS.lastUnit.delete(flowId);
            BUS.lastRound.delete(flowId);
            BUS.lastPhaseName.delete(flowId);
            BUS.lastRemainSec.delete(flowId);
            BUS.speakKey.delete(flowId);
            BUS.speakAt.delete(flowId);

            BUS.prefetch?.onStart?.(flowId, p);
            send({ type: "START", flowId, payload: p } as any);
        },

        pause: (flowId: string) => send({ type: "PAUSE", flowId }),
        resume: (flowId: string) => send({ type: "RESUME", flowId }),
        stop: (flowId: string) => {
            // 本地先清视图
            try {
                delete BUS.flowsCache[flowId];
                BUS.stateUpdaters.forEach(set => set({ ...BUS.flowsCache }));
            } catch { }

            // 清理音频/计数
            BUS.lastSec.delete(flowId);
            BUS.lastUnit.delete(flowId);
            BUS.lastRound.delete(flowId);
            BUS.lastPhaseName.delete(flowId);
            BUS.lastRemainSec.delete(flowId);
            BUS.speakKey.delete(flowId);
            BUS.speakAt.delete(flowId);

            send({ type: "STOP", flowId } as any);
        },
        nextUnit: (flowId: string) => send({ type: "NEXT_UNIT", flowId }),
        nextRound: (flowId: string) => send({ type: "NEXT_ROUND", flowId }),
        adjustTime: (flowId: string, p: { deltaSec?: number; setSec?: number }) =>
            send({ type: "ADJUST_TIME", flowId, scope: "current", ...p }),

        registerPlanForAudio: (flowId: string, plan: PlanSpec) => { BUS.planMap.set(flowId, plan); },

        // ⬇️⬇️ 新增：页面/Store 改了 plan，就把“新计划”同步给 Worker
        syncPlan: (flowId: string, plan: PlanSpec) => {
            BUS.planMap.set(flowId, plan);               // 给播报/下一单元用
            send({ type: "SYNC_PLAN", flowId, payload: plan });  // 让 worker 引擎更新
        },
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
