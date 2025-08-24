"use client";
import { useEffect, useRef, useState } from "react";

export function useWakeLock() {
  const lockRef = useRef<any>(null);
  const [active, setActive] = useState(false);

  async function acquire() {
    try {
      // @ts-ignore
      const wl = await navigator.wakeLock?.request?.("screen");
      if (!wl) return false;
      lockRef.current = wl;
      setActive(true);
      wl.addEventListener?.("release", () => setActive(false));
      return true;
    } catch { return false; }
  }
  function release() {
    try { lockRef.current?.release?.(); } catch {}
    lockRef.current = null;
    setActive(false);
  }

  // 页面隐藏后，唤醒时自动再请求一次
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible" && active && !lockRef.current) acquire(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [active]);

  return { active, acquire, release };
}
