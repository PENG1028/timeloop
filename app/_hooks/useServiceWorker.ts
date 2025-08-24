"use client";

import { useEffect, useState } from "react";

export function useServiceWorker() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const url = "/sw.js";
    navigator.serviceWorker.register(url).then(() => setReady(true)).catch(() => {});
  }, []);
  return ready;
}
