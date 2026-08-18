// Service worker: makes the app installable and playable offline once it has
// loaded once. Hand-rolled, no Workbox — matches the project's existing
// zero-dependency tooling (see tools/serve.js, tools/publish.js).
//
// CACHE_VERSION is substituted for a content hash of the bundled HTML by
// tools/publish.js on every publish, so a new deploy always gets a fresh
// cache with no manual version bump. In dev (served unbundled via
// tools/serve.js) it stays the literal placeholder below, which is fine —
// it only needs to change, not mean anything.
const CACHE_VERSION = '1a45e829c8';
const CACHE_NAME = `cats-${CACHE_VERSION}`;
// three.js (confetti, loaded lazily from the jsdelivr CDN) lives in its own
// cache so it survives app-shell cache rotations instead of being evicted
// on every publish.
const CDN_CACHE = 'cats-cdn';

const PRECACHE = ['./index.html', './manifest.json', './assets/noam-192.png', './assets/noam-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // 'reload' bypasses the browser's own HTTP cache — GitHub Pages sends
      // Cache-Control: max-age=600, so without this a fresh install could
      // silently precache a response the browser already had lying around
      // from before this publish, instead of what actually just shipped.
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== CDN_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.hostname === 'cdn.jsdelivr.net') {
    // Cache-first, filled in opportunistically: confetti keeps working
    // offline once three.js has loaded successfully at least once.
    event.respondWith(
      caches.open(CDN_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // App shell: network-first so any normal online visit picks up the latest
  // publish (there is no other cache-busting scheme), falling back to the
  // cache when offline. Covers both the bundled single-file production
  // build and the unbundled multi-file dev server.
  //
  // cache: 'no-store' bypasses the browser's own HTTP cache layer — GitHub
  // Pages sends Cache-Control: max-age=600, and a plain fetch() here would
  // silently honour that and hand back a stale response for up to 10
  // minutes, "network-first" in name only. We keep our own versioned
  // CACHE_NAME as the real freshness/offline mechanism instead.
  event.respondWith(
    fetch(request, { cache: 'no-store' })
      .then((res) => {
        if (res.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, res.clone()));
        return res;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match('./index.html')))
  );
});
