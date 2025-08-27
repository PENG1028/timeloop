"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useFlowStore } from "../../../_store/flows";
import PlanEditor, { type PlanDraft } from "../../../_components/PlanEditor";
import type { PlanSpec } from "../../../_types/timer";

export default function FlowDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const store = useFlowStore();
  const id = params.id;

  // 取计划；没有就给一个默认草稿
  const plan = store.getFlowPlan(id);
  const [draft, setDraft] = useState<PlanDraft>(() => ({
    title: plan?.title ?? "",
    rounds: plan?.rounds ?? 1,
    units: (plan?.units ?? [{ name: "单元 1", seconds: 30, say: "" }]).map(u => ({
      name: u.name ?? "",
      seconds: u.seconds ?? 30,
      say: u.say ?? "",
    })),
  }));

  // 完成：保存并返回首页
  const onConfirm = useCallback((d: PlanDraft) => {
    const next: PlanSpec = {
      id: params.id, 
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
    router.push("/"); // 返回列表
  }, [id, router, store]);

  return (
    <div className="p-4">
      <div className="mb-3 text-lg font-semibold">编辑流程</div>

      <PlanEditor
        draft={draft}
        setDraft={setDraft}
        onConfirm={onConfirm}
        onCancel={() => router.push("/")}
      />
    </div>
  );
}
