"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PlanEditor, { type PlanDraft } from "../../_components/PlanEditor";
import { useFlowStore } from "../../_store/flows";
import { uid } from "../../_lib/uid";

export default function NewTemplatePage() {
  const router = useRouter();
  const store = useFlowStore();

  const [draft, setDraft] = useState<PlanDraft>({
    title: "", rounds: 1, units: [{ name:"", seconds:0 }],
  });

  function onConfirm() {
    store.addTemplate({
      id: uid(),
      title: draft.title, rounds: draft.rounds, units: draft.units, // prepare/轮间不再使用
    });
    router.push("/");
  }

  return (
    <main className="p-4">
      <PlanEditor
        mode="template"
        draft={draft}
        setDraft={setDraft}
        onConfirm={onConfirm}
        onCancel={()=>router.back()}
      />
    </main>
  );
}
