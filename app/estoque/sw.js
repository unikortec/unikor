// Service Worker — UNIKOR Estoque V1.0.4
const APP_VERSION  = '1.0.4';
const CACHE_TAG    = 'estoque';
const STATIC_CACHE = `${CACHE_TAG}-static-${APP_VERSION}`;
const DYN_CACHE    = `${CACHE_TAG}-dyn-${APP_VERSION}`;
const BASE         = '/app/estoque/';
const OFFLINE_URL  = BASE + 'index.html';

const ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'css/style.css',
  BASE + 'js/app.js',
  BASE + 'js/constants.js',
  BASE + 'js/ui.js',
  BASE + 'js/catalog.js',
  BASE + 'js/store.js',
  BASE + 'js/prices.js',
  BASE + 'js/pdf.js',
  BASE + 'js/firebase.js',
  '/assets/logo/android-chrome-192x192.png',
  '/assets/logo/android-chrome-512x512.png',
  '/assets/logo/apple-touch-icon.png',
  '/assets/logo/favicon.ico'
];

async function putInCache(cacheName, req, res) {
  try {
    const u = new URL(req.url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
    const c = await caches.open(cacheName);
    await c.put(req, res);
  } catch {}
}
async function limitCache(cacheName, max = 180) {
  try {
    const c = await caches.open(cacheName);
    const keys = await c.keys();
    while (keys.length > max) await c.delete(keys.shift());
  } catch {}
}

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
    await Promise.all(keys
      .filter(k => k.startsWith(`${CACHE_TAG}-`) && ![STATIC_CACHE, DYN_CACHE].includes(k))
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  try {
    const u = new URL(request.url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
  } catch { return; }

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = 'preloadResponse' in event ? await event.preloadResponse : null;
        if (preload) {
          putInCache(STATIC_CACHE, new Request(OFFLINE_URL), preload.clone());
          return preload;
        }
        const net = await fetch(request);
        putInCache(STATIC_CACHE, new Request(OFFLINE_URL), net.clone());
        return net;
      } catch {
        return (await caches.match(OFFLINE_URL)) || Response.error();
      }
    })());
    return;
  }

  if (sameOrigin) {
    const isPrecached = ASSETS.some(p => url.pathname === p || (p.endsWith('index.html') && url.pathname === BASE));
    if (isPrecached) {
      event.respondWith((async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        const net = await fetch(request);
        putInCache(STATIC_CACHE, request, net.clone());
        return net;
      })());
      return;
    }
  }

  const isCDN = /(^|\.)(?:gstatic|googleapis|jsdelivr|unpkg|cloudflare|cdnjs)\.com$/i.test(url.hostname);
  if (!sameOrigin || isCDN) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const fetchPromise = fetch(request)
        .then(res => { putInCache(DYN_CACHE, request, res.clone()); limitCache(DYN_CACHE); return res; })
        .catch(() => null);
      return cached || (await fetchPromise) || new Response('', { status: 504, statusText: 'Gateway Timeout' });
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const net = await fetch(request);
      putInCache(DYN_CACHE, request, net.clone());
      limitCache(DYN_CACHE);
      return net;
    } catch {
      const cached = await caches.match(request, { ignoreSearch: true });
      return cached || new Response('', { status: 504, statusText: 'Gateway Timeout' });
    }
  })());
});