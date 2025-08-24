"use client";

import { useState } from "react";
import type { PlanSpec, UnitSpec } from "../_types/timer";

export type FlowTemplate = {
  id: string;
  title: string;
  prepare?: number;
  betweenRounds?: number;
  rounds: number;
  units: UnitSpec[];
};

const LS_TPL   = "tl_templates_v1";
const LS_PLANS = "tl_flow_plans_v1";
const LS_IDS   = "tl_flow_ids_v1";

function loadLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const raw = window.localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; }
  catch { return fallback; }
}
function saveLS<T>(key: string, val: T) {
  try { window.localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

export function useFlowStore() {
  // 可持久化
  const [templates, setTemplates] = useState<FlowTemplate[]>(
    () => loadLS<FlowTemplate[]>(LS_TPL, [])
  );
  const [flowIds, setFlowIds] = useState<string[]>(
    () => loadLS<string[]>(LS_IDS, [])
  );
  const [flowPlans, setFlowPlans] = useState<Record<string, PlanSpec>>(
    () => loadLS<Record<string, PlanSpec>>(LS_PLANS, {})
  );

  // —— 模板 CRUD —— //
  function addTemplate(t: FlowTemplate) {
    setTemplates(prev => { const next=[t,...prev]; saveLS(LS_TPL,next); return next; });
  }
  function updateTemplate(t: FlowTemplate) {
    setTemplates(prev => { const next=prev.map(x=>x.id===t.id?t:x); saveLS(LS_TPL,next); return next; });
  }
  function removeTemplate(id: string) {
    setTemplates(prev => { const next=prev.filter(x=>x.id!==id); saveLS(LS_TPL,next); return next; });
  }

  function toPlanSpec(t: FlowTemplate): PlanSpec {
    return { id: t.id, title: t.title, prepare: t.prepare, betweenRounds: t.betweenRounds, rounds: t.rounds, units: t.units };
  }

  // —— 流程实例 —— //
  function attachFlow(flowId: string, plan: PlanSpec) {
    setFlowIds(prev => { const next = prev.includes(flowId) ? prev : [flowId, ...prev]; saveLS(LS_IDS,next); return next; });
    setFlowPlans(prev => { const next = { ...prev, [flowId]: plan }; saveLS(LS_PLANS,next); return next; });
  }
  function detachFlow(flowId: string) {
    setFlowIds(prev => { const next = prev.filter(id=>id!==flowId); saveLS(LS_IDS,next); return next; });
    setFlowPlans(prev => { const { [flowId]:_, ...rest } = prev; saveLS(LS_PLANS,rest); return rest; });
  }
  function getFlowPlan(flowId: string) { return flowPlans[flowId]; }

  // ✅ 运行中流程的计划更新（用于“编辑流程”页）
  function updateFlowPlan(flowId: string, plan: PlanSpec) {
    setFlowPlans(prev => { const next = { ...prev, [flowId]: plan }; saveLS(LS_PLANS,next); return next; });
  }

  return {
    templates, addTemplate, updateTemplate, removeTemplate, toPlanSpec,
    flowIds, attachFlow, detachFlow, getFlowPlan, updateFlowPlan,
  };
}
