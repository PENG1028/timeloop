// app/_lib/audio.ts
export type TLEvent =
  | { type: "FLOW_PHASE_ENTER"; flowId: string; phaseName: string; unitIndex: number; roundIndex: number; endsAt: number; totalMs: number }
  | { type: "FLOW_TICK"; flowId: string; remainingMs: number; phaseName: string; unitIndex: number; roundIndex: number }
  | { type: "FLOW_STATE" | "FLOW_DONE" | "ADJUST_APPLIED" | "ERROR"; [k: string]: any };

const OFFSET_KEY = "tl_audio_offset_ms";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private mainGain: GainNode | null = null;
  private master = 1;
  private beepOn = true;
  private ttsOn = true;

  private ensureCtx() {
    if (this.ctx) return;
    const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.mainGain = this.ctx.createGain();
    this.mainGain.gain.value = this.master;
    this.mainGain.connect(this.ctx.destination);
  }

  unlock() {
    this.ensureCtx();
    if (this.ctx?.state === "suspended") this.ctx.resume();
  }

  setMasterVolume(v: number) { this.master = Math.max(0, Math.min(1, v)); if (this.mainGain) this.mainGain.gain.value = this.master; }
  setBeepEnabled(b: boolean) { this.beepOn = !!b; }
  setTtsEnabled(b: boolean)  { this.ttsOn  = !!b; }

  beep() {
    if (!this.beepOn) return;
    this.ensureCtx();
    if (!this.ctx || !this.mainGain) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine"; o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g); g.connect(this.mainGain);
    o.start();
    setTimeout(()=>{ try{ o.stop(); o.disconnect(); g.disconnect(); }catch{} }, 180);
  }

  speak(text: string) {
    if (!this.ttsOn) return;
    try {
      const u = new SpeechSynthesisUtterance(text || "测试播报");
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { console.warn("TTS failed", e); }
  }

  handleEvent(ev: any) {
    if (ev?.type === "BEEP") this.beep();
    if (ev?.type === "TTS_SAY" && ev.text) this.speak(ev.text);
  }
}

/** 开发用：离线渲染一段哔声为 WAV Blob，便于测试缓存 */
export async function renderToneWavBlob(freq = 880, durMs = 250, sampleRate = 24000): Promise<Blob> {
  const length = Math.ceil(sampleRate * (durMs / 1000));
  // @ts-ignore
  const ctx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(1, length, sampleRate);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  osc.connect(g); g.connect(ctx.destination);

  // 简单包络
  const t0 = 0;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.2, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + durMs / 1000);

  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.02);

  const rendered = await ctx.startRendering();
  const ch0 = rendered.getChannelData(0);
  // PCM16 + WAV 头
  function floatTo16BitPCM(float32: Float32Array) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  const pcm16 = floatTo16BitPCM(ch0);
  const blockAlign = 2; // mono 16-bit
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm16.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);
  // 写数据
  let offset = 44;
  for (let i = 0; i < pcm16.length; i++, offset += 2) {
    view.setInt16(offset, pcm16[i], true);
  }
  return new Blob([view], { type: "audio/wav" });
}
