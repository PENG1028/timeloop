"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFlowStore } from "../../_store/flows";
import { useTimerClient, unlockGlobalAudio } from "../../_hooks/useTimerClient";
import type { PlanSpec } from "../../_types/timer";
import PlanEditor, { type PlanDraft } from "../../_components/PlanEditor";
import { formatDurationEn, formatCountdownClock } from "../../_lib/duration";
import DurationPicker from "../../_components/DurationPicker"; // 顶部 import，一次即可
import RoundsStepper from "../../_components/RoundsStepper";




function msToSec(ms: number) {
  return Math.max(0, Math.ceil(ms / 1000));
}

export default function FlowDetailEditPage({ params }: { params: { id: string } }) {
  const [mounted, setMounted] = useState(false);


  useEffect(() => {
    setMounted(true);
  }, []);

  // 让【停止】后按钮立刻切换为【开始】；等下一次真正 start 时再清除标记
  const [stoppedFlags, setStoppedFlags] = useState<Record<string, boolean>>({});
  const markStopped = useCallback((fid: string, val: boolean) => {
    setStoppedFlags(prev => ({ ...prev, [fid]: val }));
  }, []);



  const router = useRouter();
  const store = useFlowStore();

  // 这些 hooks 每次渲染都调用，避免“Rendered more hooks…”报错
  const plan = useMemo(() => store.getFlowPlan(params.id), [store, params.id]);
  const { flows, start, pause, resume, stop, adjustTime } = useTimerClient();

  // 轮次输入模式用到（先填再确认）
  const [roundsDraftInput, setRoundsDraftInput] = useState<number>(plan?.rounds ?? 1);

  // plan 变化时，同步输入框
  useEffect(() => {
    if (plan?.rounds != null) setRoundsDraftInput(plan.rounds);
  }, [plan?.rounds]);

  // 编辑草稿（展开单元，可直接改）
  const [draft, setDraft] = useState<PlanDraft>(() => ({
    title: plan?.title ?? "",
    rounds: plan?.rounds ?? 1,
    units: plan?.units ?? [],
  }));


  // 顶部：运行状态
  const view = flows[params.id];
  const running = !!(view && !view.paused && !view.done);
  const paused = !!(view && view.paused);

  const phaseName = view?.phaseName || "—";
  const idx = typeof view?.unitIndex === "number" ? view!.unitIndex : 0;
  const totalSec = plan?.units?.[idx]?.seconds ?? 0;
  const remainSec = view ? msToSec(view.remainingMs) : 0;
  const roundsVal = draft?.rounds ?? plan?.rounds ?? 1;
  const roundStr = view
    ? `${(view.roundIndex ?? -1) + 1}/${roundsVal}`
    : `0/${roundsVal}`;



  // 当前单元本轮“净临时 ± 秒”（由 worker 回传 addedMs）
  const deltaSec = Math.round(((((view as any)?.addedMs ?? 0) as number) / 1000));

  // Nx 步长（默认 N=5, X=秒）
  const [n, setN] = useState(5);
  const [unit, setUnit] = useState<"s" | "m">("s"); // 秒/分
  const step = n * (unit === "s" ? 1 : 60);

  // 本地“已停止”标记，点击【停止】后 UI 立刻切换为“开始”
  const uxStopped = !!stoppedFlags[params.id];

  // 统一三态：本地已停止 → idle；否则由 view 决定
  const status: "idle" | "running" | "paused" = uxStopped
    ? "idle"
    : (!view || view.done) ? "idle"
      : (view.paused ? "paused" : "running");

  // 只在“全部轮次完成”时显示 STOP（不因阶段清零，不因手动停止）
  const showStop = !!(view && view.done);

  // STOP 时不显示加减徽标；非运行/暂停状态也不显示
  const showDelta = !showStop && status !== "idle" && deltaSec !== 0;

  // 剩余的显示：完成→STOP；运行/暂停→数码表；就绪/手动停→破折号
  const remainingText = showStop
    ? "STOP"
    : (status !== "idle" ? formatCountdownClock(remainSec) : "—");



  // 放在组件内其它函数旁
  function persistPlanLocal(id: string, plan: any) {
    try { localStorage.setItem(`plan:${id}`, JSON.stringify(plan)); } catch { }
  }




  // 当 plan 首次就绪时，同步一次草稿（避免 FOUC）
  useEffect(() => {
    if (!plan) return;
    setDraft({ title: plan.title, rounds: plan.rounds, units: plan.units });
  }, [plan]);

  function savePlan() {
    if (!plan) return;
    const next: PlanSpec = {
      ...plan,
      title: draft.title,
      rounds: draft.rounds,
      units: draft.units,
      prepare: 0,
      betweenRounds: 0,
    };
    store.updateFlowPlan(params.id, next);
    router.push("/");
  }

  const handleChangeRounds = (nextRounds: number) => {
    if (!plan) return;
    const rounds = Math.max(1, nextRounds);

    // 先改本页草稿，UI 立刻反映（例如 PlanEditor 和数字输入框的显示）
    setDraft(d => ({ ...d, rounds }));

    // 永久写回到计划
    const nextPlan: PlanSpec = { ...plan, rounds };
    store.updateFlowPlan(params.id, nextPlan);

    // 如果减少后已经小于“当前进行到的轮次”，直接认为本次训练结束
    if (view && !view.done && (view.roundIndex ?? -1) + 1 > rounds) {
      stop(params.id);
      // 如果你有本地“已停止”标记，也在这里置上
      // markStopped(params.id, true);
    }
  }

  return (
    <main className="p-4 space-y-4">
      {/* 挂载前：骨架（避免 SSR/CSR 不一致） */}
      {!mounted ? (
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
          {/* 顶部：运行信息 + 动作（暂停→停止；停止后出现“开始”） */}
          <div className="rounded-2xl p-4 border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{plan.title}</div>
              <div
                className={`px-2 py-0.5 text-xs rounded-lg ${running
                  ? "bg-emerald-100 text-emerald-700"
                  : paused
                    ? "bg-amber-100 text-amber-700"
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

                {/* ✅ 完全结束只显示 STOP；否则才显示“总 / 剩” */}
                {showStop ? (
                  <div className="text-2xl font-semibold tabular-nums">
                    <span className="font-semibold tracking-wide text-rose-600 dark:text-rose-400">STOP</span>
                  </div>
                ) : (
                  <div className="text-2xl font-semibold tabular-nums">
                    {/* 总：英文缩写 */}
                    {formatDurationEn(totalSec)}
                    <span className="mx-1"> / </span>
                    {/* 剩：运行/暂停 => 数码表；就绪/手动停 => 破折号 */}
                    <span>{remainingText}</span>

                    {/* 非 STOP/idle 才显示加减徽标 */}
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
              {/* idle：只有“开始 / 返回”（或你要的按钮），不渲染“停止” */}
              {status === "idle" && (
                <>
                  <button
                    className="px-3 py-2 rounded-lg bg-emerald-600 text-white"
                    onClick={() => {
                      markStopped(params.id, false);  // ✅ 清除本地已停止
                      unlockGlobalAudio();
                      start(params.id, plan);
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

              {/* running：暂停 / 停止（停止后立刻切“开始”） */}
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
                      markStopped(params.id, true);   // ✅ 本地标记：按钮立即切回“开始”
                    }}
                  >
                    停止
                  </button>
                </>
              )}

              {/* paused：继续 / 停止（继续时清标记） */}
              {status === "paused" && (
                <>
                  <button
                    className="px-3 py-2 rounded-lg bg-emerald-600 text-white"
                    onClick={() => {
                      markStopped(params.id, false);  // ✅ 清除本地已停止
                      unlockGlobalAudio();
                      resume(params.id);
                    }}
                  >
                    继续
                  </button>
                  <button
                    className="px-3 py-2 rounded-lg bg-rose-600 text-white"
                    onClick={() => {
                      stop(params.id);
                      markStopped(params.id, true);   // ✅ 本地标记：按钮立即切回“开始”
                    }}
                  >
                    停止
                  </button>
                </>
              )}

            </div>

          </div>

          <div className="flex items-center justify-between mb-2">
            <div className="text-sm opacity-70">轮数</div>
            {/* 新增：轮次永久调整 */}
            <RoundsStepper
              value={roundsVal}
              onChange={(v) => handleChangeRounds(v)}   // ✅ 直接永久生效
              min={1}
            />
          </div>


          {/* Nx 步长设置 + 临时调节（作用于当前单元） */}
          <div className="rounded-2xl p-4 border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5">
            <div className="flex items-center gap-2">
              <span className="text-sm opacity-70">步长</span>
              <input
                type="number"
                min={1}
                className="w-20 rounded-lg border px-3 py-2 bg-transparent"
                value={n}
                onChange={(e) =>
                  setN(Math.max(1, Number(e.target.value) || 1))
                }
              />
              <select
                className="rounded-lg border px-3 py-2 bg-transparent"
                value={unit}
                onChange={(e) => setUnit(e.target.value as any)}
              >
                <option value="s">秒</option>
                <option value="m">分</option>
              </select>
              <span className="text-xs opacity-60">
                （下面的 +/− 默认按 {n}
                {unit === "s" ? "秒" : "分"} 应用）
              </span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              <button
                className="px-3 py-2 rounded-lg bg-amber-600 text-white"
                onClick={() => adjustTime(params.id, { deltaSec: +step })}
              >
                +{n}
                {unit === "s" ? "秒" : "分"}
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-amber-600 text-white"
                onClick={() => adjustTime(params.id, { deltaSec: -step })}
              >
                -{n}
                {unit === "s" ? "秒" : "分"}
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-slate-900 text-white/90"
                onClick={() => adjustTime(params.id, { setSec: step })}
              >
                设为 {n}
                {unit === "s" ? "秒" : "分"}
              </button>
              <button
                className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-white/10"
                onClick={() => adjustTime(params.id, { setSec: 0 })}
              >
                清零
              </button>
            </div>
            <p className="mt-2 text-xs opacity-60">
              注：只影响「本轮·当前单元」剩余时间。
            </p>
          </div>

          {/* 下面直接展开「编辑（全局）」— 与详情同页 */}
          <PlanEditor
            mode="flow"
            draft={draft}
            setDraft={setDraft}
            onConfirm={savePlan}
            onCancel={() => router.back()}
          />
        </>
      )}
    </main>
  );
}
