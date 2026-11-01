/* Linn Game Store - PWA service worker (v2)
 * - Pages: always network. If the network fails, show the branded /offline.html
 * - Icons / offline page: pre-cached, served instantly (refreshed in the background)
 * - Everything else (Firebase, APIs, other origins): untouched
 */
const VERSION = 'v2';
const CACHE = 'linn-static-' + VERSION;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/favicon-192.png?v=4', '/favicon-48.png?v=4'];
const ICON_RE = /^\/(favicon[^/]*|apple-touch-icon|maskable-512)\.(png|ico)$/;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(PRECACHE.map(u => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('linn-') && k !== CACHE).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (e) {} }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Page loads: network first, branded offline page only when the network is really down
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const pre = await event.preloadResponse;
        if (pre) return pre;
        return await fetch(req);
      } catch (e) {
        const cached = await caches.match(OFFLINE_URL);
        return cached || new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // Icons + offline page: cache first, refresh in the background
  if (url.pathname === OFFLINE_URL || ICON_RE.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      const refresh = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      if (hit) { event.waitUntil(refresh); return hit; }
      return (await refresh) || new Response('', { status: 504 });
    })());
  }
});
