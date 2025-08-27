// /components/DurationCard.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fromSeconds, toSeconds, formatDurationEn } from "../_lib/duration";

type Props = {
  label?: string;                 // 标题，如 "Duration"
  valueSeconds: number;           // 绑定值（秒）
  onChange: (seconds: number) => void;
  minSeconds?: number;            // 默认 1
  maxSeconds?: number;            // 默认 604800 (7d)
  showDays?: boolean;             // 默认 false（你的需求：默认不要天）
  hintPreview?: boolean;          // 右侧是否展示 "= 1h 20m" 预览
  allowZero?: boolean;            // 个别字段可为 0（如准备/轮间）
};

export default function DurationCard({
  label = "Duration",
  valueSeconds,
  onChange,
  minSeconds = 1,
  maxSeconds = 604800,
  showDays = false,
  hintPreview = true,
  allowZero = false,
}: Props) {
  const clamp = useCallback(
    (sec: number) => {
      const min = allowZero ? 0 : Math.max(1, minSeconds);
      return Math.min(maxSeconds, Math.max(min, sec | 0));
    },
    [allowZero, minSeconds, maxSeconds]
  );

  // 内部展示为 d/h/m/s（默认不显示 d）
  const init = useMemo(() => fromSeconds(valueSeconds, showDays), [valueSeconds, showDays]);
  const [h, setH] = useState<number>(init.h);
  const [m, setM] = useState<number>(init.m);
  const [s, setS] = useState<number>(init.s);
  const [d, setD] = useState<number>(init.d); // 仅当 showDays=true 时可见

  // 外部值变化时，同步
  useEffect(() => {
    const { d, h, m, s } = fromSeconds(valueSeconds, showDays);
    setD(d); setH(h); setM(m); setS(s);
  }, [valueSeconds, showDays]);

  const emit = useCallback((next: { d?: number; h?: number; m?: number; s?: number }) => {
    const sec = clamp(toSeconds({
      d: showDays ? (next.d ?? d) : 0,
      h: next.h ?? h,
      m: next.m ?? m,
      s: next.s ?? s,
    }));
    onChange(sec);
  }, [clamp, d, h, m, s, onChange, showDays]);

  const num = (x: string) => (x.trim() === "" ? 0 : Math.max(0, Math.floor(Number(x) || 0)));

  return (
    <div className="rounded-2xl border border-slate-200/60 dark:border-white/10 p-4 shadow-sm bg-white/60 dark:bg-slate-900/40 backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</div>
        {hintPreview && (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            = {formatDurationEn(valueSeconds, { showDays })}
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {showDays && (
          <Field
            label="d"
            value={d}
            onChange={(v) => { setD(v); emit({ d: v }); }}
          />
        )}
        <Field
          label="h"
          value={h}
          onChange={(v) => { setH(v); emit({ h: v }); }}
        />
        <Field
          label="m"
          value={m}
          onChange={(v) => { setM(v); emit({ m: v }); }}
        />
        <Field
          label="s"
          value={s}
          onChange={(v) => { setS(v); emit({ s: v }); }}
        />
      </div>

      {/* 边界提示（可选，保持低干扰） */}
      <div className="mt-2 text-xs text-slate-400">
        {!allowZero && valueSeconds < 1 && <span>Min 1s.</span>}
        {valueSeconds > maxSeconds && <span> Max {formatDurationEn(maxSeconds)}.</span>}
      </div>
    </div>
  );

  function Field({
    label, value, onChange,
  }: { label: "d" | "h" | "m" | "s"; value: number; onChange: (v: number) => void }) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 dark:border-white/10 px-3 py-2 bg-white/80 dark:bg-slate-950/40">
        <input
          type="number"
          inputMode="numeric"
          className="w-full bg-transparent outline-none text-base tabular-nums text-slate-900 dark:text-white"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(num(e.target.value))}
          min={0}
        />
        <span className="select-none text-sm font-medium text-slate-500 dark:text-slate-400 uppercase">{label}</span>
      </div>
    );
  }
}
