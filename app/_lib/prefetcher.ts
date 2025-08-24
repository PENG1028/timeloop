"use client";

import type { Event, PlanSpec } from "../_types/timer";
import { buildSpeechSeq } from "./speechPlan";
import { ensureTTS, type TTSOpts } from "./tts";
import type { AudioEngine } from "./audio";
import * as localTTS from "./tts_local";

type FlowCtx = {
  spec: PlanSpec;
  seq: ReturnType<typeof buildSpeechSeq>;
  pos: { unitIndex: number; roundIndex: number };
  unitsPerRound: number;
  offset: number;
  q: string[];         // 插播队列（文本）
  busy: boolean;       // 队列是否在播
};

export type Scope = "unit" | "round" | "run";

export class Prefetcher {
  private audio: AudioEngine;
  private flows = new Map<string, FlowCtx>();
  private autoSpeak = false;
  private prefetchLookahead = 1;
  private voice: Partial<TTSOpts> = { lang: "zh", sr: 24000 };
  private useLocal = false;
  private onSpoken?: (flowId: string, text: string) => void; // 播放完回调（给 UI 刷新队列）

  constructor(audio: AudioEngine) { this.audio = audio; }

  setAutoSpeak(v: boolean) { this.autoSpeak = !!v; }
  setLookahead(n: number) { this.prefetchLookahead = Math.max(0, Math.min(3, Math.floor(n))); }
  setVoice(opts: Partial<TTSOpts>) { this.voice = { ...this.voice, ...opts }; }
  setUseLocalTTS(v: boolean) { this.useLocal = !!v; }
  setOnSpoken(cb?: (flowId: string, text: string) => void) { this.onSpoken = cb; }

  onStart(flowId: string, spec: PlanSpec) {
    const seq = buildSpeechSeq(spec);
    const hasBetween = !!(spec.betweenRounds && spec.betweenRounds > 0);
    const unitsPerRound = spec.units.length + (hasBetween ? 1 : 0);
    const offset = spec.prepare && spec.prepare > 0 ? 1 : 0;

    this.flows.set(flowId, {
      spec, seq,
      pos: { unitIndex: 0, roundIndex: 0 },
      unitsPerRound, offset,
      q: [], busy: false
    });

    if (!this.useLocal) {
      for (let k = 0; k <= this.prefetchLookahead && k < seq.length; k++) {
        const item = seq[k];
        if (item?.say) this.prefetch(item.say);
      }
    }
  }

  // —— Worker 事件 —— //
  async handleEvent(ev: Event) {
    if (ev.type !== "FLOW_PHASE_ENTER") return;
    const ctx = this.flows.get(ev.flowId);
    if (!ctx) return;
    ctx.pos = { unitIndex: ev.unitIndex, roundIndex: ev.roundIndex };

    const cur = ctx.seq[ev.unitIndex];
    if (this.autoSpeak && cur?.say) {
      this.enqueue(ev.flowId, cur.say);
    }

    if (!this.useLocal) {
      for (let k = 1; k <= this.prefetchLookahead; k++) {
        const nxt = ctx.seq[ev.unitIndex + k];
        if (nxt?.say) this.prefetch(nxt.say);
      }
    }
  }

  // —— 队列 API —— //
  getQueue(flowId: string) { return (this.flows.get(flowId)?.q ?? []).slice(); }

  enqueue(flowId: string, text: string) {
    const ctx = this.flows.get(flowId);
    if (!ctx) return;
    ctx.q.push(text);
    this.drain(flowId);
  }

  private async drain(flowId: string) {
    const ctx = this.flows.get(flowId);
    if (!ctx || ctx.busy) return;
    ctx.busy = true;
    try {
      while (ctx.q.length > 0) {
        const text = ctx.q.shift()!;
        if (this.useLocal && localTTS.isAvailable()) {
          await localTTS.speakAsync({ text, lang: (this.voice.lang as string) || "zh-CN" });
        } else {
          const { blob } = await this.prefetch(text);
          await this.audio.playBlobNow(blob);
        }
        this.onSpoken?.(flowId, text);
      }
    } finally {
      ctx.busy = false;
    }
  }

  /** 立即播放（仍走队列，放到队首） */
  sayNow(flowId: string, text: string) {
    const ctx = this.flows.get(flowId);
    if (!ctx) return;
    ctx.q.unshift(text);
    this.drain(flowId);
  }

  // —— 计划文本替换/清除 —— //
  updateSay(flowId: string, scope: Scope, text: string) {
    const ctx = this.flows.get(flowId);
    if (!ctx) return { changed: 0 };
    const { unitIndex } = ctx.pos;
    const i0 = this.scopeStartIndex(ctx, scope, unitIndex);
    const i1 = this.scopeEndIndex(ctx, scope, unitIndex);
    let changed = 0;
    for (let i = i0; i <= i1 && i < ctx.seq.length; i++) {
      if (ctx.seq[i].name === "betweenRounds") continue;
      if (ctx.seq[i].say !== text) { ctx.seq[i].say = text; changed++; }
    }
    if (!this.useLocal && changed > 0) this.prefetch(text);
    return { changed };
  }

  clearSay(flowId: string, scope: Scope) {
    const ctx = this.flows.get(flowId);
    if (!ctx) return { cleared: 0 };
    const { unitIndex } = ctx.pos;
    const i0 = this.scopeStartIndex(ctx, scope, unitIndex);
    const i1 = this.scopeEndIndex(ctx, scope, unitIndex);
    let cleared = 0;
    for (let i = i0; i <= i1 && i < ctx.seq.length; i++) {
      if (ctx.seq[i].name === "betweenRounds") continue;
      if (ctx.seq[i].say != null) { ctx.seq[i].say = undefined; cleared++; }
    }
    return { cleared };
  }

  // —— 工具 —— //
  private scopeStartIndex(ctx: FlowCtx, scope: Scope, unitIndex: number) {
    if (scope === "unit") return unitIndex;
    if (scope === "round") {
      const { unitsPerRound, offset } = ctx;
      const curRound = Math.max(0, Math.floor((unitIndex - offset) / Math.max(1, unitsPerRound)));
      return offset + curRound * unitsPerRound + Math.max(0, (unitIndex - (offset + curRound * unitsPerRound)));
    }
    return unitIndex;
  }
  private scopeEndIndex(ctx: FlowCtx, scope: Scope, unitIndex: number) {
    if (scope === "unit") return unitIndex;
    if (scope === "round") {
      const { unitsPerRound, offset } = ctx;
      const curRound = Math.max(0, Math.floor((unitIndex - offset) / Math.max(1, unitsPerRound)));
      return offset + (curRound + 1) * unitsPerRound - 1;
    }
    return ctx.seq.length - 1;
  }

  private prefetch(text: string) { return ensureTTS({ text, ...this.voice }); }
}
