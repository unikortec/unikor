// Service Worker — DESPESAS v1.1
const APP_VERSION  = '1.1.0';
const CACHE_TAG    = 'despesas';
const STATIC_CACHE = `${CACHE_TAG}-static-${APP_VERSION}`;
const DYN_CACHE    = `${CACHE_TAG}-dyn-${APP_VERSION}`;
const OFFLINE_URL  = './index.html';

// Precaching (somente arquivos estáticos existentes)
const ASSETS = [
  './',
  './index.html',
  './manifest.json',

  // JS
  './js/app.js',
  './js/firebase.js',
  './js/drive.js',
  './js/nfce.js',
  './js/nfe.js',
  './js/scanner.js',
  './js/store.js',

  // CSS
  './css/style.css'
];

async function putInCache(cacheName, req, res) {
  try {
    const c = await caches.open(cacheName);
    await c.put(req, res);
  } catch {}
}
async function limitCache(cacheName, max = 150) {
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
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith(`${CACHE_TAG}-`) && ![STATIC_CACHE, DYN_CACHE].includes(k))
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const path = url.pathname.replace(/\/+/g,'/');

  // Navegação
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = 'preloadResponse' in event ? await event.preloadResponse : null;
        if (preload) {
          putInCache(STATIC_CACHE, './', preload.clone());
          return preload;
        }
        const net = await fetch(request);
        putInCache(STATIC_CACHE, './', net.clone());
        return net;
      } catch {
        return (await caches.match('./')) || (await caches.match(OFFLINE_URL));
      }
    })());
    return;
  }

  // Estáticos precacheados
  if (sameOrigin) {
    const isPrecached = ASSETS.some(p => url.pathname.endsWith(p.replace('./', '/')));
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

  // CDNs / terceiros: Stale-While-Revalidate
  const isCDN = /(^|\.)(?:gstatic|googleapis|jsdelivr|unpkg|cloudflare|cdnjs)\.com$/i.test(url.hostname);
  if (!sameOrigin || isCDN) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const fetchPromise = fetch(request)
        .then(res => { putInCache(DYN_CACHE, request, res.clone()); limitCache(DYN_CACHE); return res; })
        .catch(() => null);
      return cached || (await fetchPromise) || new Response('', { status: 504, statusText: 'Offline' });
    })());
    return;
  }

  // Demais same-origin
  event.respondWith((async () => {
    try {
      const net = await fetch(request);
      putInCache(DYN_CACHE, request, net.clone());
      limitCache(DYN_CACHE);
      return net;
    } catch {
      const cached = await caches.match(request, { ignoreSearch: true });
      return cached || new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});