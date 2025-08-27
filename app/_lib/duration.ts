// app/_lib/duration.ts
export type DurationParts = { d?: number; h?: number; m?: number; s?: number };

const clampInt = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);

export function toSeconds(parts: DurationParts): number {
  const d = clampInt(parts.d ?? 0);
  const h = clampInt(parts.h ?? 0);
  const m = clampInt(parts.m ?? 0);
  const s = clampInt(parts.s ?? 0);
  return d * 86400 + h * 3600 + m * 60 + s;
}

export function fromSeconds(totalSeconds: number, showDays = false): Required<DurationParts> {
  let rem = clampInt(totalSeconds);
  if (showDays) {
    const d = Math.floor(rem / 86400); rem -= d * 86400;
    const h = Math.floor(rem / 3600);  rem -= h * 3600;
    const m = Math.floor(rem / 60);    rem -= m * 60;
    const s = rem;
    return { d, h, m, s };
  }
  const h = Math.floor(rem / 3600); rem -= h * 3600;
  const m = Math.floor(rem / 60);   rem -= m * 60;
  const s = rem;
  return { d: 0, h, m, s };
}

/** 英文缩写：1h 2m 3s（默认不显示 d） */
export function formatDurationEn(
  totalSeconds: number,
  opts?: { showDays?: boolean; maxUnits?: number }
): string {
  const { d, h, m, s } = fromSeconds(totalSeconds, opts?.showDays ?? false);
  const arr: string[] = [];
  if ((opts?.showDays ?? false) && d) arr.push(`${d}d`);
  if (h) arr.push(`${h}h`);
  if (m) arr.push(`${m}m`);
  if (s || arr.length === 0) arr.push(`${s}s`);
  return typeof opts?.maxUnits === "number" ? arr.slice(0, opts.maxUnits).join(" ") : arr.join(" ");
}

/** 倒计时表盘：<1h -> mm:ss；≥1h -> h:mm:ss */
export function formatCountdownClock(totalSeconds: number): string {
  const t = clampInt(totalSeconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatHMS(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad2 = (n: number) => n.toString().padStart(2, "0");
  // 小时也固定两位（99h 以上会变成三位，自然显示）
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

