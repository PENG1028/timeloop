"use client";

import { useMemo } from "react";
import type { UnitSpec } from "../_types/timer";
import DurationPicker from "./DurationPicker"; // 按你的目录调整相对路径

export type PlanDraft = {
  title: string;
  rounds: number;
  units: UnitSpec[]; // { name, seconds, say? }
};

type PlanSpec = { title: string; rounds: number; units: { name: string; seconds: number; say?: string }[] };

type TemplateOption = { id: string; label: string; plan: PlanSpec ; title:string};

type Props = {
  /** "create" 新建 / "edit" 编辑；不传默认 "create" */
  mode?: "create" | "edit";
  draft: PlanSpec;
  setDraft: (d: PlanSpec) => void;
  onConfirm: (d: PlanSpec) => void;
  onCancel: () => void;
  templateOptions?: TemplateOption[];
  onLoadTemplate?: (id: string) => void;
};

export default function PlanEditor({
  mode, draft, setDraft, onConfirm, onCancel, templateOptions, onLoadTemplate
}: Props) {
  function up(i:number){ if(i<=0) return; const arr=[...draft.units]; const [it]=arr.splice(i,1); arr.splice(i-1,0,it); setDraft({...draft, units:arr}); }
  function dn(i:number){ if(i>=draft.units.length-1) return; const arr=[...draft.units]; const [it]=arr.splice(i,1); arr.splice(i+1,0,it); setDraft({...draft, units:arr}); }
  function setUnit(i:number, partial: Partial<UnitSpec>){ const arr=[...draft.units]; arr[i]={...arr[i], ...partial}; setDraft({...draft, units:arr}); }
  function add(){ setDraft({...draft, units:[...draft.units, { name:"", seconds:0 }]}); }
  function del(i:number){ setDraft({...draft, units: draft.units.filter((_,idx)=>idx!==i)}); }

  const ok = useMemo(() => {
    if (!draft.title.trim()) return false;
    if (!Number.isFinite(draft.rounds) || draft.rounds < 1) return false;
    if (!draft.units.length) return false;
    for (const u of draft.units) {
      if (!u.name?.trim()) return false;
      if (!Number.isFinite(u.seconds) || u.seconds <= 0) return false;
    }
    return true;
  }, [draft]);

  return (
    <div className="pb-28">
      {/* 顶部：全局属性（清晰注释） */}
      <div className="rounded-2xl p-4 border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5 mb-3">
        <div className="grid gap-3">
          <label className="text-sm opacity-70">流程/模板标题（必填）</label>
          <input className="rounded-xl border px-4 py-3 text-base bg-transparent"
                 placeholder="例如：番茄钟 / 射击循环 / 口条训练"
                 value={draft.title} onChange={e=>setDraft({...draft, title:e.target.value})}/>
          <div>
            <label className="text-sm opacity-70">重复轮数（≥1）</label>
            <input type="number" min={1} className="mt-1 rounded-xl border px-4 py-3 text-base bg-transparent"
                   placeholder="例如：4"
                   value={draft.rounds} onChange={e=>setDraft({...draft, rounds:Number(e.target.value)||0})}/>
            <p className="text-xs opacity-60 mt-1">「轮」表示整套单元顺序重复的次数。</p>
          </div>

          {(templateOptions?.length ?? 0) > 0 && (
            <div>
              <label className="text-sm opacity-70">从模板载入（可选）</label>
              <select className="mt-1 rounded-xl border px-4 py-3 text-base bg-transparent"
                      onChange={e=> e.target.value && onLoadTemplate?.(e.target.value)}>
                <option value="">选择模板</option>
                {templateOptions!.map(t=> <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
              <p className="text-xs opacity-60 mt-1">只拷贝字段，不影响模板本身。</p>
            </div>
          )}
        </div>
      </div>

      {/* 单元卡片（清晰注释） */}
      <div className="space-y-2">
        {draft.units.map((u, i)=>(
          <div key={i} className="rounded-2xl p-3 border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5">
            <div className="grid gap-2">
              <label className="text-sm opacity-70">单元名称（必填）</label>
              <input className="rounded-xl border px-3 py-2 text-base bg-transparent"
                     placeholder="例如：瞄准 / 射击 / 换弹 / 休息"
                     value={u.name} onChange={e=>setUnit(i,{name:e.target.value})}/>
              <div className="grid grid-cols-3 gap-2">
                <div>
  <label className="text-sm opacity-70">时长</label>
  <div className="mt-1">
    <DurationPicker
      seconds={u.seconds}
      onChange={(v) => {
        if (v < 1) v = 1;            // 保持 ≥1 的规则
        setUnit(i, { seconds: v });  // ✅ 这里用 setUnit，而不是 updateUnit
      }}
    />
  </div>
</div>
<div className="mt-3">
  <label className="text-sm opacity-70">播报文案（可选）</label>
  <input
    type="text"
    className="mt-1 w-full rounded-lg border px-3 py-2 bg-transparent"
    placeholder={u.name || "例如：准备开始"}
    value={u.say ?? ""}                       // ✅ 用 say
    onChange={(e) => setUnit(i, { say: e.target.value })} // ✅ 写 say
  />
  <p className="mt-1 text-xs opacity-60">留空则默认播报单元名称</p>
</div>
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-2 rounded-lg bg-slate-900 text-white/90" onClick={()=>up(i)}>上移</button>
                <button className="px-3 py-2 rounded-lg bg-slate-900 text-white/90" onClick={()=>dn(i)}>下移</button>
                <button className="ml-auto px-3 py-2 rounded-lg bg-rose-600 text-white" onClick={()=>del(i)}>删除</button>
              </div>
            </div>
          </div>
        ))}

        {/* 永久存在的“虚线空卡片”——点击就新增一张 */}
        <button className="w-full rounded-2xl border-2 border-dashed p-6 text-slate-500" onClick={add}>
          + 添加一个单元
        </button>
      </div>

      {/* 底部确认/取消操作条 —— 确保按钮都有 type="button" 防止表单提交劫持 */}
      <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/80 dark:bg-slate-900/60 backdrop-blur border-t border-slate-200/60 dark:border-white/10 flex gap-2 justify-end">
        <button
          type="button"
          className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-white/10"
          onClick={onCancel}
        >
          取消
        </button>
        <button
          type="button"
          disabled={!ok}
          className="px-3 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
          onClick={() => onConfirm(draft)}   // ← 传入当前草稿
        >
          完成
        </button>
      </div>
    </div>
  );
}
