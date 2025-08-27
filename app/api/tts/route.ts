// app/api/tts/route.ts
// 开发用 Mock：把 text 映射成一个频率与时长，返回简短 WAV（便于联调本地缓存与播放）
export const runtime = "nodejs"; // 使用 Node.js 运行时以便 Buffer 等 API

function wavFromSine({ freq, durMs, sampleRate = 24000 }: { freq: number; durMs: number; sampleRate?: number }) {
    const length = Math.max(1, Math.floor(sampleRate * (durMs / 1000)));
    const pcm16 = new Int16Array(length);
    const amp = 0.2 * 0x7fff;

    for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const s = Math.sin(2 * Math.PI * freq * t);
        pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(amp * s)));
    }

    const bytesPerSample = 2;
    const blockAlign = bytesPerSample * 1; // mono
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcm16.length * bytesPerSample;
    const totalSize = 44 + dataSize;

    const buf = Buffer.alloc(totalSize);
    let o = 0;
    buf.write("RIFF", o); o += 4;
    buf.writeUInt32LE(36 + dataSize, o); o += 4;
    buf.write("WAVE", o); o += 4;
    buf.write("fmt ", o); o += 4;
    buf.writeUInt32LE(16, o); o += 4;          // fmt chunk size
    buf.writeUInt16LE(1, o); o += 2;           // PCM
    buf.writeUInt16LE(1, o); o += 2;           // mono
    buf.writeUInt32LE(sampleRate, o); o += 4;
    buf.writeUInt32LE(byteRate, o); o += 4;
    buf.writeUInt16LE(blockAlign, o); o += 2;
    buf.writeUInt16LE(16, o); o += 2;          // bits
    buf.write("data", o); o += 4;
    buf.writeUInt32LE(dataSize, o); o += 4;

    // PCM data
    for (let i = 0; i < pcm16.length; i++) {
        buf.writeInt16LE(pcm16[i], o); o += 2;
    }
    return buf;
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const text = url.searchParams.get("text") ?? "";
    const sr = Number(url.searchParams.get("sr") ?? "24000");
    const rate = Number(url.searchParams.get("rate") ?? "1.0");
    const pitch = Number(url.searchParams.get("pitch") ?? "0");

    // 把文本映射到“可听差异”的频率和时长（仅为开发联调）
    const sum = [...text].reduce((s, ch) => s + ch.charCodeAt(0), 0);
    const baseFreq = 440 + (sum % 300) + pitch * 20;
    const durMs = Math.min(2000, Math.max(250, Math.round(text.length * 60 / Math.max(0.5, rate)))); // 约 60ms/字

    const wav = wavFromSine({ freq: baseFreq, durMs, sampleRate: sr || 24000 }); // Buffer

    // a) 直接用 Uint8Array（最简单）
    return new Response(new Uint8Array(wav), {
        status: 200,
        headers: {
            "Content-Type": "audio/wav",
            "Cache-Control": "no-store",
            "x-mock": "true",
        },
    });
}
