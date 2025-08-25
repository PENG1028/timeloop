"use client";

import { useState } from "react";

export type TunerProps = {
  plannedSec: number;
  remainSec: number;
  deltaSec: number;
  onAdd: (sec: number) => void;
  onSub: (sec: number) => void;
  onSet: (sec: number) => void;
  onReset: () => void;
};

export default function UnitTuner(p: TunerProps) {
  const [step, setStep] = useState(5);
  return (
    <div className="mt-4 rounded-xl border border-slate-200/60 dark:border-white/10 p-3">
      <div className="flex items-center gap-3 mb-2">
        <div className="text-sm opacity-70">步长</div>
        <input
          type="number"
          min={1}
          className="w-20 rounded border px-2 py-1 bg-transparent"
          value={step}
          onChange={(e)=> setStep(Math.max(1, Number(e.target.value)||1))}
        />
        <div className="text-sm opacity-70">秒</div>

        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${p.deltaSec>0 ? "bg-emerald-100 text-emerald-700" : (p.deltaSec<0 ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-600")}`}>
          {p.deltaSec>0 ? `已临时 +${p.deltaSec}s` : (p.deltaSec<0 ? `已临时 ${p.deltaSec}s` : "未临时调整")}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button type="button" className="px-3 py-2 rounded bg-emerald-600 text-white" onClick={()=>p.onAdd(step)}>+{step}s</button>
        <button type="button" className="px-3 py-2 rounded bg-amber-600 text-white"  onClick={()=>p.onSub(step)}>-{step}s</button>
        <button type="button" className="px-3 py-2 rounded bg-slate-800 text-white"   onClick={()=>p.onSet(step)}>设为 {step}s</button>
        <button type="button" className="px-3 py-2 rounded bg-slate-600 text-white"   onClick={p.onReset}>清零临时</button>
      </div>

      <div className="mt-2 text-xs opacity-70">
        注：仅作用「本轮·当前单元」，不会影响下一单元/下一轮初始时长。
      </div>
    </div>
  );
}
