/**
 * Service Worker — ChatWithIt
 * Caches app shell for offline use. Never caches API calls to providers.
 */

const CACHE_NAME = 'chatwithit-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './js/utils.js',
  './js/state.js',
  './js/api.js',
  './js/ui.js',
  './js/app.js',
  './js/profiles.js',
  './css/profiles.css',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
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

  // Never intercept provider API calls — always go straight to network
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
