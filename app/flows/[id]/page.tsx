"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFlowStore } from "../../_store/flows";
import { useTimerClient, unlockGlobalAudio } from "../../_hooks/useTimerClient";
import type { PlanSpec } from "../../_types/timer";
import PlanEditor, { type PlanDraft } from "../../_components/PlanEditor";



function msToSec(ms: number) { return Math.max(0, Math.ceil(ms / 1000)); }

export default function FlowDetailEditPage({ params }: { params: { id: string } }) {

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const audioRef = useRef<any>(null);
  const pfRef = useRef<any>(null);




  const router = useRouter();
  const store = useFlowStore();
  const plan = useMemo(() => store.getFlowPlan(params.id), [store, params.id]);
  const lastSecRef = useRef<number>(-1);
  const [, force] = useState<number>(0);
  const { flows, start, pause, resume, stop, adjustTime } = useTimerClient((ev: any) => {
    if (ev?.type === "FLOW_TICK" || ev?.type === "FLOW_PHASE_ENTER" || ev?.type === "FLOW_STATE" || ev?.type === "FLOW_DONE") {
      force((x: number) => x + 1);
    }
  });


  if (!plan) return <main className="p-4">流程不存在</main>;

  // 顶部：运行状态
  const view = flows[params.id];
  const running = !!(view && !view.paused && !view.done);
  const paused = !!(view && view.paused);
  const remaining = view ? msToSec(view.remainingMs) : 0;
  const rawPhase = view?.phaseName ?? "";

  const phaseName = view?.phaseName || "—";
  const idx = typeof view?.unitIndex === "number" ? view!.unitIndex : 0;
  const totalSec = plan.units[idx]?.seconds ?? 0;
  const remainSec = view ? Math.max(0, Math.ceil(view.remainingMs / 1000)) : 0;
  const fixedTotalSec = totalSec > 0
    ? totalSec
    : (() => {
      const byName = plan.units.find(u => u.name === (view?.phaseName ?? ""));
      return byName?.seconds ?? 0;
    })();

  const timeStr = `${totalSec} / ${remainSec}`;
  const roundStr = view ? `${(view.roundIndex ?? -1) + 1}/${plan.rounds}` : `0/${plan.rounds}`;


  // Nx 步长（默认 N=5, X=秒）
  const [n, setN] = useState(5);
  const [unit, setUnit] = useState<"s" | "m">("s"); // 秒/分
  const step = n * (unit === "s" ? 1 : 60);

  // 编辑草稿（展开单元，可直接改）
  const [draft, setDraft] = useState<PlanDraft>({ title: plan.title, rounds: plan.rounds, units: plan.units });

  function savePlan() {
    const next: PlanSpec = { ...plan, title: draft.title, rounds: draft.rounds, units: draft.units, prepare: 0, betweenRounds: 0 };
    store.updateFlowPlan(params.id, next);
    router.push("/");
  }

  return (
    <main className="p-4 space-y-4">
      {/* 顶部：运行信息 + 动作（暂停→停止；停止后出现“开始”） */}
      <div className="rounded-2xl p-4 border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5">
        <div className="flex items-center justify-between">
          <div className="font-semibold">{plan.title}</div>
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
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(!view || view.done) && (
            <button className="px-3 py-2 rounded-lg bg-emerald-600 text-white" onClick={() => { unlockGlobalAudio(); start(params.id, plan); }}>
              开始
            </button>
          )}
          {running && (
            <button className="px-3 py-2 rounded-lg bg-slate-900 text-white/90" onClick={() => pause(params.id)}>
              暂停
            </button>
          )}
          {paused && (
            <>
              <button className="px-3 py-2 rounded-lg bg-emerald-600 text-white"
                onClick={() => { unlockGlobalAudio(); resume(params.id); }}>
                开始
              </button>
              <button className="px-3 py-2 rounded-lg bg-rose-600 text-white" onClick={() => stop(params.id)}>
                停止
              </button>
            </>
          )}
        </div>
      </div>

      {/* Nx 步长设置 + 临时调节（作用于当前单元） */}
      <div className="rounded-2xl p-4 border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5">
        <div className="flex items-center gap-2">
          <span className="text-sm opacity-70">步长</span>
          <input type="number" min={1} className="w-20 rounded-lg border px-3 py-2 bg-transparent"
            value={n} onChange={e => setN(Math.max(1, Number(e.target.value) || 1))} />
          <select className="rounded-lg border px-3 py-2 bg-transparent" value={unit} onChange={e => setUnit(e.target.value as any)}>
            <option value="s">秒</option>
            <option value="m">分</option>
          </select>
          <span className="text-xs opacity-60">（下面的 +/− 默认按 {n}{unit === "s" ? "秒" : "分"} 应用）</span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          <button className="px-3 py-2 rounded-lg bg-amber-600 text-white" onClick={() => adjustTime(params.id, { deltaSec: +step })}>+{n}{unit === "s" ? "秒" : "分"}</button>
          <button className="px-3 py-2 rounded-lg bg-amber-600 text-white" onClick={() => adjustTime(params.id, { deltaSec: -step })}>-{n}{unit === "s" ? "秒" : "分"}</button>
          <button className="px-3 py-2 rounded-lg bg-slate-900 text-white/90" onClick={() => adjustTime(params.id, { setSec: step })}>设为 {n}{unit === "s" ? "秒" : "分"}</button>
          <button className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-white/10" onClick={() => adjustTime(params.id, { setSec: 0 })}>清零</button>
        </div>
        <p className="mt-2 text-xs opacity-60">注：只影响「本轮·当前单元」剩余时间。</p>
      </div>

      {/* 下面直接展开「编辑（全局）」— 与详情同页 */}
      <PlanEditor
        mode="flow"
        draft={draft}
        setDraft={setDraft}
        onConfirm={savePlan}
        onCancel={() => router.back()}
      />
    </main>
  );
}
