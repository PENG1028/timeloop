/* public/sw.js */
const SHELL_CACHE = "tl-shell-v1";
const RUNTIME_CACHE = "tl-runtime-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(["/", OFFLINE_URL]); // 预缓存外壳和离线页
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![SHELL_CACHE, RUNTIME_CACHE].includes(k)).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // 导航请求：网络优先，失败回退缓存/离线页
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(req, { signal: ctrl.signal });
        clearTimeout(t);
        const cache = await caches.open(SHELL_CACHE);
        cache.put(req, res.clone()).catch(()=>{});
        return res;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match(req);
        return cached || cache.match(OFFLINE_URL);
      }
    })());
    return;
  }

  // 静态资源：stale-while-revalidate
  const dest = req.destination;
  if (["style","script","image","font"].includes(dest)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const hit = await cache.match(req);
      const fetchPromise = fetch(req).then(res => {
        cache.put(req, res.clone()).catch(()=>{});
        return res;
      }).catch(()=>null);
      return hit || fetchPromise || fetch(req);
    })());
    return;
  }

  // 其他请求（含 /api/tts）：默认直连网络（避免误缓存 mock 或你的实时 TTS）
  return;
});
