"use client";

import { formatCountdownClock, formatDurationEn } from "../_lib/duration";

export default function RemainingLabel({
  remainingSeconds,
  mode = "clock",            // "clock" -> 00:00 / h:mm:ss；"labels" -> 1h 2m 3s
  stopText = "STOP",
}: {
  remainingSeconds: number;
  mode?: "clock" | "labels";
  stopText?: string;
}) {
  if (remainingSeconds <= 0) {
    return <span className="font-semibold tracking-wide text-rose-600 dark:text-rose-400">{stopText}</span>;
  }
  return (
    <span className="tabular-nums">
      {mode === "clock" ? formatCountdownClock(remainingSeconds) : formatDurationEn(remainingSeconds)}
    </span>
  );
}
