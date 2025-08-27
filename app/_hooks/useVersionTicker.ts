// app/_hooks/useVersionTicker.ts
"use client";
import { useEffect } from "react";
export function useVersionTicker(onNew: (info:{version:string, commit:string})=>void) {
  useEffect(() => {
    let t: any = null;
    const tick = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const j = await res.json();
        const prev = localStorage.getItem("APP_VERSION");
        const cur = `${j.version}@${j.commit}`;
        if (prev && prev !== cur) onNew({ version: j.version, commit: j.commit });
        localStorage.setItem("APP_VERSION", cur);
      } finally {
        t = setTimeout(tick, 5 * 60 * 1000);
      }
    };
    tick();
    return () => clearTimeout(t);
  }, [onNew]);
}
