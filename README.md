# TimeLoop — Web + Android Starter (No Default Phrases)

> 最小可运行脚手架：Next.js (App Router) + Tailwind。未包含任何业务逻辑与默认音频短语。

## 快速开始
```bash
pnpm i   # 或 npm i / yarn
pnpm dev
```

## 结构
- `app/` — App Router 页面
- `public/manifest.webmanifest` — PWA 清单
- `public/sw.js` — Service Worker 占位（无预缓存）
- `styles/` — Tailwind 样式

## 下一步（按里程碑实施）
1. **M1 — 引擎协议与 Worker 通道**
   - 事件/指令协议（Start/Pause/Adjust...）
   - Web Worker：50–100ms tick，目标绝对时刻
2. **M2 — 本地缓存与离线**
   - IndexedDB + Cache Storage（仅结构与元数据，未含默认短语）
   - Service Worker 缓存策略
3. **M3 — CPU 轻量 TTS 接入**
   - HTTP `GET /tts?...`（缓存命中/未命中流式）
   - 预取窗口 100–200ms 校验命中
4. **M4 — Android**
   - PWA 直接安装，或外壳（WebView/TWA）包装
   - 蓝牙音频延迟校准流程

## 下一步要做
1. 函数式播报
2. 增加多种播报模式，防止声音被挤掉 