/* Linn Game Store - PWA service worker (v5)
 * - Pages: always network. If the network fails, show the branded /offline.html
 * - Icons / offline page: pre-cached, served instantly (refreshed in the background)
 * - Everything else (Firebase, APIs, other origins): untouched
 */
const VERSION = 'v5';
const CACHE = 'linn-static-' + VERSION;
const OFFLINE_URL = '/offline.html';
const SHELL_KEY = '/__shell';
const SIG_KEY = '/__shell-sig';
const PRECACHE = [OFFLINE_URL, '/favicon-192.png?v=4', '/favicon-48.png?v=4', '/fz-scenes.js?v=1'];
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

// Update banner: page asks the waiting worker to take over
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Home page: show the saved copy instantly, refresh it in the background.
  // When the fresh copy differs, the page is told (SHELL_UPDATED) and shows the update banner.
  if (req.mode === 'navigate' && url.pathname === '/') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(SHELL_KEY);
      const refresh = (async () => {
        const res = (await event.preloadResponse) || await fetch('/', { cache: 'no-store' });
        if (!res || !res.ok) return null;
        const len = (await res.clone().arrayBuffer()).byteLength;
        const sig = (res.headers.get('etag') || '') + '|' + (res.headers.get('last-modified') || '') + '|' + len;
        const oldSigRes = await cache.match(SIG_KEY);
        const oldSig = oldSigRes ? await oldSigRes.text() : '';
        await cache.put(SHELL_KEY, res.clone());
        await cache.put(SIG_KEY, new Response(sig));
        if (cached && oldSig && oldSig !== sig) {
          const wins = await self.clients.matchAll({ type: 'window' });
          wins.forEach(c => { try { c.postMessage({ type: 'SHELL_UPDATED' }); } catch (e) {} });
        }
        return res;
      })().catch(() => null);
      if (cached) { event.waitUntil(refresh); return cached; }
      const fresh = await refresh;
      if (fresh) return fresh;
      const off = await caches.match(OFFLINE_URL);
      return off || new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    })());
    return;
  }

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
