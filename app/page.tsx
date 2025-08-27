"use client";
// app/page.tsx

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTimerClient, unlockGlobalAudio } from "./_hooks/useTimerClient";
import type { PlanSpec } from "./_types/timer";
import { formatDurationEn, formatCountdownClock } from "./_lib/duration";
import AppVersionBadge from "./_components/AppVersionBadge";

const k = (id: string) => `plan:${id}`;
const isPlanKey = (s: string | null) => !!s && s.startsWith("plan:");
const newId = () => `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

function readAllPlans(): Record<string, PlanSpec> {
  const out: Record<string, PlanSpec> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!isPlanKey(key)) continue;
    const id = key!.slice(5);
    try {
      const v = localStorage.getItem(key!);
      if (v) out[id] = JSON.parse(v) as PlanSpec;
    } catch { }
  }
  return out;
}
function writePlan(id: string, plan: PlanSpec) { localStorage.setItem(k(id), JSON.stringify(plan)); }
function removePlan(id: string) { localStorage.removeItem(k(id)); }

export default function HomeMobile() {
  const router = useRouter();
  const { flows, start, pause, resume, stop } = useTimerClient();

  const [plans, setPlans] = useState<Record<string, PlanSpec>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPlans(readAllPlans());
    setMounted(true);
    const onStorage = (e: StorageEvent) => {
      if (!e.key || !isPlanKey(e.key)) return;
      setPlans(readAllPlans());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => { setOrder(Object.keys(plans).sort()); }, [plans]);

  // 批量删
  const [bulk, setBulk] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectedCount = selected.size;
  const allSelected = selectedCount > 0 && selectedCount === order.length;

  const enterBulk = useCallback(() => { setBulk(true); setSelected(new Set()); }, []);
  const exitBulk = useCallback(() => { setBulk(false); setSelected(new Set()); }, []);
  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const selectAll = useCallback(() => { setSelected(new Set(order)); }, [order]);
  const clearSel = useCallback(() => { setSelected(new Set()); }, []);
  const deleteSelected = useCallback(() => {
    if (selected.size === 0) return;
    if (!confirm(`确认删除选中的 ${selected.size} 个流程？此操作不可恢复。`)) return;
    const idsToDel = Array.from(selected);
    idsToDel.forEach(id => { try { stop(id); } catch { } });
    idsToDel.forEach(id => removePlan(id));
    setPlans(p => { const np = { ...p }; idsToDel.forEach(id => { delete np[id]; }); return np; });
    setOrder(o => o.filter(id => !selected.has(id)));
    exitBulk();
  }, [exitBulk, selected, stop]);

  const [stoppedFlags, setStoppedFlags] = useState<Record<string, boolean>>({});
  const markStopped = useCallback((fid: string, val: boolean) => { setStoppedFlags(prev => ({ ...prev, [fid]: val })); }, []);

  const [newlyId, setNewlyId] = useState<string | null>(null);
  const duplicateFlow = useCallback((src: PlanSpec) => {
    const id2 = newId();
    const copy: PlanSpec = JSON.parse(JSON.stringify(src));
    copy.title = `${copy.title || "未命名"} (副本)`;
    writePlan(id2, copy);
    setPlans(p => ({ ...p, [id2]: copy }));
    setOrder(o => Array.from(new Set([...o, id2])));
    setNewlyId(id2);
    setTimeout(() => setNewlyId(null), 1600);
  }, []);

  // ✅ 用 Next 客户端路由，避免整页刷新导致计时器重置（原来用了 window.location.assign）
  const gotoCreate = useCallback(() => { router.push("/flows/new"); }, [router]);

  // 打开详情
  const openDetail = useCallback((fid: string) => { router.push(`/flows/${fid}`); }, [router]);

  const items = useMemo(
    () => order.map(fid => ({ fid, plan: plans[fid], view: flows[fid] })).filter(x => !!x.plan),
    [order, plans, flows]
  );

  return (
    <main className="mx-auto max-w-[880px] w-full p-4 space-y-3">
      {!mounted ? (
        <>
          <div className="h-10" />
          <div className="rounded-2xl border p-4" />
        </>
      ) : (
        <>
          {/* 顶栏（含快速删除） */}
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">TimeLoop</div>
            <AppVersionBadge />
            {!bulk ? (
              <button className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100" onClick={enterBulk}>快速删除</button>
            ) : (
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200" onClick={() => (allSelected ? clearSel() : selectAll())}>
                  {allSelected ? "全不选" : "全选"}
                </button>
                <button
                  disabled={selectedCount === 0}
                  className={`px-3 py-1.5 rounded-lg ${selectedCount === 0 ? "bg-rose-50 text-rose-300" : "bg-rose-600 text-white hover:bg-rose-700"}`}
                  onClick={deleteSelected}
                >
                  删除所选 {selectedCount > 0 ? `(${selectedCount})` : ""}
                </button>
                <button className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200" onClick={exitBulk}>完成</button>
              </div>
            )}
          </div>

          {/* 列表 / 空态 */}
          {items.length === 0 ? (
            <button
              type="button"
              onClick={gotoCreate}
              className="w-full rounded-2xl border-2 border-dashed border-slate-300 dark:border-white/20 p-10 text-center text-slate-500 hover:bg-slate-50/60 dark:hover:bg-white/5 transition"
            >
              <div className="text-4xl leading-none">＋</div>
              <div className="mt-2">新建流程</div>
            </button>
          ) : (
            <div className="space-y-3">
              {items.map(({ fid, plan, view }) => {
                const running = !!(view && !view.paused && !view.done);
                const paused = !!(view && view.paused);
                const phaseName = view?.phaseName || "—";
                const idx = typeof view?.unitIndex === "number" ? view.unitIndex : 0;
                const plannedSec = plan.units[idx]?.seconds ?? 0;
                const remainSec = view ? Math.max(0, Math.ceil(view.remainingMs / 1000)) : 0;

                const deltaSec = Math.round((view?.addedMs ?? 0) / 1000);
                const deltaTag = deltaSec === 0 ? null : (
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${deltaSec > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                    {deltaSec > 0 ? `+${deltaSec}s` : `${deltaSec}s`}
                  </span>
                );

                const uxStopped = !!stoppedFlags[fid];
                const showStop = (!!view && view.done) || (uxStopped && !running && !paused);

                const isChecked = selected.has(fid);
                const canStart = Array.isArray(plan?.units) && plan.units.length > 0;

                return (
                  <div
                    key={fid}
                    className={`relative rounded-2xl p-3 border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-white/5 transition-shadow ${newlyId === fid ? "ring-2 ring-emerald-500 shadow-lg" : ""}`}
                    onClick={() => { if (bulk) toggleSelect(fid); }}
                  >
                    {bulk && (
                      <div className="absolute top-3 left-3">
                        <div className={`w-5 h-5 rounded-md border ${isChecked ? "bg-rose-600 border-rose-600" : "bg-white/80 border-slate-300"} flex items-center justify-center text-white text-xs`}>
                          {isChecked ? "✓" : ""}
                        </div>
                      </div>
                    )}

                    <div className={`flex items-center justify-between ${bulk ? "pl-6" : ""}`}>
                      <div className="font-medium">{plan.title}</div>
                      <div className={`px-2 py-0.5 text-xs rounded-lg ${running ? "bg-emerald-100 text-emerald-700" : paused ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                        {running ? "运行中" : paused ? "已暂停" : "就绪"}
                      </div>
                    </div>

                    <div className={`mt-2 flex items-center justify-between ${bulk ? "pl-6" : ""}`}>
                      <div className="text-sm">
                        <div className="opacity-60">当前单元</div>
                        <div className="text-base font-semibold">{phaseName}</div>
                      </div>
                      <div className="text-center">
                        <div className="opacity-60 text-xs">时间（总/剩）</div>
                        <div className="text-2xl font-semibold tabular-nums">
                          {showStop ? (
                            <div className="text-2xl font-semibold tabular-nums">
                              <span className="font-semibold tracking-wide text-rose-600 dark:text-rose-400">STOP</span>
                            </div>
                          ) : (
                            <div className="text-2xl font-semibold tabular-nums">
                              {formatDurationEn(plannedSec)}
                              <span className="mx-1"> / </span>
                              <span>{formatCountdownClock(remainSec)}</span>
                              {deltaTag}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="opacity-60">轮次</div>
                        <div className="font-semibold">{view ? `${(view.roundIndex ?? -1) + 1}/${plan.rounds}` : `0/${plan.rounds}`}</div>
                      </div>
                    </div>

                    {!bulk && (
                      <>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {(!view || view.done || uxStopped) ? (
                            <>
                              <button
                                className={`px-3 py-2 rounded-lg ${canStart ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
                                onClick={(e) => {
                                  if (!canStart ) { e.stopPropagation(); openDetail(fid); return; }
                                  e.stopPropagation();
                                  markStopped(fid, false);
                                  unlockGlobalAudio();
                                  start(fid, plan as PlanSpec);
                                }}
                              >
                                开始
                              </button>
                              <button
                                className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-white/10"
                                onClick={(e) => { e.stopPropagation(); openDetail(fid); }}
                              >详情</button>
                            </>
                          ) : paused ? (
                            <>
                              <button
                                className="px-3 py-2 rounded-lg bg-emerald-600 text-white"
                                onClick={(e) => { e.stopPropagation(); markStopped(fid, false); unlockGlobalAudio(); resume(fid); }}
                              >继续</button>
                              <button
                                className="px-3 py-2 rounded-lg bg-rose-600 text-white"
                                onClick={(e) => { e.stopPropagation(); stop(fid); markStopped(fid, true); }}
                              >停止</button>
                              <button
                                className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-white/10"
                                onClick={(e) => { e.stopPropagation(); openDetail(fid); }}
                              >详情</button>
                            </>
                          ) : (
                            <>
                              <button
                                className="px-3 py-2 rounded-lg bg-slate-900 text-white/90"
                                onClick={(e) => { e.stopPropagation(); pause(fid); }}
                              >暂停</button>
                              <button
                                className="px-3 py-2 rounded-lg bg-rose-600 text-white"
                                onClick={(e) => { e.stopPropagation(); stop(fid); markStopped(fid, true); }}
                              >停止</button>
                              <button
                                className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-white/10"
                                onClick={(e) => { e.stopPropagation(); openDetail(fid); }}
                              >详情</button>
                            </>
                          )}
                        </div>

                        <div className="flex items-center justify-between mt-3">
                          <button
                            className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-white/10 hover:bg-slate-300/80 text-sm"
                            onClick={(e) => { e.stopPropagation(); duplicateFlow(plan); }}
                          >复制</button>

                          <div className="flex items-center gap-2">
                            <button
                              className="px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!confirm(`确认删除流程「${plan.title}」？`)) return;
                                stop(fid);
                                removePlan(fid);
                                setPlans(p => { const np = { ...p }; delete np[fid]; return np; });
                                setOrder(o => o.filter(x => x !== fid));
                              }}
                            >删除</button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {!bulk && (
                <button
                  type="button"
                  onClick={gotoCreate}
                  className="w-full rounded-2xl border-2 border-dashed border-slate-300 dark:border-white/20 p-6 text-center text-slate-500 hover:bg-slate-50/60 dark:hover:bg-white/5 transition"
                >
                  <div className="text-3xl leading-none">＋</div>
                  <div className="mt-1 text-sm">新建流程</div>
                </button>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
