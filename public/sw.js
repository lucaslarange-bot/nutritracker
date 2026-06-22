/* NutriTracker — Service Worker (prudent) */
const CACHE = "nutritracker-app-v1";
const STATIC = [
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-180.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // On ne touche qu'aux GET de notre propre origine.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Jamais de cache pour l'API, la config et le service worker lui-même.
  if (url.pathname.startsWith("/api/") || url.pathname.endsWith("/config.js") || url.pathname.endsWith("/sw.js")) {
    return; // laisse passer vers le réseau
  }

  // Navigation : réseau d'abord, repli sur l'index en cache si hors-ligne.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("./index.html")));
    return;
  }

  // Assets statiques : cache d'abord, puis réseau (et on met en cache au passage).
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});
