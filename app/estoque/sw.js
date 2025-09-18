// SW Estoque — V1.0.1
const APP_VERSION  = '1.0.1';
const CACHE_TAG    = 'estoque';
const STATIC_CACHE = `${CACHE_TAG}-static-${APP_VERSION}`;
const DYN_CACHE    = `${CACHE_TAG}-dyn-${APP_VERSION}`;
const ROOT         = '/app/estoque/';
const OFFLINE_URL  = ROOT + 'index.html';

const ASSETS = [
  ROOT,
  ROOT + 'index.html',
  ROOT + 'manifest.json',
  ROOT + 'css/style.css',
  ROOT + 'js/main.js',
  ROOT + 'js/ui.js',
  ROOT + 'js/constants.js',
  ROOT + 'js/catalog.js',
  ROOT + 'js/pdf.js',
  ROOT + 'js/prices.js',
  ROOT + 'js/store.js',
  ROOT + 'js/firebase.js',
  '/assets/logo/unikor-logo.svg',
  '/assets/logo/unikor-logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })));
    self.skipWaiting();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith(`${CACHE_TAG}-`) && ![STATIC_CACHE, DYN_CACHE].includes(k)).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navegações do sub-app → network-first com fallback
  if (request.mode === 'navigate' && url.pathname.startsWith(ROOT)) {
    event.respondWith((async () => {
      try {
        const preload = 'preloadResponse' in event ? await event.preloadResponse : null;
        if (preload) return preload;
        const net = await fetch(request);
        const c = await caches.open(STATIC_CACHE); c.put(ROOT, net.clone());
        return net;
      } catch {
        return (await caches.match(ROOT)) || (await caches.match(OFFLINE_URL));
      }
    })());
    return;
  }

  // Estáticos precacheados do sub-app → cache-first
  if (sameOrigin && ASSETS.some(p => url.pathname === p)) {
    event.respondWith((async () => {
      const hit = await caches.match(request, { ignoreSearch: true });
      if (hit) return hit;
      const net = await fetch(request);
      const c = await caches.open(STATIC_CACHE); c.put(request, net.clone());
      return net;
    })());
    return;
  }

  // Demais → network, fallback cache
  event.respondWith((async () => {
    try {
      const net = await fetch(request);
      const c = await caches.open(DYN_CACHE); c.put(request, net.clone());
      return net;
    } catch {
      const cached = await caches.match(request, { ignoreSearch: true });
      return cached || new Response('', { status: 504, statusText: 'Gateway Timeout' });
    }
  })());
});
