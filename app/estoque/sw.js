// Service Worker — UNIKOR Estoque V1.0.1
// Estratégias:
// - Precaching (estáticos do app e ícones globais PNG)
// - Navegação (HTML): network-first (+ navigation preload) com fallback offline
// - CDNs/terceiros: stale-while-revalidate em cache dinâmico
// - Demais same-origin: network, fallback cache
// - Força atualização via postMessage {type:'SKIP_WAITING'}

const APP_VERSION  = '1.0.2';
const CACHE_TAG    = 'estoque';
const STATIC_CACHE = `${CACHE_TAG}-static-${APP_VERSION}`;
const DYN_CACHE    = `${CACHE_TAG}-dyn-${APP_VERSION}`;
const BASE         = '/app/estoque/';        // escopo do app
const OFFLINE_URL  = BASE + 'index.html';

// Precaches (mantenha em sincronia com os arquivos do app)
const ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'css/style.css',
  BASE + 'js/main.js',
  BASE + 'js/constants.js',
  BASE + 'js/ui.js',
  BASE + 'js/catalog.js',
  BASE + 'js/store.js',
  BASE + 'js/prices.js',
  BASE + 'js/pdf.js',
  BASE + 'js/firebase.js',

  // Ícones globais (PNG) – reuso do portal
  '/assets/logo/android-chrome-192x192.png',
  '/assets/logo/android-chrome-512x512.png',
  '/assets/logo/apple-touch-icon.png',
  '/assets/logo/favicon.ico'
];

// ——— Helpers
async function putInCache(cacheName, req, res) {
  try {
    // Evita tentar cachear esquemas não-http(s) (ex.: chrome-extension://)
    const u = new URL(req.url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
    const c = await caches.open(cacheName);
    await c.put(req, res);
  } catch (_e) {}
}
async function limitCache(cacheName, max = 180) {
  try {
    const c = await caches.open(cacheName);
    const keys = await c.keys();
    while (keys.length > max) {
      await c.delete(keys.shift());
    }
  } catch (_e) {}
}

// ——— install
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })));
    self.skipWaiting();
  })());
});

// ——— mensagens (forçar atualização imediata)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ——— activate
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch (_e) {}
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

// ——— fetch strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Só GET
  if (request.method !== 'GET') return;

  // Evita trabalhar com chrome-extension://
  try {
    const u = new URL(request.url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
  } catch { return; }

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // 1) Navegações → network-first + preload + fallback offline
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

  // 2) Estáticos pré-cacheados → cache-first
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

  // 3) CDNs / terceiros → stale-while-revalidate
  const isCDN = /(^|\.)(?:gstatic|googleapis|jsdelivr|unpkg|cloudflare|cdnjs)\.com$/i.test(url.hostname);
  if (!sameOrigin || isCDN) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const fetchPromise = fetch(request)
        .then(res => {
          putInCache(DYN_CACHE, request, res.clone());
          limitCache(DYN_CACHE);
          return res;
        })
        .catch(() => null);
      return cached || (await fetchPromise) || new Response('', { status: 504, statusText: 'Gateway Timeout' });
    })());
    return;
  }

  // 4) Demais same-origin (APIs etc.) → network, fallback cache
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
