"use client";

import Link from "next/link";
import { useFlowStore } from "../_store/flows";
import { uid } from "../_lib/uid";

export default function TemplatesPage() {
  const store = useFlowStore();

  return (
    <main className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">模板</h1>
        <Link className="px-3 py-2 rounded-lg bg-indigo-600 text-white" href="/templates/new">+ 新建模板</Link>
      </header>

      <section className="grid md:grid-cols-3 gap-3">
        {store.templates.length===0 ? (
          <div className="rounded-xl border border-dashed p-6 text-sm opacity-70">
            暂无模板。点击右上角“新建模板”。
          </div>
        ) : store.templates.map(t=>(
          <div key={t.id} className="rounded-xl border border-slate-200/60 dark:border-white/10 p-3">
            <div className="font-medium">{t.title}</div>
            <div className="text-xs opacity-70">轮：{t.rounds}；单元：{t.units.map(u=>u.name).join("/")}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link className="px-3 py-1.5 rounded bg-slate-800 text-white/90" href={`/templates/${t.id}/edit`}>编辑</Link>
              <button className="px-3 py-1.5 rounded bg-rose-600 text-white" onClick={()=>store.removeTemplate(t.id)}>删除</button>
              <Link className="px-3 py-1.5 rounded bg-emerald-600 text-white" href="/flows/new" prefetch>
                基于此建流程
              </Link>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
