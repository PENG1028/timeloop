"use client";

// app/_lib/cache.ts
// 本地音频缓存骨架：IndexedDB(元数据) + Cache Storage(音频)
// 设计：
//  - meta 存在 IDB 'entries' 表，key: hash
//  - 音频 Blob 存在 CacheStorage 'tl-audio'，key: /__tts-cache__/{hash}
//  - 只要 hash 一致即可跨刷新持久化

export type EntryMeta = {
  hash: string;
  size: number;           // 字节数（来自 Blob.size）
  createdAt: number;      // 毫秒时间戳
  lastAccessAt: number;   // 毫秒时间戳
  hits: number;           // 命中次数
  contentType: string;    // 'audio/wav' | 'audio/ogg' | ...
  // 下面这些是可选字段（方便以后做统计/调试）
  text?: string;
  voiceId?: string;
  rate?: number;
  pitch?: number;
  sr?: number;
  lang?: string;
};

const DB_NAME = "tl-cache-v1";
const STORE = "entries";
const DB_VERSION = 1;
const CACHE_NAME = "tl-audio";

function cacheKey(hash: string) {
  return new Request(`/__tts-cache__/${hash}`);
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "hash" });
        os.createIndex("lastAccessAt", "lastAccessAt");
        os.createIndex("hits", "hits");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let p: Promise<T>;
    try {
      p = Promise.resolve(fn(store));
    } catch (e) {
      reject(e);
      db.close();
      return;
    }
    p.then((val) => {
      tx.oncomplete = () => {
        db.close();
        resolve(val);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    }, (err) => {
      db.close();
      reject(err);
    });
  });
}

export async function initCache() {
  await openDB().then(db => db.close());
  await caches.open(CACHE_NAME);
}

export async function putAudio(hash: string, blob: Blob, meta: Partial<EntryMeta> = {}) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(cacheKey(hash), new Response(blob, { headers: { "Content-Type": meta.contentType || blob.type || "application/octet-stream" } }));

  const entry: EntryMeta = {
    hash,
    size: blob.size,
    createdAt: Date.now(),
    lastAccessAt: Date.now(),
    hits: 1,
    contentType: meta.contentType || blob.type || "application/octet-stream",
    text: meta.text,
    voiceId: meta.voiceId,
    rate: meta.rate,
    pitch: meta.pitch,
    sr: meta.sr,
    lang: meta.lang,
  };

  await withStore("readwrite", (store) => {
    store.put(entry);
    return Promise.resolve();
  });
  return entry;
}

export async function getAudio(hash: string): Promise<Blob | null> {
  const cache = await caches.open(CACHE_NAME);
  const res = await cache.match(cacheKey(hash));
  if (!res) return null;
  // 更新 meta 的 lastAccessAt / hits
  await withStore("readwrite", async (store) => {
    const getReq = store.get(hash);
    await new Promise<void>((res, rej) => {
      getReq.onsuccess = () => {
        const ent = getReq.result as EntryMeta | undefined;
        if (ent) {
          ent.lastAccessAt = Date.now();
          ent.hits = (ent.hits || 0) + 1;
          store.put(ent);
        }
        res();
      };
      getReq.onerror = () => rej(getReq.error);
    });
    return;
  });
  return await res.blob();
}

export async function removeAudio(hash: string) {
  const cache = await caches.open(CACHE_NAME);
  await cache.delete(cacheKey(hash));
  await withStore("readwrite", (store) => {
    store.delete(hash);
    return Promise.resolve();
  });
}

export async function usage(): Promise<{ totalBytes: number; count: number; entries: EntryMeta[] }> {
  return withStore("readonly", (store) => {
    const req = store.getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const list = (req.result as EntryMeta[]) || [];
        const total = list.reduce((s, e) => s + (e.size || 0), 0);
        resolve({ totalBytes: total, count: list.length, entries: list });
      };
      req.onerror = () => reject(req.error);
    });
  });
}

export async function evictIfNeeded(maxBytes: number) {
  const u = await usage();
  if (u.totalBytes <= maxBytes) return { removed: 0, afterBytes: u.totalBytes };
  // 简单 LRU（按 lastAccessAt 升序），命中次数作轻权重
  const sorted = [...u.entries].sort((a, b) => {
    if (a.lastAccessAt !== b.lastAccessAt) return a.lastAccessAt - b.lastAccessAt;
    return (a.hits || 0) - (b.hits || 0);
  });

  let bytes = u.totalBytes;
  let removed = 0;
  for (const ent of sorted) {
    if (bytes <= maxBytes) break;
    await removeAudio(ent.hash);
    bytes -= ent.size || 0;
    removed++;
  }
  return { removed, afterBytes: bytes };
}
