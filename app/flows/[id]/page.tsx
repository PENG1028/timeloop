"use client";
// app/flows/[id]/page.tsx

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFlowStore } from "../../_store/flows";
import { useTimerClient, unlockGlobalAudio } from "../../_hooks/useTimerClient";
import type { PlanSpec } from "../../_types/timer";
import PlanEditor, { type PlanDraft } from "../../_components/PlanEditor";
import { formatDurationEn, formatCountdownClock } from "../../_lib/duration";
import RoundsStepper from "../../_components/RoundsStepper";

// ===== Simple speech =====
class SpeechController {
  private token = 0;
  play(text: string, opts?: { lang?: string; rate?: number; pitch?: number; voiceHint?: string }) {
    if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const id = ++this.token;
    const synth = window.speechSynthesis;
    try { synth.cancel(); } catch { }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts?.lang ?? "zh-CN";
    u.rate = opts?.rate ?? 1;
    u.pitch = opts?.pitch ?? 1;
    try {
      const voices = synth.getVoices();
      const pick = voices.find(v => (opts?.voiceHint ? v.name === opts.voiceHint : v.lang?.startsWith(u.lang)));
      if (pick) u.voice = pick;
    } catch { }
    synth.speak(u);
  }
  stop() {
    this.token++;
    try { window.speechSynthesis?.cancel?.(); } catch { }
  }
}
const speech = typeof window !== "undefined"
  ? ((window as any).__speechCtl ?? ((window as any).__speechCtl = new SpeechController()))
  : null;

function msToSec(ms: number) {
  return Math.max(0, Math.ceil(ms / 1000));
}

export default function FlowDetailEditPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const store = useFlowStore();
  const { flows, start, pause, resume, stop, adjustTime, syncPlan } = useTimerClient();

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [stoppedFlags, setStoppedFlags] = useState<Record<string, boolean>>({});
  const markStopped = useCallback((fid: string, val: boolean) => {
    setStoppedFlags(prev => ({ ...prev, [fid]: val }));
  }, []);

  const plan = store.getFlowPlan(params.id);

  // —— 恢复 plan（先尝试当前 id；没有就找任一已有 plan 并修正路由）——
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    if (plan) return;
    let cancelled = false;

    (async () => {
      // 先看本地有没有“当前 id”的数据，有才进入 restoring
      const raw = localStorage.getItem(`plan:${params.id}`);

      if (raw) {
        setRestoring(true);
        try {
          const parsed = JSON.parse(raw) as PlanSpec;
          if (!cancelled) {
            store.updateFlowPlan(params.id, parsed);
            store.attachFlow(params.id);
          }
        } catch { }
        if (!cancelled) setRestoring(false);
        return;
      }

      // 找不到当前 id，再尝试找一个 fallback（不进入 restoring，避免骨架闪）
      try {
        let fallbackId: string | null = null;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || "";
          if (k.startsWith("plan:")) { fallbackId = k.slice(5); break; }
        }
        if (!cancelled && fallbackId && fallbackId !== params.id) {
          router.replace(`/flows/${fallbackId}`);
        }
      } catch { }
    })();

    return () => { cancelled = true; };
  }, [params.id, plan, store, router]);


  // —— 草稿 ——（初值来自 plan；后续只在 plan 变化时「补齐」，不覆盖已有编辑）
  const [draft, setDraft] = useState<PlanDraft>(() => ({
    title: plan?.title ?? "",
    rounds: plan?.rounds ?? 1,
    units: Array.isArray(plan?.units) ? plan!.units : [],
  }));
  const [roundsDraftInput, setRoundsDraftInput] = useState<number>(plan?.rounds ?? 1);
  useEffect(() => {
    if (!plan) return;
    setRoundsDraftInput(plan.rounds ?? 1);
    setDraft(prev => {
      const keepUnits = Array.isArray(prev?.units) && prev.units.length > 0;
      return {
        title: plan.title ?? prev?.title ?? "",
        rounds: plan.rounds ?? prev?.rounds ?? 1,
        units: keepUnits ? prev.units : (Array.isArray(plan.units) ? plan.units : []),
      };
    });
  }, [plan]);

  // —— 顶部状态/显示 —— 
  const view = flows[params.id];
  const running = !!(view && !view.paused && !view.done);
  const paused = !!(view && view.paused);

  const idx = typeof view?.unitIndex === "number" ? view!.unitIndex : 0;
  const phaseName = view?.phaseName || "—";
  const totalSec = plan?.units?.[idx]?.seconds ?? 0;
  const remainSec = view ? msToSec(view.remainingMs) : 0;
  const roundsVal = draft?.rounds ?? plan?.rounds ?? 1;
  const roundStr = view ? `${(view.roundIndex ?? -1) + 1}/${roundsVal}` : `0/${roundsVal}`;

  const deltaSec = Math.round(((((view as any)?.addedMs ?? 0) as number) / 1000));
  const [n, setN] = useState(5);
  const [unit, setUnit] = useState<"s" | "m">("s");
  const step = n * (unit === "s" ? 1 : 60);

  const uxStopped = !!stoppedFlags[params.id];
  const status: "idle" | "running" | "paused" = uxStopped
    ? "idle"
    : (!view || view.done) ? "idle"
      : (view.paused ? "paused" : "running");

  const showStop = !!(view && view.done);
  const showDelta = !showStop && status !== "idle" && deltaSec !== 0;
  const remainingText = showStop ? "STOP" : (status !== "idle" ? formatCountdownClock(remainSec) : "—");

  const lastUserEditAtRef = useRef(0);
  const lastSavedAtRef = useRef(0);
  const markUserEdit = () => { lastUserEditAtRef.current = Date.now(); };

  const stopAfterThisRoundRef = useRef(false);

  const setDraftByUser = useCallback((updater: any) => {
    markUserEdit();
    setDraft(typeof updater === "function" ? (prev) => updater(prev) : updater);
  }, []);

  // —— 计划签名/合成 & 保存/热更新 —— 
  const planSigFull = useCallback((p: PlanSpec) => JSON.stringify({
    t: p.title ?? "",
    r: Math.max(1, Number(p.rounds) || 1),
    u: (p.units ?? []).map(u => ({
      n: (u?.name ?? "").trim(),
      s: Math.max(1, Number(u?.seconds) || 1),
      y: (u?.say ?? "").trim(),
    }))
  }), []);

  const planSigRU = useCallback((p: PlanSpec) => JSON.stringify({
    r: Math.max(1, Number(p.rounds) || 1),
    u: (p.units ?? []).map(u => ({
      n: (u?.name ?? "").trim(),
      s: Math.max(1, Number(u?.seconds) || 1),
      y: (u?.say ?? "").trim(),
    })),
  }), []);

  const materializeNextPlan = useCallback((): PlanSpec => {
    const base = plan ?? ({ id: params.id, title: "", rounds: 1, units: [] } as PlanSpec);
    const src = draft ?? ({} as Partial<PlanSpec>);
    const title = (src.title ?? base.title ?? "").trim();
    const rounds = Math.max(1, Number(src.rounds ?? base.rounds) || 1);
    const units = (src.units ?? base.units ?? []).map(u => ({
      name: (u?.name ?? "").trim(),
      seconds: Math.max(1, Number(u?.seconds) || 1),
      say: (u?.say ?? "").trim(),
    }));
    return { id: params.id, title, rounds, units };
  }, [draft, plan]);

  const lastSavedRef = useRef<string>("");
  useEffect(() => {
    if (!plan) return;

    // 未挂载 / 正在恢复：建立基线，不保存
    if (!mounted || restoring) {
      lastSavedRef.current = planSigFull(plan);
      lastSavedAtRef.current = Date.now();
      return;
    }

    // 没有用户新编辑：不保存、不热更新（避免“打开详情页就刷新/抖动”）
    if (lastUserEditAtRef.current <= lastSavedAtRef.current) return;

    const nextPlan = materializeNextPlan();
    const curSig = planSigFull(plan);
    const nextSig = planSigFull(nextPlan);

    if (nextSig === curSig) {
      lastSavedRef.current = curSig;
      lastSavedAtRef.current = Date.now();
      return;
    }
    if (nextSig === lastSavedRef.current) {
      lastSavedAtRef.current = Date.now();
      return;
    }

    if (planSigRU(nextPlan) === planSigRU(plan)) {
      lastSavedRef.current = nextSig;           // 记录一下签名，避免重复进入
      lastSavedAtRef.current = Date.now();
      return;
    }

    // 1) 内存 + 本地
    store.updateFlowPlan(params.id, nextPlan);
    try { localStorage.setItem(`plan:${params.id}`, JSON.stringify(nextPlan)); } catch { }
    lastSavedRef.current = nextSig;
    lastSavedAtRef.current = Date.now();

    // 2) 运行/暂停 → 仅热更新，不重启
    const v = flows[params.id];
    if (v && !v.done) { try { syncPlan?.(params.id, nextPlan); } catch { } }
  }, [materializeNextPlan, plan, params.id, store, syncPlan, planSigFull, mounted, restoring, flows, lastSavedRef, lastSavedAtRef, lastUserEditAtRef]);

  useEffect(() => {
    const v = flows[params.id];
    if (!v || v.done) return;

    // 只有当用户把总轮数降到“当前轮数”时才会置位
    if (!stopAfterThisRoundRef.current) return;

    const curRoundNow = Math.max(1, (v.roundIndex ?? -1) + 1);
    const limitRounds = draft?.rounds ?? plan?.rounds ?? 1;

    // 一旦跨过这一轮（curRoundNow > limit），立即软停
    if (curRoundNow > limitRounds) {
      try { speech?.stop?.(); } catch { }
      stop(params.id);
      stopAfterThisRoundRef.current = false;
    }
    // 依赖只挂 roundIndex，避免无谓触发
  }, [flows[params.id]?.roundIndex, params.id, stop, draft?.rounds, plan?.rounds]);


  // —— 交互：轮次只改草稿，实际保存/生效由上面的 effect 处理 —— 
  const handleChangeRounds = (nextRounds: number) => {
    const curRound = Math.max(1, (flows[params.id]?.roundIndex ?? -1) + 1);
    // 不得小于“当前已运行轮数”
    const rounds = Math.max(curRound, Math.max(1, nextRounds));

    // 这是一次真实的用户编辑
    markUserEdit();

    // 如果降到了“当前轮数”，本轮结束后软停止（你原逻辑，保留）
    stopAfterThisRoundRef.current = (rounds === curRound);

    // 先本地更新草稿，保证 UI 立即体现
    setRoundsDraftInput(rounds);
    setDraft(d => ({ ...d, rounds }));

    // ✅ 关键：运行/暂停时，立即把“新的轮次”推给计时内核（不重启、不清零）
    const v = flows[params.id];
    if (v && !v.done) {
      const base = plan ?? ({ id: params.id, title: "", rounds: 1, units: [] } as PlanSpec);
      const nextPlanInstant: PlanSpec = {
        id: params.id,
        title: (draft?.title ?? base.title ?? "").trim(),
        rounds, // 用最新轮次
        units: (draft?.units ?? base.units ?? []).map(u => ({
          name: (u?.name ?? "").trim(),
          seconds: Math.max(1, Number(u?.seconds) || 1),
          say: (u?.say ?? "").trim(),
        })),
      };
      try { syncPlan?.(params.id, nextPlanInstant); } catch { }
    }
  };

  // —— 保存按钮（仍保留；但平时不必点）——
  const savePlan = useCallback((d?: PlanDraft) => {
    const src = d ?? draft;
    const nextPlan: PlanSpec = {
      id: params.id, 
      title: (src.title ?? "").trim(),
      rounds: Math.max(1, Number(src.rounds) || 1),
      units: (src.units ?? []).map(u => ({
        name: (u.name ?? "").trim(),
        seconds: Math.max(1, Number(u.seconds) || 1),
        say: (u.say ?? "").trim(),
      })),
    };
    store.updateFlowPlan(params.id, nextPlan);
    try { localStorage.setItem(`plan:${params.id}`, JSON.stringify(nextPlan)); } catch { }
    setDraft(prev => ({ ...prev, ...nextPlan }));
    router.push("/");
  }, [draft, params.id, router, store]);

  // —— 一些本地 ref（播报等）——
  const lastSpokenKeyRef = useRef<string>("");
  const minRound = Math.max(1, (flows[params.id]?.roundIndex ?? -1) + 1);

  return (
    <main className="p-4 space-y-4">
      {(!mounted || restoring) ? (
        // 骨架
        <div className="rounded-2xl p-4 border border-slate-200/60 dark:border-white/10">
          <div className="h-5 w-32 rounded bg-slate-200/70 dark:bg-white/10 mb-3" />
          <div className="h-24 rounded bg-slate-200/50 dark:bg-white/5" />
        </div>
      ) : !plan ? (
        // 已挂载但没有 plan
        <div className="rounded-2xl p-4 border border-slate-200/60 dark:border-white/10">
          流程不存在
        </div>
      ) : (
        <>
          {/* 顶部：状态卡片 */}
          <div className="rounded-2xl p-4 border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{plan.title}</div>
              <div
                className={`px-2 py-0.5 text-xs rounded-lg ${running ? "bg-emerald-100 text-emerald-700"
                  : paused ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-600"
                  }`}
              >
                {running ? "运行中" : paused ? "已暂停" : "就绪"}
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between">
              <div className="text-sm">
                <div className="opacity-60">当前单元</div>
                <div className="text-base font-semibold">{phaseName}</div>
              </div>

              <div className="text-center">
                <div className="opacity-60 text-xs">时间（总/剩）</div>
                {showStop ? (
                  <div className="text-2xl font-semibold tabular-nums">
                    <span className="font-semibold tracking-wide text-rose-600 dark:text-rose-400">STOP</span>
                  </div>
                ) : (
                  <div className="text-2xl font-semibold tabular-nums">
                    {formatDurationEn(totalSec)}
                    <span className="mx-1"> / </span>
                    <span>{remainingText}</span>
                    {showDelta && (
                      <span
                        className={`ml-2 text-xs px-2 py-0.5 rounded-full ${deltaSec > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                          }`}
                      >
                        {deltaSec > 0 ? `+${deltaSec}s` : `${deltaSec}s`}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="text-right text-sm">
                <div className="opacity-60">轮次</div>
                <div className="font-semibold">{roundStr}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {status === "idle" && (
                <>
                  <button
                    className="px-3 py-2 rounded-lg bg-emerald-600 text-white"
                    onClick={() => {
                      markStopped(params.id, false);
                      unlockGlobalAudio();
                      lastSpokenKeyRef.current = "";
                      const nextPlan = materializeNextPlan();
                      store.updateFlowPlan(params.id, nextPlan);
                      try { localStorage.setItem(`plan:${params.id}`, JSON.stringify(nextPlan)); } catch { }
                      start(params.id, nextPlan);
                    }}
                  >
                    开始
                  </button>
                  <button
                    className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-white/10"
                    onClick={() => router.back()}
                  >
                    返回
                  </button>
                </>
              )}

              {status === "running" && (
                <>
                  <button
                    className="px-3 py-2 rounded-lg bg-slate-900 text-white/90"
                    onClick={() => pause(params.id)}
                  >
                    暂停
                  </button>
                  <button
                    className="px-3 py-2 rounded-lg bg-rose-600 text-white"
                    onClick={() => {
                      stop(params.id);
                      markStopped(params.id, true);
                    }}
                  >
                    停止
                  </button>
                </>
              )}

              {status === "paused" && (
                <>
                  <button
                    className="px-3 py-2 rounded-lg bg-emerald-600 text-white"
                    onClick={() => {
                      markStopped(params.id, false);
                      unlockGlobalAudio();
                      lastSpokenKeyRef.current = "";
                      resume(params.id);
                    }}
                  >
                    继续
                  </button>
                  <button
                    className="px-3 py-2 rounded-lg bg-rose-600 text-white"
                    onClick={() => {
                      stop(params.id);
                      markStopped(params.id, true);
                    }}
                  >
                    停止
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 轮次数量 */}
          <RoundsStepper
            value={roundsVal}
            onChange={(v) => handleChangeRounds(v)}
            min={minRound}
          />

          {/* Nx 步长设置 + 临时调节 */}
          <div className="rounded-2xl p-4 border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5">
            <div className="flex items-center gap-2">
              <span className="text-sm opacity-70">步长</span>
              <input
                type="number"
                min={1}
                className="w-20 rounded-lg border px-3 py-2 bg-transparent"
                value={n}
                onChange={(e) => setN(Math.max(1, Number(e.target.value) || 1))}
              />
              <select
                className="rounded-lg border px-3 py-2 bg-transparent"
                value={unit}
                onChange={(e) => setUnit(e.target.value as any)}
              >
                <option value="s">秒</option>
                <option value="m">分</option>
              </select>
              <span className="text-xs opacity-60">（下面的 +/− 默认按 {n}{unit === "s" ? "秒" : "分"} 应用）</span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              <button
                className="px-3 py-2 rounded-lg bg-amber-600 text-white"
                onClick={() => { try { speech?.stop?.(); } catch { }; adjustTime(params.id, { deltaSec: +step }) }}
              >
                +{n}{unit === "s" ? "秒" : "分"}
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-amber-600 text-white"
                onClick={() => { try { speech?.stop?.(); } catch { }; adjustTime(params.id, { deltaSec: -step }) }}
              >
                -{n}{unit === "s" ? "秒" : "分"}
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-slate-900 text-white/90"
                onClick={() => { try { speech?.stop?.(); } catch { }; adjustTime(params.id, { setSec: step }) }}
              >
                设为 {n}{unit === "s" ? "秒" : "分"}
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-white/10"
                onClick={() => { try { speech?.stop?.(); } catch { }; adjustTime(params.id, { setSec: 0 }) }}
              >
                清零
              </button>
            </div>
            <p className="mt-2 text-xs opacity-60">注：只影响「本轮·当前单元」剩余时间。</p>
          </div>

          {/* 编辑器 */}
          <PlanEditor
            draft={draft}
            setDraft={setDraftByUser}  // ← 用代理
            onConfirm={(d) => savePlan(d)}
            onCancel={() => router.back()}
          />
        </>
      )}
    </main>
  );
}
