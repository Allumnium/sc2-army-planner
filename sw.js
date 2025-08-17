// sw.js
const CACHE = 'sc2-planner-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './privacy.html,',
  './terms.html'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  e.respondWith(
    caches.match(request).then((cached) =>
      cached || fetch(request).then((resp) => {
        // Cache same-origin GETs
        const copy = resp.clone();
        if (request.url.startsWith(self.location.origin)) {
          caches.open(CACHE).then(c => c.put(request, copy)).catch(()=>{});
        }
        return resp;
      }).catch(() => cached)
    )
  );
});
