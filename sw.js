// Service Worker：缓存应用壳，支持离线访问与可安装。
const CACHE = "scan-order-v2";
const ASSETS = [
  "./",
  "index.html",
  "kitchen.html",
  "admin.html",
  "manifest.json",
  "css/style.css",
  "js/menu.js",
  "js/config.js",
  "js/api.js",
  "js/db.js",
  "js/app.js",
  "js/kitchen.js",
  "js/admin.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png"
];
// Supabase JS（来自 CDN，首次加载后缓存，便于离线启动 SDK；实际数据库读写仍需联网）
const CDN = ["https://esm.sh/@supabase/supabase-js@2"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(ASSETS).then(() => {
        // CDN 失败不应阻断安装
        return c.addAll(CDN).catch(() => {});
      })
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 缓存优先，回退网络（网络成功则写入缓存）
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok && (resp.type === "basic" || resp.type === "cors")) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => cached);
    })
  );
});
