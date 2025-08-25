"use client";

type Props = {
  value: number;                 // 当前轮次
  onChange: (next: number) => void; // 写回（持久化在外面做）
  min?: number;
  disabled?: boolean;
};

export default function RoundsStepper({ value, onChange, min = 1, disabled }: Props) {
  const dec = () => onChange(Math.max(min, (value || 0) - 1));
  const inc = () => onChange((value || 0) + 1);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs opacity-70">轮次</span>
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={dec}
        className={`px-2.5 py-1 rounded-lg text-sm ${disabled || value <= min
          ? "bg-slate-200/60 dark:bg-white/10 text-slate-400 cursor-not-allowed"
          : "bg-slate-200 dark:bg-white/10 hover:bg-slate-300/80 dark:hover:bg-white/20"
        }`}
        aria-label="减一轮"
      >−1</button>

      <div className="px-2 min-w-[2.5rem] text-center tabular-nums select-none">
        {value}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={inc}
        className={`px-2.5 py-1 rounded-lg text-sm ${disabled
          ? "bg-slate-200/60 dark:bg-white/10 text-slate-400 cursor-not-allowed"
          : "bg-slate-200 dark:bg-white/10 hover:bg-slate-300/80 dark:hover:bg-white/20"
        }`}
        aria-label="加一轮"
      >+1</button>
    </div>
  );
}
