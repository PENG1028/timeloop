"use client";

import { useEffect, useRef, useState } from "react";


export default function AudioLabPage() {
  // ① 所有 hooks 无条件调用（不要在 hooks 前 return）
  const [mounted, setMounted] = useState(false);
  const audioRef = useRef<any>(null);
  const unlockedRef = useRef(false);

  // UI 状态（默认值固定；mounted 后再从 localStorage 回填）
  const [master, setMaster] = useState(1);
  const [beepOn, setBeepOn] = useState(true);
  const [ttsOn, setTtsOn] = useState(true);
  const [text, setText] = useState("你好，这是语音测试。");

  useEffect(() => {
    setMounted(true);
  }, []);

  // ② 挂载后再创建音频引擎（动态 import，避免 SSR/Hydration 问题）
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    (async () => {
      try {
        const { AudioEngine } = await import("../../_lib/audio"); // ← 注意相对路径
        if (cancelled) return;
        audioRef.current = new AudioEngine();
        // 回填设置
        try {
          const m = Number(localStorage.getItem("tl_master") ?? "1");
          const bo = localStorage.getItem("tl_beep_on") !== "0";
          const to = localStorage.getItem("tl_tts_on") !== "0";
          if (isFinite(m)) setMaster(m);
          setBeepOn(bo);
          setTtsOn(to);
        } catch {}
      } catch (e) {
        console.error("Audio init failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [mounted]);

  // ③ 同步设置到引擎 & 本地存储（副作用允许依赖 mounted）
  useEffect(() => {
    if (!mounted) return;
    try { localStorage.setItem("tl_master", String(master)); } catch {}
    audioRef.current?.setMasterVolume?.(master);
  }, [mounted, master]);

  useEffect(() => {
    if (!mounted) return;
    try { localStorage.setItem("tl_beep_on", beepOn ? "1" : "0"); } catch {}
    audioRef.current?.setBeepEnabled?.(beepOn);
  }, [mounted, beepOn]);

  useEffect(() => {
    if (!mounted) return;
    try { localStorage.setItem("tl_tts_on", ttsOn ? "1" : "0"); } catch {}
    audioRef.current?.setTtsEnabled?.(ttsOn);
  }, [mounted, ttsOn]);

  // ④ 正确的解锁：挑一个可用方法再调用（不会白屏）
  function unlockAudio() {
    const a = audioRef.current;
    if (!a) return;
    const fn =
      (typeof a.unlock === "function" && a.unlock) ||
      (typeof a.resume === "function" && a.resume) ||
      (typeof a.ensureUnlocked === "function" && a.ensureUnlocked) ||
      (a.audioContext && typeof a.audioContext.resume === "function" && a.audioContext.resume);
    if (fn) { fn.call(a); unlockedRef.current = true; }
  }

  function testBeep() {
    if (!unlockedRef.current) unlockAudio();
    if (audioRef.current?.beep) {
      audioRef.current.beep();
      return;
    }
    // 浏览器兜底蜂鸣
    try {
      const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new AC();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = 880;
      g.gain.value = 0.15;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      setTimeout(()=>{ o.stop(); ctx.close(); }, 160);
    } catch {}
  }

  function testSpeak() {
    if (!unlockedRef.current) unlockAudio();
    if (audioRef.current?.speak) {
      audioRef.current.speak(text);
      return;
    }
    // 浏览器兜底 TTS
    try {
      const u = new SpeechSynthesisUtterance(text || "语音测试");
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {}
  }

  // ⑤ 返回里用条件渲染骨架（不要在 hooks 之前 return）
  return (
    <main className="p-4">
      {!mounted ? (
        <div className="rounded-2xl border p-4">loading…</div>
      ) : (
        <div className="rounded-2xl border p-4 space-y-3">
          <div className="text-lg font-semibold">音频调试</div>

          <button className="px-3 py-2 rounded bg-emerald-600 text-white w-full" onClick={unlockAudio}>
            解锁音频（先点我）
          </button>

          <label className="text-sm opacity-70">主音量：{master.toFixed(2)}</label>
          <input type="range" min={0} max={1} step={0.01} value={master} onChange={e=>setMaster(Number(e.target.value))} />

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={beepOn} onChange={e=>setBeepOn(e.target.checked)} />
            开启蜂鸣
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={ttsOn} onChange={e=>setTtsOn(e.target.checked)} />
            开启语音播报
          </label>

          <textarea className="w-full rounded border p-2" rows={3} value={text} onChange={e=>setText(e.target.value)} />

          <div className="grid grid-cols-2 gap-2">
            <button className="px-3 py-2 rounded bg-slate-900 text-white/90" onClick={testSpeak}>播报测试</button>
            <button className="px-3 py-2 rounded bg-indigo-600 text-white" onClick={testBeep}>蜂鸣测试</button>
          </div>

          <div className="text-xs opacity-60">
            若无声：先点击“解锁音频”；检查系统音量/静音键；iOS 需要一次用户点击后才能发声。
          </div>
        </div>
      )}
    </main>
  );
}
