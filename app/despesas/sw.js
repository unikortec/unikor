// Service Worker — DESPESAS (Auto-Refresh)
const APP_VERSION  = '1.1.1'; // ↑↑ sempre incremente quando publicar
const CACHE_TAG    = 'despesas';
const STATIC_CACHE = `${CACHE_TAG}-static-${APP_VERSION}`;
const DYN_CACHE    = `${CACHE_TAG}-dyn-${APP_VERSION}`;
const OFFLINE_URL  = './index.html';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/firebase.js',
  './js/drive.js',
  './js/nfce.js',
  './js/nfe.js',
  './js/scanner.js',
  './js/store.js',
];

// Cache helpers
async function putInCache(cacheName, req, res){ try{ const c=await caches.open(cacheName); await c.put(req, res);}catch{} }
async function limitCache(cacheName, max=150){ try{ const c=await caches.open(cacheName); const keys=await c.keys(); while(keys.length>max) await c.delete(keys.shift()); }catch{} }

// 🔄 Notifica todos os clientes para recarregar
async function broadcastReload(){
  const clientsList = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
  clientsList.forEach(client => client.postMessage({ type:'SW_UPDATED' }));
}

// INSTALL: pré-cache e ativa imediatamente
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })));
    self.skipWaiting(); // ⚡ ativa a nova versão assim que possível
  })());
});

// Mensagens da página
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ACTIVATE: limpa versões antigas e já controla clientes
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // ativa navegação preload (não quebra se falhar)
    if ('navigationPreload' in self.registration) { try{ await self.registration.navigationPreload.enable(); }catch{} }

    // remove caches antigos
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith(`${CACHE_TAG}-`) && ![STATIC_CACHE, DYN_CACHE].includes(k))
      .map(k => caches.delete(k)));

    await self.clients.claim(); // começa a controlar abas abertas
    await broadcastReload();    // 🔔 manda recarregar imediatamente
  })());
});

// FETCH
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const path = url.pathname.replace(/\/+/g,'/');

  // Navegação → network first, fallback cache/offline
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = 'preloadResponse' in event ? await event.preloadResponse : null;
        if (preload) { putInCache(STATIC_CACHE, './', preload.clone()); return preload; }
        const net = await fetch(request, { cache:'no-store' });
        putInCache(STATIC_CACHE, './', net.clone());
        return net;
      } catch {
        return (await caches.match('./')) || (await caches.match(OFFLINE_URL));
      }
    })());
    return;
  }

  // Estático precacheado → cache first + revalidação
  if (sameOrigin) {
    const isPrecached = ASSETS.some(p => url.pathname.endsWith(p.replace('./','/')));
    if (isPrecached) {
      event.respondWith((async () => {
        const cached = await caches.match(request, { ignoreSearch:true });
        const fetchPromise = fetch(request, { cache:'no-store' })
          .then(res => { putInCache(STATIC_CACHE, request, res.clone()); return res; })
          .catch(()=>null);
        return cached || (await fetchPromise);
      })());
      return;
    }
  }

  // Terceiros/CDNs → stale-while-revalidate
  const isCDN = /(^|\.)(?:gstatic|googleapis|jsdelivr|unpkg|cloudflare|cdnjs)\.com$/i.test(url.hostname);
  if (!sameOrigin || isCDN) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const fetchPromise = fetch(request, { cache:'no-store' })
        .then(res => { putInCache(DYN_CACHE, request, res.clone()); limitCache(DYN_CACHE); return res; })
        .catch(()=>null);
      return cached || (await fetchPromise) || new Response('', { status: 504, statusText: 'Offline' });
    })());
    return;
  }

  // Outros same-origin → network first, fallback cache
  event.respondWith((async () => {
    try {
      const net = await fetch(request, { cache:'no-store' });
      putInCache(DYN_CACHE, request, net.clone());
      limitCache(DYN_CACHE);
      return net;
    } catch {
      const cached = await caches.match(request, { ignoreSearch:true });
      return cached || new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});