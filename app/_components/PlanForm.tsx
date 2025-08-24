"use client";

import type { UnitSpec, PlanSpec } from "../_types/timer";

export type PlanDraft = {
  title: string;
  rounds: number;
  prepare?: number;
  betweenRounds?: number;
  units: UnitSpec[]; // { name, seconds, say? }
};

export default function PlanForm({
  draft, setDraft,
  onSubmitPrimary, onSubmitSecondary, // 按钮：主/次
  primaryText, secondaryText,
  templateOptions, onLoadTemplate,    // 可选：仅用于“新建流程”快速载入模板
}:{
  draft: PlanDraft;
  setDraft: (d: PlanDraft) => void;
  onSubmitPrimary: () => void;
  onSubmitSecondary?: () => void;
  primaryText: string;
  secondaryText?: string;
  templateOptions?: { id: string; title: string }[];
  onLoadTemplate?: (id: string) => void;
}) {
  function updateUnit(i: number, partial: Partial<UnitSpec>) {
    const arr = [...draft.units];
    arr[i] = { ...arr[i], ...partial };
    setDraft({ ...draft, units: arr });
  }
  function addUnit() {
    setDraft({ ...draft, units: [...draft.units, { name: `单元${draft.units.length+1}`, seconds: 10 }] });
  }
  function delUnit(i: number) {
    setDraft({ ...draft, units: draft.units.filter((_,idx)=>idx!==i) });
  }
  function move(i:number, dir:-1|1) {
    const j = i+dir; if (j<0 || j>=draft.units.length) return;
    const arr=[...draft.units]; const [it]=arr.splice(i,1); arr.splice(j,0,it);
    setDraft({ ...draft, units: arr });
  }

  return (
    <div className="space-y-4">
      {/* 顶部：全局属性 */}
      <div className="rounded-2xl p-4 border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5">
        <div className="grid grid-cols-1 gap-3">
          <input
            className="w-full rounded-xl border px-4 py-3 text-base bg-transparent"
            placeholder="流程/模板标题"
            value={draft.title}
            onChange={e=>setDraft({ ...draft, title: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-2">
            <input type="number" min={1} className="rounded-xl border px-4 py-3 text-base bg-transparent"
              placeholder="轮数" value={draft.rounds}
              onChange={e=>setDraft({ ...draft, rounds: Number(e.target.value)||1 })}/>
            <input type="number" min={0} className="rounded-xl border px-4 py-3 text-base bg-transparent"
              placeholder="准备(秒)" value={draft.prepare ?? 0}
              onChange={e=>setDraft({ ...draft, prepare: Number(e.target.value)||0 })}/>
            <input type="number" min={0} className="rounded-xl border px-4 py-3 text-base bg-transparent"
              placeholder="轮间(秒)" value={draft.betweenRounds ?? 0}
              onChange={e=>setDraft({ ...draft, betweenRounds: Number(e.target.value)||0 })}/>
          </div>

          {templateOptions && templateOptions.length>0 && (
            <select className="rounded-xl border px-4 py-3 text-base bg-transparent"
              onChange={e=> e.target.value && onLoadTemplate?.(e.target.value)}>
              <option value="">从模板载入（可选）</option>
              {templateOptions.map(t=> <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* 单元列表 */}
      <div className="space-y-2">
        {draft.units.map((u, i)=>(
          <div key={i} className="rounded-2xl p-3 border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5">
            <div className="grid grid-cols-1 gap-2">
              <input className="rounded-xl border px-3 py-2 text-base bg-transparent" placeholder="单元名称"
                value={u.name} onChange={e=>updateUnit(i, { name: e.target.value })}/>
              <div className="grid grid-cols-3 gap-2">
                <input type="number" min={0} className="rounded-xl border px-3 py-2 text-base bg-transparent" placeholder="秒数"
                  value={u.seconds} onChange={e=>updateUnit(i, { seconds: Number(e.target.value)||0 })}/>
                <input className="col-span-2 rounded-xl border px-3 py-2 text-base bg-transparent" placeholder="（可选）播报文案"
                  value={u.say ?? ""} onChange={e=>updateUnit(i, { say: e.target.value || undefined })}/>
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-2 rounded-lg bg-slate-900 text-white/90" onClick={()=>move(i,-1)}>上移</button>
                <button className="px-3 py-2 rounded-lg bg-slate-900 text-white/90" onClick={()=>move(i, 1)}>下移</button>
                <button className="ml-auto px-3 py-2 rounded-lg bg-rose-600 text-white" onClick={()=>delUnit(i)}>删除</button>
              </div>
            </div>
          </div>
        ))}
        <button className="w-full px-4 py-3 rounded-xl border-2 border-dashed" onClick={addUnit}>+ 添加单元</button>
      </div>

      {/* 底部按钮 */}
      <div className="flex gap-2">
        <button className="flex-1 px-4 py-3 rounded-xl bg-emerald-600 text-white" onClick={onSubmitPrimary}>
          {primaryText}
        </button>
        {onSubmitSecondary && secondaryText && (
          <button className="px-4 py-3 rounded-xl bg-slate-900 text-white/90" onClick={onSubmitSecondary}>
            {secondaryText}
          </button>
        )}
      </div>
    </div>
  );
}
