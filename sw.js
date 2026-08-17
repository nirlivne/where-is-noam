// Service worker: makes the app installable and playable offline once it has
// loaded once. Hand-rolled, no Workbox — matches the project's existing
// zero-dependency tooling (see tools/serve.js, tools/publish.js).
//
// CACHE_VERSION is substituted for a content hash of the bundled HTML by
// tools/publish.js on every publish, so a new deploy always gets a fresh
// cache with no manual version bump. In dev (served unbundled via
// tools/serve.js) it stays the literal placeholder below, which is fine —
// it only needs to change, not mean anything.
const CACHE_VERSION = 'b5b1e08058';
const CACHE_NAME = `cats-${CACHE_VERSION}`;
// three.js (confetti, loaded lazily from the jsdelivr CDN) lives in its own
// cache so it survives app-shell cache rotations instead of being evicted
// on every publish.
const CDN_CACHE = 'cats-cdn';

const PRECACHE = ['./index.html', './manifest.json', './assets/noam-192.png', './assets/noam-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
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
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, res.clone()));
        return res;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match('./index.html')))
  );
});
