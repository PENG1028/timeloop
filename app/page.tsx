"use client";

import Link from "next/link";
import { useFlowStore } from "./_store/flows";
import { useTimerClient, unlockGlobalAudio } from "./_hooks/useTimerClient";
import type { PlanSpec } from "./_types/timer";
import { formatDurationEn, formatCountdownClock } from "./_lib/duration";
import { useState, useEffect, useCallback } from "react"; // 你原本已有

export default function HomeMobile() {
  const [mounted, setMounted] = useState(false);
  // 让【停止】后按钮立刻切换为【开始】；等下一次真正 start 时再清除标记
  const [stoppedFlags, setStoppedFlags] = useState<Record<string, boolean>>({});
  const markStopped = useCallback((fid: string, val: boolean) => {
    setStoppedFlags(prev => ({ ...prev, [fid]: val }));
  }, []);

  useEffect(() => { setMounted(true); }, []);


  // 首页 app/page.tsx 现在既依赖 flows 又用 force(x=>x+1) 的 onEvent 强制刷新，等于每个事件双倍重渲染，列表多时会明显卡。解决：删掉 onEvent/force，只依赖 flows。
  // const [, force] = useState(0);
  // const onEvent = useCallback((ev: any) => {
  //   if (ev?.type === "FLOW_TICK" || ev?.type === "FLOW_PHASE_ENTER" || ev?.type === "FLOW_STATE" || ev?.type === "FLOW_DONE") {
  //     force(x => x + 1);
  //   }
  // }, []);
  const { flows, start, pause, resume, stop } = useTimerClient();
  const store = useFlowStore();
  const items = store.flowIds.map(fid => ({ fid, plan: store.getFlowPlan(fid), view: flows[fid] }));

  return (
    <main className="p-4 space-y-3">
      {!mounted ? (
        <>
          <div className="h-10" />
          <div className="rounded-2xl border p-4" />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">流程</div>
            <div className="flex gap-2">
              <Link href="/flows/new" className="px-3 py-2 rounded-lg bg-emerald-600 text-white">+ 流程</Link>
              <Link href="/templates/new" className="px-3 py-2 rounded-lg bg-indigo-600 text-white">+ 模板</Link>
            </div>
          </div>

          {items.length === 0 ? (
            <Link href="/flows/new" className="block rounded-2xl border-2 border-dashed p-10 text-center text-slate-500">
              还没有流程，点这里快速创建
            </Link>
          ) : (
            <div className="space-y-3">
              {items.map(({ fid, plan, view }) => {
                if (!plan) return null;
                const running = !!(view && !view.paused && !view.done);
                const paused = !!(view && view.paused);
                const phaseName = view?.phaseName || "—";

                const idx = typeof view?.unitIndex === "number" ? view.unitIndex : 0;
                const plannedSec = plan.units[idx]?.seconds ?? 0;
                const remainSec = view ? Math.max(0, Math.ceil(view.remainingMs / 1000)) : 0;

                const deltaSec = Math.round((view?.addedMs ?? 0) / 1000);
                const deltaTag = deltaSec === 0 ? null : (
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${deltaSec > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                    {deltaSec > 0 ? `+${deltaSec}s` : `${deltaSec}s`}
                  </span>
                );

                const uxStopped = !!stoppedFlags[fid];               // 本地“已停止”标记
                const showStop = (!!view && view.done) || (uxStopped && !running && !paused); // 仅流程完全结束，或用户点过“停止”且当前不在运行/暂停

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
                        <div className="text-2xl font-semibold tabular-nums">
                          {/* ✅ 完全结束只显示 STOP；否则“总 / 剩” */}
                          {(!!view && view.done) ? (
                            <div className="text-2xl font-semibold tabular-nums">
                              <span className="font-semibold tracking-wide text-rose-600 dark:text-rose-400">STOP</span>
                            </div>
                          ) : (
                            <div className="text-2xl font-semibold tabular-nums">
                              {formatDurationEn(plannedSec)}
                              <span className="mx-1"> / </span>
                              <span>{formatCountdownClock(remainSec)}</span>
                              {deltaTag}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="opacity-60">轮次</div>
                        <div className="font-semibold">{view ? `${(view.roundIndex ?? -1) + 1}/${plan.rounds}` : `0/${plan.rounds}`}</div>
                      </div>
                    </div>

                    {/* 按钮三态：互斥渲染，全部加 type="button" 防止表单提交劫持 */}
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {(!view || view.done || uxStopped) ? (
                        <>
                          <button
                            type="button"
                            className="px-3 py-2 rounded-lg bg-emerald-600 text-white"
                            onClick={() => {
                              markStopped(fid, false);              // ✅ 清除本地“已停止”
                              unlockGlobalAudio();
                              start(fid, plan as PlanSpec);
                            }}
                          >
                            开始
                          </button>
                          <Link className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-white/10 text-center" href={`/flows/${fid}`}>
                            详情
                          </Link>
                        </>
                      ) : paused ? (
                        <>
                          <button
                            type="button"
                            className="px-3 py-2 rounded-lg bg-emerald-600 text-white"
                            onClick={() => {
                              markStopped(fid, false);              // ✅ 恢复时也清掉本地“已停止”
                              unlockGlobalAudio();
                              resume(fid);
                            }}
                          >
                            继续
                          </button>
                          <button
                            type="button"
                            className="px-3 py-2 rounded-lg bg-rose-600 text-white"
                            onClick={() => {
                              stop(fid);
                              markStopped(fid, true);               // ✅ 立刻把 UI 切到“开始”
                            }}
                          >
                            停止
                          </button>
                          <Link className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-white/10 text-center" href={`/flows/${fid}`}>
                            详情
                          </Link>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="px-3 py-2 rounded-lg bg-slate-900 text-white/90"
                            onClick={() => pause(fid)}
                          >
                            暂停
                          </button>
                          <button
                            type="button"
                            className="px-3 py-2 rounded-lg bg-rose-600 text-white"
                            onClick={() => {
                              stop(fid);
                              markStopped(fid, true);               // ✅ 立刻切换到“开始”
                            }}
                          >
                            停止
                          </button>
                          <Link className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-white/10 text-center" href={`/flows/${fid}`}>
                            详情
                          </Link>
                        </>
                      )}
                    </div>

                    <div className="mt-2 flex justify-between text-xs opacity-70">
                      <div className="truncate">{plan.units.map(u => `${u.name}(${u.seconds}s)`).join(" · ")}</div>
                      <button type="button"
                        className="underline text-rose-600"
                        onClick={() => {
                          if (confirm(`确认删除流程「${plan.title}」？此操作不可恢复。`)) {
                            stop(fid);
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
