/**
 * Service Worker — ChatWithIt
 * Caches app shell for offline use. Never caches API calls to providers.
 *
 * CACHE_NAME bump strategy: increment the version suffix (v2, v3, …) whenever
 * JS or CSS files change. The activate handler deletes all previous caches so
 * returning users always get fresh code once the new SW takes control.
 *
 * Fetch strategy: the HTML shell and the app bundle are network-first so users
 * get new code as soon as they are online; other same-origin assets are
 * cache-first. Offline, everything falls back to the cache.
 */

const CACHE_NAME = 'chatwithit-v26';

const PRECACHE_URLS = [
  './',
  './index.html',
  './dist/app.js',
  './css/variables.css',
  './css/themes.css',
  './css/layout.css',
  './css/components.css',
  './css/modals.css',
  './css/profiles.css',
  './css/pwa-safe-area.css',
  './css/app.css',
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

function isNetworkFirst(req, url) {
  if (url.origin !== self.location.origin) return false;
  if (req.mode === 'navigate') return true;
  return (
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/dist/app.js')
  );
}

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

  if (isNetworkFirst(req, url)) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() =>
        caches.match(req).then((cached) =>
          cached ||
          (req.mode === 'navigate' ? caches.match('./index.html') : null) ||
          new Response('Offline', { status: 503 })
        )
      )
    );
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
