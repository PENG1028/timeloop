"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PlanEditor, { type PlanDraft } from "../../_components/PlanEditor";
import { useFlowStore } from "../../_store/flows";
import { uid } from "../../_lib/uid";
import type { PlanSpec } from "../../_types/timer";

export default function NewFlowPage() {
  const router = useRouter();
  const store = useFlowStore();

  const [draft, setDraft] = useState<PlanDraft>({
    title: "", rounds: 1, units: [{ name:"", seconds:0 }],
  });

  function onConfirm() {
    const fid = uid();
    const plan: PlanSpec = { id: fid, title: draft.title, rounds: draft.rounds, units: draft.units, prepare: 0, betweenRounds: 0 };
    store.attachFlow(fid, plan);
    router.push("/"); // 回首页，卡片一键开始
  }

  return (
    <main className="p-4">
      <PlanEditor
        mode="flow"
        draft={draft}
        setDraft={setDraft}
        onConfirm={onConfirm}
        onCancel={()=>router.back()}
        templateOptions={store.templates.map(t=>({id:t.id, title:t.title}))}
        onLoadTemplate={(id)=>{
          const t = store.templates.find(x=>x.id===id);
          if (!t) return;
          setDraft({ title:t.title, rounds:t.rounds, units:t.units });
        }}
      />
    </main>
  );
}
