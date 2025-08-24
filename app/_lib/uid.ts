// app/_lib/uid.ts
export function uid(len = 8): string {
  try {
    // 浏览器/Node 18+ 都支持
    return crypto.randomUUID().replace(/-/g, "").slice(0, len);
  } catch {
    // 兜底（老环境）
    return Math.random().toString(36).slice(2, 2 + len);
  }
}