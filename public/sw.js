/* EnlacePro service worker: caché de recursos estáticos para que la app instalada abra rápido. */
const CACHE = 'enlacepro-v1';
const STATIC = ['/styles.css', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Estáticos: cache-first. Páginas: red primero, con respaldo de caché.
  const isStatic = STATIC.some((p) => url.pathname === p);
  e.respondWith(
    isStatic
      ? caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        }))
      : fetch(e.request).catch(() => caches.match(e.request))
  );
});
