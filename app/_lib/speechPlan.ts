"use client";

import type { PlanSpec } from "../_types/timer";

export type SpeechItem = { name: string; say?: string };

/** 把 PlanSpec 展开成与时间线一一对应的“说话序列”
 *  注意：不做任何默认文案回退；只有 say 存在才会有播报。
 */
export function buildSpeechSeq(spec: PlanSpec): SpeechItem[] {
  const seq: SpeechItem[] = [];
  if (spec.prepare && spec.prepare > 0) {
    // 可选：如果你想让准备阶段播报，给 UI 里加一个“准备 say”输入，再把它放到 say 字段里
    seq.push({ name: "prepare", say: undefined });
  }
  for (let r = 0; r < spec.rounds; r++) {
    for (const u of spec.units) {
      seq.push({ name: u.name, say: u.say });
    }
    if (r < spec.rounds - 1 && spec.betweenRounds && spec.betweenRounds > 0) {
      seq.push({ name: "betweenRounds", say: undefined });
    }
  }
  return seq;
}
