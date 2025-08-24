"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { UnitSpec } from "../_types/timer";
import type { FlowTemplate } from "../_store/flows";

type Mode = "flow" | "template";

export type DesignerDraft = {
  id: string;
  title: string;
  rounds: number;
  prepare?: number;
  betweenRounds?: number;
  units: UnitSpec[]; // {name, seconds, say?}
};

type Props = {
  mode: Mode;
  draft: DesignerDraft;
  setDraft: (d: DesignerDraft) => void;
  templateChoices?: FlowTemplate[];
  onLoadTemplate?: (tpl: FlowTemplate) => void;
  onSubmit: (planOrTemplate: DesignerDraft, opts?: { start?: boolean }) => void;
};

export default function FlowDesigner({ mode, draft, setDraft, templateChoices = [], onLoadTemplate, onSubmit }: Props) {
  const [step, setStep] = useState<0|1|2>(0);
  const canNext0 = draft.title.trim().length > 0 && draft.rounds >= 1;

  function addUnit() {
    setDraft({ ...draft, units: [...draft.units, { name: `阶段${draft.units.length+1}`, seconds: 10 }] });
  }
  function delUnit(i: number) {
    setDraft({ ...draft, units: draft.units.filter((_,idx)=>idx!==i) });
  }
  function move(i:number, dir:-1|1) {
    const j = i+dir; if (j<0 || j>=draft.units.length) return;
    const arr = [...draft.units]; const [it] = arr.splice(i,1); arr.splice(j,0,it);
    setDraft({ ...draft, units: arr });
  }

  return (
    <div className="rounded-3xl border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5 backdrop-blur p-6">
      {/* Stepper */}
      <div className="flex items-center gap-3 text-sm">
        {["基础信息", "阶段与播报", "确认"].map((t, i) => {
          const active = step === i as 0|1|2;
          return (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${active?"bg-sky-600 text-white":"bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"}`}>{i+1}</div>
              <div className={`${active?"font-medium":""}`}>{t}</div>
              {i<2 && <div className="w-12 h-[2px] rounded bg-slate-200 dark:bg-slate-700" />}
            </div>
          );
        })}
      </div>

      {/* Step 0 */}
      {step===0 && (
        <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="mt-5 grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1">流程标题</label>
            <input className="w-full rounded-xl border px-4 py-3 text-base bg-transparent"
                   value={draft.title} onChange={e=>setDraft({ ...draft, title:e.target.value })} placeholder="例如：力量循环 / 番茄钟 / 口条训练"/>
            <p className="text-xs opacity-70 mt-1">给流程/模板起个易识别的名字。</p>
          </div>

          <div>
            <label className="block text-sm mb-1">轮数（重复次数）</label>
            <input type="number" min={1} className="w-full rounded-xl border px-4 py-3 text-base bg-transparent"
                   value={draft.rounds} onChange={e=>setDraft({ ...draft, rounds: Number(e.target.value)||1 })}/>
            <p className="text-xs opacity-70 mt-1">整个流程要重复多少轮。</p>
          </div>

          <div>
            <label className="block text-sm mb-1">准备时长（秒）</label>
            <input type="number" min={0} className="w-full rounded-xl border px-4 py-3 text-base bg-transparent"
                   value={draft.prepare ?? 0} onChange={e=>setDraft({ ...draft, prepare: Number(e.target.value)||0 })}/>
            <p className="text-xs opacity-70 mt-1">开始前的准备时间，可为 0。</p>
          </div>

          <div>
            <label className="block text-sm mb-1">轮间休息（秒）</label>
            <input type="number" min={0} className="w-full rounded-xl border px-4 py-3 text-base bg-transparent"
                   value={draft.betweenRounds ?? 0} onChange={e=>setDraft({ ...draft, betweenRounds: Number(e.target.value)||0 })}/>
            <p className="text-xs opacity-70 mt-1">每轮之间的间隔时间，可为 0。</p>
          </div>

          {mode==="flow" && templateChoices.length>0 && (
            <div className="md:col-span-2">
              <label className="block text-sm mb-1">从模板快速载入（可选）</label>
              <select className="w-full rounded-xl border px-4 py-3 text-base bg-transparent"
                      onChange={e=>{
                        const tpl = templateChoices.find(x=>x.id===e.target.value);
                        if (tpl && onLoadTemplate) onLoadTemplate(tpl);
                      }}>
                <option value="">选择模板以载入字段</option>
                {templateChoices.map(t=> <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
              <p className="text-xs opacity-70 mt-1">仅加载字段，不会改动模板本身。</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Step 1 */}
      {step===1 && (
        <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm opacity-70">依次填写每个阶段（单元），可重排、可设置播报文案</div>
            <button className="px-3 py-2 rounded-xl bg-slate-900 text-white/90" onClick={addUnit}>+ 添加阶段</button>
          </div>

          <div className="hidden md:grid grid-cols-12 text-xs opacity-60 px-1 pb-1">
            <div className="col-span-3">阶段名称</div>
            <div className="col-span-2">时长（秒）</div>
            <div className="col-span-5">播报文案（可选）</div>
            <div className="col-span-2">操作</div>
          </div>

          {draft.units.map((u,i)=>(
            <div key={i} className="grid md:grid-cols-12 gap-2 mb-2">
              <input className="md:col-span-3 rounded-xl border px-3 py-2 bg-transparent text-sm" value={u.name}
                     onChange={e=>{ const arr=[...draft.units]; arr[i]={...arr[i], name:e.target.value}; setDraft({ ...draft, units: arr }); }}/>
              <input type="number" min={0} className="md:col-span-2 rounded-xl border px-3 py-2 bg-transparent text-sm" value={u.seconds}
                     onChange={e=>{ const arr=[...draft.units]; arr[i]={...arr[i], seconds:Number(e.target.value)||0}; setDraft({ ...draft, units: arr }); }}/>
              <input className="md:col-span-5 rounded-xl border px-3 py-2 bg-transparent text-sm" placeholder="（可选）例如：开始射击 / 休息十秒"
                     value={u.say ?? ""} onChange={e=>{ const arr=[...draft.units]; arr[i]={...arr[i], say:e.target.value||undefined}; setDraft({ ...draft, units: arr }); }}/>
              <div className="md:col-span-2 flex gap-1">
                <button className="px-2 py-1 rounded-md bg-slate-800 text-white/90" onClick={()=>move(i,-1)}>↑</button>
                <button className="px-2 py-1 rounded-md bg-slate-800 text-white/90" onClick={()=>move(i, 1)}>↓</button>
                <button className="px-2 py-1 rounded-md bg-rose-600 text-white" onClick={()=>delUnit(i)}>删</button>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Step 2 */}
      {step===2 && (
        <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="mt-5">
          <div className="rounded-2xl border border-slate-200/60 dark:border-white/10 p-4">
            <div className="font-medium">{draft.title}</div>
            <div className="text-sm opacity-70 mt-1">轮：{draft.rounds}；准备：{draft.prepare ?? 0}s；轮间：{draft.betweenRounds ?? 0}s</div>
            <div className="mt-2 text-sm opacity-80">阶段：{draft.units.map(u=>`${u.name}(${u.seconds}s)`).join(" / ")}</div>
          </div>
        </motion.div>
      )}

      {/* footer */}
      <div className="mt-6 flex justify-between">
        <button className="px-4 py-2 rounded-xl bg-slate-900 text-white/90 disabled:opacity-40" disabled={step===0} onClick={()=>setStep((s)=> (s===0?s:((s-1) as 0|1|2)))}>上一步</button>
        <div className="flex gap-2">
          {step<2 ? (
            <button className="px-4 py-2 rounded-xl bg-indigo-600 text-white disabled:opacity-40" disabled={step===0 && !canNext0} onClick={()=>setStep((s)=>(s+1) as 0|1|2)}>下一步</button>
          ) : (
            <>
              {mode==="flow" && (
                <>
                  <button className="px-4 py-2 rounded-xl bg-emerald-600 text-white" onClick={()=>onSubmit(draft, { start: true })}>保存并启动</button>
                  <button className="px-4 py-2 rounded-xl bg-slate-800 text-white/90" onClick={()=>onSubmit(draft, { start: false })}>仅保存</button>
                </>
              )}
              {mode==="template" && (
                <button className="px-4 py-2 rounded-xl bg-emerald-600 text-white" onClick={()=>onSubmit(draft)}>保存模板</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
