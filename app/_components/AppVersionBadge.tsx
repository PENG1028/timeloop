"use client";
import React from "react";
import { APP_VERSION } from "../_generated/version";
import { useEffect } from "react";


export default function AppVersionBadge() {

    useEffect(() => {
  const k = "APP_VERSION";
  const old = localStorage.getItem(k);
  if (old && old !== APP_VERSION) {
    // 这里可以换成你的全局 toast
    if (confirm(`发现新版本：${APP_VERSION}，要刷新吗？`)) location.reload();
  }
  localStorage.setItem(k, APP_VERSION);
}, []);


  return (
    <span
      title={`Build ${APP_VERSION}`}
      className="ml-2 inline-flex items-center rounded-md border border-emerald-500/40 px-2 py-[2px] text-[11px] leading-none text-emerald-300/90 bg-emerald-500/10"
    >
      {APP_VERSION}
    </span>
  );
}

