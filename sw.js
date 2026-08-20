/**
 * Service Worker — ChatWithIt
 * Caches app shell for offline use. Never caches API calls to providers.
 *
 * CACHE_NAME bump strategy: increment the version suffix (v2, v3, …) whenever
 * JS or CSS files change. The activate handler deletes all previous caches so
 * returning users always get fresh code once the new SW takes control.
 */

const CACHE_NAME = 'chatwithit-v18';

const PRECACHE_URLS = [
  './',
  './index.html',
  './dist/app.js',
  './css/app.css',
  './css/profiles.css',
  './css/pwa-safe-area.css',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(
        PRECACHE_URLS.map(url => cache.add(url))
      );
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.warn(`[SW] Failed to precache ${PRECACHE_URLS[i]}:`, r.reason);
        }
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (
    url.hostname.includes('openrouter.ai') ||
    url.hostname.includes('huggingface.co') ||
    url.hostname.includes('cdn.jsdelivr.net')
  ) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => cached || new Response('Offline', { status: 503 }));
    })
  );
});
