"use client";

import { sha256Hex } from "./hash";
import * as cache from "./cache";

export type TTSOpts = {
  text: string;
  voiceId?: string;
  rate?: number;    // 1.0 = 正常
  pitch?: number;   // 0 = 正常
  sr?: number;      // 24000
  lang?: string;    // "zh"
};

/** 生成与缓存键一致的 key（包含参数，避免串音） */
export async function ttsKey(opts: TTSOpts): Promise<string> {
  const voice = opts.voiceId ?? "default";
  const rate  = typeof opts.rate  === "number" ? opts.rate  : 1.0;
  const pitch = typeof opts.pitch === "number" ? opts.pitch : 0;
  const sr    = typeof opts.sr    === "number" ? opts.sr    : 24000;
  const lang  = opts.lang ?? "zh";
  const sig = `tts:v1|${opts.text}|voice=${voice}|rate=${rate}|pitch=${pitch}|sr=${sr}|lang=${lang}`;
  return sha256Hex(sig);
}

/** 确保本地可播：优先读本地缓存，未命中则请求 /api/tts，成功后写缓存并返回 */
export async function ensureTTS(opts: TTSOpts): Promise<{ hash: string; fromCache: boolean; blob: Blob }> {
  const hash = await ttsKey(opts);
  const cached = await cache.getAudio(hash);
  if (cached) {
    return { hash, fromCache: true, blob: cached };
  }

  const q = new URLSearchParams({
    text: opts.text,
    voice: opts.voiceId ?? "default",
    rate: String(opts.rate ?? 1.0),
    pitch: String(opts.pitch ?? 0),
    sr: String(opts.sr ?? 24000),
    lang: opts.lang ?? "zh",
  });

  // NOTE: 这里用本地 /api/tts Mock；以后替换为你的 CPU TTS 服务地址即可
  const res = await fetch(`/api/tts?${q.toString()}`, { method: "GET" });
  if (!res.ok) throw new Error(`TTS request failed: ${res.status}`);
  const blob = await res.blob();

  await cache.putAudio(hash, blob, {
    contentType: blob.type || "audio/wav",
    text: opts.text, voiceId: opts.voiceId, rate: opts.rate, pitch: opts.pitch, sr: opts.sr, lang: opts.lang,
  });

  return { hash, fromCache: false, blob };
}
