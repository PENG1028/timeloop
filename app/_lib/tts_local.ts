"use client";

export type LocalTTSOpts = {
  text: string;
  voiceHint?: string; // 可传 "zh" 或具体 voice 名称关键字
  rate?: number;      // 0.5–2
  pitch?: number;     // -12..+12 近似映射到 0..2
  lang?: string;      // 默认 "zh-CN"
};

export function isAvailable() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function pickVoice(hint?: string, lang?: string) {
  const synth = window.speechSynthesis;
  let voices = synth.getVoices();
  if (!voices || voices.length === 0) {
    // 有些浏览器首次需要触发一次获取
    synth.getVoices();
    voices = synth.getVoices();
  }
  const wantLang = lang || "zh-CN";
  // 先挑中文，再按 hint 关键字匹配
  let list = voices.filter(v => (v.lang || "").toLowerCase().startsWith(wantLang.toLowerCase().slice(0,2)));
  if (hint) {
    const h = hint.toLowerCase();
    const hit = list.find(v => (v.name || "").toLowerCase().includes(h) || (v.lang || "").toLowerCase().includes(h));
    if (hit) return hit;
  }
  return list[0] || voices[0] || null;
}

export function speak({ text, voiceHint, rate = 1.0, pitch = 0, lang = "zh-CN" }: LocalTTSOpts) {
  if (!isAvailable()) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const v = pickVoice(voiceHint, lang);
  if (v) u.voice = v;
  // Web Speech 的取值范围：rate 0.1–10、pitch 0–2
  u.rate = Math.min(2, Math.max(0.5, rate));
  const p = 1 + (pitch / 12); // -12..+12 → ~0..2
  u.pitch = Math.min(2, Math.max(0, p));
  window.speechSynthesis.speak(u);
  return true;
}

export function cancel() {
  if (isAvailable()) window.speechSynthesis.cancel();
}

export function speakAsync(opts: LocalTTSOpts): Promise<void> {
  return new Promise((resolve) => {
    if (!isAvailable()) return resolve();
    const u = new SpeechSynthesisUtterance(opts.text);
    u.lang = opts.lang || "zh-CN";
    const v = pickVoice(opts.voiceHint, u.lang);
    if (v) u.voice = v;
    u.rate = Math.min(2, Math.max(0.5, opts.rate ?? 1.0));
    u.pitch = Math.min(2, Math.max(0, 1 + (opts.pitch ?? 0) / 12));
    u.onend = () => resolve();
    window.speechSynthesis.speak(u);
  });
}
