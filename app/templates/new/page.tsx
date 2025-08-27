"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import PlanEditor, { type PlanDraft } from "../../_components/PlanEditor";
import { useFlowStore } from "../../_store/flows";
import type { PlanSpec } from "../../_types/timer";

function newId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export default function NewFlowPage() {
  const router = useRouter();
  const store = useFlowStore();

  const [draft, setDraft] = useState<PlanDraft>({
    title: "",
    rounds: 1,
    units: [{ name: "单元 1", seconds: 30, say: "" }],
  });

  const save = useCallback((d: PlanDraft) => {
    const id = newId();
    const next: PlanSpec = {
      id,
      title: (d.title ?? "").trim(),
      rounds: Math.max(1, Number(d.rounds) || 1),
      units: (d.units ?? []).map(u => ({
        name: (u.name ?? "").trim(),
        seconds: Math.max(1, Number(u.seconds) || 1),
        say: (u.say ?? "").trim(),
      })),
    };
    store.updateFlowPlan(id, next);
    try { localStorage.setItem(`plan:${id}`, JSON.stringify(next)); } catch {}
    router.push(`/flows/${id}`);
  }, [router, store]);

  return (
    <div className="p-4">
      <div className="mb-3 text-lg font-semibold">新建流程</div>
      <PlanEditor
        draft={draft}
        setDraft={setDraft}
        onConfirm={(d) => save(d)}
        onCancel={() => router.push("/")}
      />
    </div>
  );
}
