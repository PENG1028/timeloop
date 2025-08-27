"use client";

import React, {
    useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle,
} from "react";
import { formatHMS } from "../_lib/duration";

type Props = {
    seconds: number;
    onChange: (seconds: number) => void;
    label?: string;
    maxHours?: number; // 建议 23 或 99
};

export default function DurationPicker({ seconds, onChange, label, maxHours = 99 }: Props) {
    const [open, setOpen] = useState(false);

    const h0 = Math.floor(Math.max(0, seconds) / 3600);
    const m0 = Math.floor((Math.max(0, seconds) % 3600) / 60);
    const s0 = Math.max(0, seconds) % 60;

    const hRef = useRef<WheelHandle>(null);
    const mRef = useRef<WheelHandle>(null);
    const sRef = useRef<WheelHandle>(null);

    const apply = () => {
        // ✅ 不依赖内部 state，直接读“此刻绿框中心”的值（即使还在惯性滚动）
        const hh = hRef.current?.readNearest() ?? h0;
        const mm = mRef.current?.readNearest() ?? m0;
        const ss = sRef.current?.readNearest() ?? s0;
        onChange(Math.max(0, hh * 3600 + mm * 60 + ss));
        setOpen(false);
    };

    return (
        <>
            <div className="flex items-center gap-3">
                {label && <div className="text-xs text-slate-400">{label}</div>}
                <button
                    type="button"
                    className="px-3 py-2 rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-slate-950/40 tabular-nums"
                    onClick={() => setOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                >
                    {formatHMS(seconds)}
                </button>
            </div>

            {open && (
                <Dialog onClose={() => setOpen(false)}>
                    <div className="w-[min(92vw,520px)] rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-4">
                        <div className="flex items-center justify-center py-1">
                            <div className="text-sm font-medium tracking-wide">设置时长</div>
                        </div>

                        <div className="mt-2 relative grid grid-cols-3 gap-3">
                            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-10 rounded-md ring-1 ring-inset ring-emerald-500/70" />
                            <Wheel ref={hRef} initial={h0} min={0} max={maxHours} />
                            <Wheel ref={mRef} initial={m0} min={0} max={59} />
                            <Wheel ref={sRef} initial={s0} min={0} max={59} />
                        </div>

                        <div className="mt-4 flex justify-end gap-2">
                            <button className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-white/10" onClick={() => setOpen(false)}>
                                关闭
                            </button>
                            <button className="px-3 py-2 rounded-lg bg-emerald-600 text-white" onClick={apply}>
                                确认
                            </button>
                        </div>
                    </div>
                </Dialog>
            )}
        </>
    );
}

function Dialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10">{children}</div>
        </div>
    );
}

/* ---------------- Wheel（修复重声明 setScrollToValue） ---------------- */

const ITEM_H = 40;   // 对齐 h-10
const REPEAT = 8;   // 无限列表重复段数
const STOP_MS = 120; // 停止判定
const SNAP_MS = 180; // 吸附动画时长

const BIAS_PX = 0; // 数字“视觉中心”上移补偿；常见取值 0.5–1.0，可按设备微调 10

type WheelHandle = {
    read: () => number;           // 最近一次确定的值
    readNearest: () => number;    // 此刻绿框中心的即时值
    set: (v: number) => void;
};

const Wheel = forwardRef(function Wheel(
    { label, initial, min = 0, max = 59 }: { label?: string; initial: number; min?: number; max?: number },
    ref: React.Ref<WheelHandle>
) {
    const range = max - min + 1;
    const TOTAL = range * REPEAT;
    const MID_START = Math.floor(REPEAT / 2) * range;

    const items = useMemo(() => {
        const arr: number[] = new Array(TOTAL);
        for (let i = 0; i < TOTAL; i++) arr[i] = min + (i % range);
        return arr;
    }, [TOTAL, range, min]);

    const elRef = useRef<HTMLDivElement | null>(null);
    const centerOffset = useRef(0);
    const curValRef = useRef<number>(Math.max(min, Math.min(max, initial)));
    const isSnappingRef = useRef(false);
    const suppressNextScrollRef = useRef(false);
    const stopTimer = useRef<number | null>(null);
    const rafPaint = useRef<number | null>(null);
    const rafSnap = useRef<number | null>(null);

    const measureCenter = useCallback(() => {
        const el = elRef.current;
        if (!el) return;
        centerOffset.current = (el.clientHeight - ITEM_H) / 2;
    }, []);
    useLayoutEffect(measureCenter, []);
    useEffect(() => {
        const onResize = () => measureCenter();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [measureCenter]);

    const positionToValue = useCallback(() => {
        const el = elRef.current!;
        const centerPx = el.scrollTop + centerOffset.current;
        const rough = Math.round(centerPx / ITEM_H);
        let bestIdx = Math.max(0, Math.min(items.length - 1, rough));
        let bestDist = Math.abs(bestIdx * ITEM_H - centerPx);
        for (let i = bestIdx - 3; i <= bestIdx + 3; i++) {
            if (i < 0 || i >= items.length) continue;
            const d = Math.abs(i * ITEM_H - centerPx);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        return { index: bestIdx, val: items[bestIdx] };
    }, [items]);

    /** ✅ 唯一的 setScrollToValue 定义（之前就是这里重名了） */
    const setScrollToValue = useCallback((v: number) => {
        const el = elRef.current!;
        const idx = (v - min + range) % range;
        const index = MID_START + idx;
        el.scrollTop = index * ITEM_H - centerOffset.current;
    }, [range, min]);

    // 初始化定位
    useEffect(() => { setScrollToValue(curValRef.current); }, [setScrollToValue]);

    // 暴露 API
    useImperativeHandle(ref, () => ({
        read: () => curValRef.current,
        readNearest: () => positionToValue().val,
        set: (v: number) => {
            curValRef.current = Math.max(min, Math.min(max, v));
            setScrollToValue(curValRef.current);
        },
    }), [min, max, positionToValue, setScrollToValue]);

    // 立体感（只 scale，不透明度）
    const paintWheel = useCallback(() => {
        const el = elRef.current!;
        const center = (el.scrollTop + centerOffset.current) / ITEM_H;
        const wrap = el.firstElementChild as HTMLElement;
        if (!wrap) return;
        const children = wrap.children;
        const R = 8;
        const first = Math.max(0, Math.floor(center) - R);
        const last = Math.min(items.length - 1, Math.floor(center) + R);
        for (let i = first; i <= last; i++) {
            const d = Math.abs(i - center);
            const scale = Math.max(0.9, 1 - d * 0.05);
            (children[i] as HTMLElement).style.transform = `translateY(-${BIAS_PX}px) scale(${scale})`;
        }
    }, [items.length]);

    const snapToIndex = useCallback((index: number) => {
        const el = elRef.current!;
        const start = el.scrollTop;
        const end = index * ITEM_H - centerOffset.current;
        const delta = end - start;
        if (Math.abs(delta) < 0.5) { el.scrollTop = end; return; }
        const t0 = performance.now();
        const ease = (x: number) => 1 - Math.pow(1 - x, 3);
        isSnappingRef.current = true;
        const step = (now: number) => {
            const p = Math.min(1, (now - t0) / SNAP_MS);
            el.scrollTop = start + delta * ease(p);
            if (p < 1) {
                rafSnap.current = requestAnimationFrame(step);
            } else {
                el.scrollTop = Math.round(end);
                isSnappingRef.current = false;
                // 边缘无感回中段
                if (index < range * 2 || index > TOTAL - range * 2) {
                    const val = items[index];
                    const idxInRange = (val - min + range) % range;
                    const midIdx = MID_START + idxInRange;
                    suppressNextScrollRef.current = true;
                    el.scrollTop = Math.round(midIdx * ITEM_H - centerOffset.current);
                    requestAnimationFrame(() => { suppressNextScrollRef.current = false; });
                }
            }
        };
        if (rafSnap.current) cancelAnimationFrame(rafSnap.current);
        rafSnap.current = requestAnimationFrame(step);
    }, [range, min, items, TOTAL]);

    // 滚动监听：停止后柔和吸附到中心最近项
    useEffect(() => {
        const el = elRef.current!;
        const onScroll = () => {
            if (suppressNextScrollRef.current) return;
            if (rafPaint.current) cancelAnimationFrame(rafPaint.current);
            rafPaint.current = requestAnimationFrame(paintWheel);

            if (isSnappingRef.current) return;
            if (stopTimer.current) clearTimeout(stopTimer.current);
            stopTimer.current = window.setTimeout(() => {
                const { index, val } = positionToValue();
                curValRef.current = val;
                snapToIndex(index);
            }, STOP_MS);
        };

        const quickSnap = () => {
            if (stopTimer.current) clearTimeout(stopTimer.current);
            stopTimer.current = window.setTimeout(() => {
                const { index, val } = positionToValue();
                curValRef.current = val;
                snapToIndex(index);
            }, 60);
        };

        paintWheel();
        el.addEventListener("scroll", onScroll, { passive: true } as any);
        el.addEventListener("pointerup", quickSnap as any, { passive: true } as any);
        el.addEventListener("touchend", quickSnap as any, { passive: true } as any);

        return () => {
            el.removeEventListener("scroll", onScroll as any);
            el.removeEventListener("pointerup", quickSnap as any);
            el.removeEventListener("touchend", quickSnap as any);
            if (rafPaint.current) cancelAnimationFrame(rafPaint.current);
            if (rafSnap.current) cancelAnimationFrame(rafSnap.current);
            if (stopTimer.current) clearTimeout(stopTimer.current);
        };
    }, [paintWheel, positionToValue, snapToIndex]);

    // 键盘微调
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowUp") {
            e.preventDefault();
            const v = Math.max(min, curValRef.current - 1);
            curValRef.current = v; setScrollToValue(v);
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            const v = Math.min(max, curValRef.current + 1);
            curValRef.current = v; setScrollToValue(v);
        }
    };

    return (
        <div className="text-center select-none">
            <div
                ref={elRef}
                tabIndex={0}
                onKeyDown={onKeyDown}
                className="relative mx-auto h-[200px] w-full overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] will-change-scroll"
                style={{
                    textRendering: "geometricPrecision",
                    WebkitFontSmoothing: "antialiased",
                    WebkitOverflowScrolling: "touch",
                    overscrollBehavior: "contain",
                    WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 20%, black 80%, transparent 100%)",
                    maskImage: "linear-gradient(to bottom, transparent 0, black 20%, black 80%, transparent 100%)",
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                <div>
                    {items.map((n, i) => (
                        <div
                            key={i}
                            className="h-10 leading-[40px] text-lg tabular-nums text-center transition-transform duration-100"
                            style={{
                                transformOrigin: "50% 50%"
                            }}
                        >
                            {n.toString().padStart(2, "0")}
                        </div>
                    ))}
                </div>
            </div>
            <style jsx>{`
        [scrollbar-width='none'] { scrollbar-width: none; }
        [scrollbar-width='none']::-webkit-scrollbar { display: none; }
      `}</style>
        </div>
    );
});
