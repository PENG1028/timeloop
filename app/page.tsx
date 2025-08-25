"use client";

import Link from "next/link";
import { useFlowStore } from "./_store/flows";
import { useTimerClient, unlockGlobalAudio } from "./_hooks/useTimerClient";
import type { PlanSpec } from "./_types/timer";
import { useState, useEffect, useCallback } from "react";

export default function HomeMobile() {
  // 统一挂载检测（不要在 hooks 前 return）
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // 只保留“轻量刷新”的事件订阅；播报在 useTimerClient 的全局里做
  const [, force] = useState(0);
  const onEvent = useCallback((ev: any) => {
    if (
      ev?.type === "FLOW_TICK" ||
      ev?.type === "FLOW_PHASE_ENTER" ||
      ev?.type === "FLOW_STATE" ||
      ev?.type === "FLOW_DONE"
    ) {
      force(x => x + 1);
    }
  }, []);

  // 计时客户端（全局实现已处理 TTS/蜂鸣）
  const { flows, start, pause, resume, stop } = useTimerClient(onEvent);

  // ✅ 别忘了把 store 声明出来
  const store = useFlowStore();

  // 列表数据
  const items = store.flowIds.map(fid => ({
    fid,
    plan: store.getFlowPlan(fid),
    view: flows[fid],
  }));

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
                const paused = !!(view && view.paused);
                const phaseName = view?.phaseName || "—";

                // N / 剩余：从 plan 的当前单元取总秒，从 view 取剩余
                const idx = typeof view?.unitIndex === "number" ? view.unitIndex : 0;
                const totalSecFromIdx = plan.units[idx]?.seconds ?? 0;
                const fallbackTotal = plan.units.find(u => u.name === (view?.phaseName ?? ""))?.seconds ?? 0;
                const totalSec = totalSecFromIdx || fallbackTotal;
                const remainSec = view ? Math.max(0, Math.ceil(view.remainingMs / 1000)) : 0;
                const timeStr = `${totalSec} / ${remainSec}`;
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
                            unlockGlobalAudio();      // 统一解锁
                            start(fid, plan as PlanSpec);
                          }}
                        >
                          开始
                        </button>
                      )}

                      {running && (
                        <button
                          className="px-3 py-2 rounded-lg bg-slate-900 text-white/90"
                          onClick={() => pause(fid)}
                        >
                          暂停
                        </button>
                      )}

                      {paused && (
                        <>
                          <button
                            className="px-3 py-2 rounded-lg bg-emerald-600 text-white"
                            onClick={() => { unlockGlobalAudio(); resume(fid); }} // 暂停后应使用 resume
                          >
                            开始
                          </button>
                          <button
                            className="px-3 py-2 rounded-lg bg-rose-600 text-white"
                            onClick={() => stop(fid)}
                          >
                            停止
                          </button>
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
