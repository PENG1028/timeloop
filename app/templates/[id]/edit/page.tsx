"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useFlowStore } from "../../../_store/flows";
import { useTimerClient } from "../../../_hooks/useTimerClient";
import type { PlanSpec } from "../../../_types/timer";

function msToSec(ms:number){ return Math.max(0, Math.ceil(ms/1000)); }

export default function FlowDetailPage({ params }: { params: { id: string } }) {
  const store = useFlowStore();
  const plan = useMemo(()=> store.getFlowPlan(params.id), [store, params.id]);
  const { flows, start, pause, resume, stop, adjustTime } = useTimerClient(()=>{});

  if (!plan) return <main className="p-4">流程不存在</main>;
  const view = flows[params.id];
  const running = !!(view && !view.paused && !view.done);
  const paused  = !!(view && view.paused);
  const remaining = view ? msToSec(view.remainingMs) : 0;
  const phaseName = view?.phaseName ?? "—";
  const roundStr = view ? `${view.roundIndex+1}/${plan.rounds}` : `0/${plan.rounds}`;

  return (
    <main className="p-4 space-y-4">
      <div className="rounded-2xl p-4 border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5">
        <div className="flex items-center justify-between">
          <div className="font-semibold">{plan.title}</div>
          <Link className="underline text-sm" href={`/flows/${params.id}/edit`}>全局编辑</Link>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="text-sm">
            <div className="opacity-60">当前单元</div>
            <div className="text-base font-semibold">{phaseName}</div>
          </div>
          <div className="text-center">
            <div className="opacity-60 text-xs">剩余(秒)</div>
            <div className="text-2xl font-semibold tabular-nums">{remaining}</div>
          </div>
          <div className="text-right text-sm">
            <div className="opacity-60">轮次</div>
            <div className="font-semibold">{roundStr}</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {!view && <button className="px-3 py-2 rounded-lg bg-emerald-600 text-white" onClick={()=>start(params.id, plan as PlanSpec)}>开始</button>}
          {running && <button className="px-3 py-2 rounded-lg bg-slate-900 text-white/90" onClick={()=>pause(params.id)}>暂停</button>}
          {paused && <button className="px-3 py-2 rounded-lg bg-emerald-600 text-white" onClick={()=>resume(params.id)}>继续</button>}
          {(running||paused) && <button className="px-3 py-2 rounded-lg bg-rose-600 text-white" onClick={()=>stop(params.id)}>停止</button>}
        </div>
      </div>

      {/* 临时调节（只在详情页提供） */}
      <div className="rounded-2xl p-4 border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5">
        <div className="text-sm opacity-70 mb-2">临时调节当前单元时间</div>
        <div className="grid grid-cols-4 gap-2">
          <button className="px-3 py-2 rounded-lg bg-amber-600 text-white" onClick={()=>adjustTime(params.id, { deltaSec:+5 })}>+5s</button>
          <button className="px-3 py-2 rounded-lg bg-amber-600 text-white" onClick={()=>adjustTime(params.id, { deltaSec:-5 })}>-5s</button>
          <button className="px-3 py-2 rounded-lg bg-amber-600 text-white" onClick={()=>adjustTime(params.id, { deltaSec:+1 })}>+1s</button>
          <button className="px-3 py-2 rounded-lg bg-amber-600 text-white" onClick={()=>adjustTime(params.id, { deltaSec:-1 })}>-1s</button>
        </div>
        <div className="mt-2 text-xs opacity-60">仅影响本轮当前单元的剩余时间。</div>
      </div>
    </main>
  );
}
