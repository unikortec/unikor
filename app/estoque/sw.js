// Service Worker — UNIKOR • ESTOQUE v1.0.1
// Estratégias:
// - Precaching (estáticos locais essenciais + ícones globais)
// - Navegação (HTML): network-first (+ navigation preload) com fallback offline
// - CDNs/terceiros: stale-while-revalidate em cache dinâmico
// - Demais requisições same-origin: network, fallback cache
// - Força atualização via postMessage {type:'SKIP_WAITING'}

const APP_VERSION  = '1.0.1';
const CACHE_TAG    = 'estoque';
const STATIC_CACHE = `${CACHE_TAG}-static-${APP_VERSION}`;
const DYN_CACHE    = `${CACHE_TAG}-dyn-${APP_VERSION}`;
const OFFLINE_URL  = './index.html';

// ⚠ Pré-cache minimalista + ícones globais (mesmo domínio, outro path)
const ASSETS = [
  './',
  './index.html',
  './manifest.json',

  // Ícones globais do portal (não falha se não existir em dev)
  '/assets/logo/android-chrome-192x192.png',
  '/assets/logo/android-chrome-512x512.png',
  '/assets/logo/apple-touch-icon.png'
];

// ——— Helpers
async function putInCache(cacheName, req, res) {
  try {
    const c = await caches.open(cacheName);
    await c.put(req, res);
  } catch { /* noop */ }
}
async function limitCache(cacheName, max = 180) {
  try {
    const c = await caches.open(cacheName);
    const keys = await c.keys();
    while (keys.length > max) await c.delete(keys.shift());
  } catch { /* noop */ }
}

// ——— install
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    // Adiciona um a um, ignorando falhas (arquivos opcionais)
    await Promise.all(ASSETS.map(async u=>{
      try{ await cache.add(new Request(u, { cache: 'reload' })); }catch{}
    }));
    self.skipWaiting(); // pronto para ativar
  })());
});

// ——— mensagens (forçar atualização imediata)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ——— activate
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Habilita Navigation Preload
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    // Limpa caches antigos desta app
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

  // só tratamos GET
  if (request.method !== 'GET') return;

  // 🚫 ignora esquemas fora http/https (ex.: chrome-extension://)
  const url = new URL(request.url);
  if (!/^https?:$/.test(url.protocol)) return;

  const sameOrigin = url.origin === self.location.origin;

  // 1) Navegações (HTML) → network-first + preload + fallback offline
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
        // fallback para shell em cache
        return (await caches.match('./')) || (await caches.match(OFFLINE_URL));
      }
    })());
    return;
  }

  // 2) Estáticos locais pré-cacheados → cache-first (ignoreSearch p/ bust simples)
  if (sameOrigin) {
    const isPrecached = ASSETS.some(p => url.pathname.endsWith(p.replace('./', '/')) || url.pathname === p);
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

  // 3) CDNs / terceiros → stale-while-revalidate em cache dinâmico
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

  // 4) Demais same-origin (APIs, etc.) → network, fallback cache
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
