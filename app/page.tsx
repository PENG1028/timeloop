"use client";

import Link from "next/link";
import { useFlowStore } from "./_store/flows";
import { useTimerClient, unlockGlobalAudio  } from "./_hooks/useTimerClient";
import type { PlanSpec } from "./_types/timer";
import { useRef, useState, useEffect, useCallback } from "react";

// ❌ 不要静态 import 音频相关（避免 SSR/Hydration 问题）
// import { AudioEngine } from "./_lib/audio";
// import { Prefetcher } from "./_lib/prefetcher";

export default function HomeMobile() {
  // 1) 所有 hooks 无条件调用（禁止早退）
  
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const planMapRef = useRef<Map<string, PlanSpec>>(new Map());
const lastSecRef  = useRef<Map<string, number>>(new Map());

  const audioRef = useRef<any>(null);
  const prefetcherRef = useRef<any>(null);

  // 2) 挂载后动态 import 音频模块
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ AudioEngine }, { Prefetcher }] = await Promise.all([
          import("./_lib/audio"),
          import("./_lib/prefetcher"),
        ]);
        if (cancelled) return;
        audioRef.current = new AudioEngine();
        prefetcherRef.current = new Prefetcher(audioRef.current);
      } catch (err) {
        console.error("Audio init failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [mounted]);

  // 3) 正确的解锁函数（不会白屏）
  function unlockAudio() {
    const a = audioRef.current;
    if (!a) return;
    const fn =
      (typeof a.unlock === "function" && a.unlock) ||
      (typeof a.resume === "function" && a.resume) ||
      (typeof a.ensureUnlocked === "function" && a.ensureUnlocked) ||
      (a.audioContext && typeof a.audioContext.resume === "function" && a.audioContext.resume);
    if (fn) fn.call(a);
  }
  const store = useFlowStore();

  // 4) 订阅事件：交给音频/预取，同时轻量刷新
  

  const g: any = globalThis as any;
const [isPrimary, setIsPrimary] = useState(false);
useEffect(() => {
  if (!mounted) return;
  if (!g.__TL_AUDIO_PRIMARY__) {         // 尚无主控
    g.__TL_AUDIO_PRIMARY__ = 1;
    setIsPrimary(true);
  }
  return () => {
    if (isPrimary) g.__TL_AUDIO_PRIMARY__ = 0; // 主控卸载时释放
  };
}, [mounted, isPrimary]);

  const [, force] = useState(0);
const onEvent = useCallback((ev: any) => {
  if (ev?.type === "FLOW_TICK" || ev?.type === "FLOW_PHASE_ENTER" || ev?.type === "FLOW_STATE" || ev?.type === "FLOW_DONE") {
    force((x:number)=>x+1);
  }
}, []);
const { flows, start, pause, resume, stop } = useTimerClient(onEvent);

  const items = store.flowIds.map(fid => ({ fid, plan: store.getFlowPlan(fid), view: flows[fid] }));

  // 5) 只在 JSX 里条件渲染骨架（没有任何早退 return）
  return (
    <main className="p-4 space-y-3">
      {!mounted ? (
        <>
          <div className="h-10" />
          <div className="rounded-2xl border p-4" />
        </>
      ) : (
        <>
          {/* 顶部入口 */}
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">流程</div>
            <div className="flex gap-2">
              <Link href="/flows/new" className="px-3 py-2 rounded-lg bg-emerald-600 text-white">+ 流程</Link>
              <Link href="/templates/new" className="px-3 py-2 rounded-lg bg-indigo-600 text-white">+ 模板</Link>
            </div>
          </div>

          {/* 列表 */}
          {items.length === 0 ? (
            <Link href="/flows/new" className="block rounded-2xl border-2 border-dashed p-10 text-center text-slate-500">
              还没有流程，点这里快速创建
            </Link>
          ) : (
            <div className="space-y-3">
              {items.map(({ fid, plan, view }) => {
                if (!plan) return null;

                const running = !!(view && !view.paused && !view.done);
                const paused  = !!(view && view.paused);
                const rawPhase = view?.phaseName ?? "";
                const phaseName = rawPhase || "—";

                // 总/剩：按 unitIndex 从 plan 取总秒；剩余来自 remainingMs
                const idx = typeof view?.unitIndex === "number" ? view!.unitIndex : 0;
                const totalSec = plan.units[idx]?.seconds ?? 0;
                const remainSec = view ? Math.max(0, Math.ceil(view.remainingMs / 1000)) : 0;
                const fixedTotalSec = totalSec > 0 ? totalSec : (() => {
                  const byName = plan.units.find(u => u.name === (view?.phaseName ?? ""));
                  return byName?.seconds ?? 0;
                })();
                const timeStr = `${fixedTotalSec} / ${remainSec}`;
                const roundStr = view ? `${(view.roundIndex ?? -1) + 1}/${plan.rounds}` : `0/${plan.rounds}`;

                return (
                  <div key={fid} className="rounded-2xl p-3 border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{plan.title}</div>
                      <div className={`px-2 py-0.5 text-xs rounded-lg ${running ? "bg-emerald-100 text-emerald-700" : paused ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
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
                        <div className="text-2xl font-semibold tabular-nums">{timeStr}</div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="opacity-60">轮次</div>
                        <div className="font-semibold">{roundStr}</div>
                      </div>
                    </div>

                    {/* 操作区 */}
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {(!view || view.done) && (
                        <button
                          className="px-3 py-2 rounded-lg bg-emerald-600 text-white"
                          onClick={() => {
                            unlockGlobalAudio();   
                            prefetcherRef.current?.onStart?.(fid, plan as PlanSpec);
                            planMapRef.current.set(fid, plan as PlanSpec);
                            start(fid, plan as PlanSpec);
                          }}
                        >
                          开始
                        </button>
                      )}
                      {running && (
                        <button className="px-3 py-2 rounded-lg bg-slate-900 text-white/90" onClick={() => pause(fid)}>
                          暂停
                        </button>
                      )}
                      {paused && (
                        <>
                          <button
                            className="px-3 py-2 rounded-lg bg-emerald-600 text-white"
                            onClick={() => { unlockGlobalAudio(); resume(fid); }}
                          >
                            开始
                          </button>
                          <button className="px-3 py-2 rounded-lg bg-rose-600 text-white" onClick={() => stop(fid)}>停止</button>
                        </>
                      )}
                      <Link className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-white/10 text-center" href={`/flows/${fid}`}>
                        详情
                      </Link>
                    </div>

                    <div className="mt-2 flex justify-between text-xs opacity-70">
                      <div className="truncate">{plan.units.map(u => `${u.name}(${u.seconds}s)`).join(" · ")}</div>
                      <button
                        className="underline text-rose-600"
                        onClick={() => {
                          if (confirm(`确认删除流程「${plan.title}」？此操作不可恢复。`)) {
                            stop(fid);
                            planMapRef.current.delete(fid);
                            lastSecRef.current.delete(fid);
                            store.detachFlow(fid);
                          }
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </main>
  );
}
