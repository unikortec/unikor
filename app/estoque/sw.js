// Service Worker — UNIKOR ESTOQUE
const APP_VERSION  = '3.2.0-unikor';
const CACHE_TAG    = 'unikor-estoque';
const STATIC_CACHE = `${CACHE_TAG}-static-${APP_VERSION}`;
const DYN_CACHE    = `${CACHE_TAG}-dyn-${APP_VERSION}`;
const OFFLINE_URL  = './index.html';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/main.js',
  './js/constants.js',
  './js/store.js',
  './js/catalog.js',
  './js/prices.js',
  './js/pdf.js',
  './js/firebase.js',
  './js/ui.js',

  // Ícones
  './favicon.svg',
  './favicon.ico',
  './favicon-96x96.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

async function putInCache(cacheName, req, res){ try{ const c=await caches.open(cacheName); await c.put(req,res);}catch(_){} }
async function limitCache(cacheName, max=180){
  try{ const c=await caches.open(cacheName); const keys=await c.keys(); while(keys.length>max){ await c.delete(keys.shift()); } }catch(_){}
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
      try { await self.registration.navigationPreload.enable(); } catch (_e) {}
    }
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(`${CACHE_TAG}-`) && ![STATIC_CACHE, DYN_CACHE].includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try{
        const preload = 'preloadResponse' in event ? await event.preloadResponse : null;
        if (preload) { putInCache(STATIC_CACHE, './', preload.clone()); return preload; }
        const net = await fetch(request);
        putInCache(STATIC_CACHE, './', net.clone());
        return net;
      }catch(_){
        return (await caches.match('./')) || (await caches.match(OFFLINE_URL));
      }
    })());
    return;
  }

  if (sameOrigin) {
    const isPrecached = ASSETS.some(p => url.pathname.endsWith(p.replace('./','/')));
    if (isPrecached) {
      event.respondWith((async ()=>{
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
    event.respondWith((async ()=>{
      const cached = await caches.match(request);
      const fetchPromise = fetch(request).then(res=>{ putInCache(DYN_CACHE, request, res.clone()); limitCache(DYN_CACHE); return res; }).catch(()=>null);
      return cached || (await fetchPromise) || new Response('', { status: 504, statusText: 'Gateway Timeout' });
    })());
    return;
  }

  event.respondWith((async ()=>{
    try{
      const net = await fetch(request);
      putInCache(DYN_CACHE, request, net.clone());
      limitCache(DYN_CACHE);
      return net;
    }catch(_){
      const cached = await caches.match(request, { ignoreSearch: true });
      return cached || new Response('', { status: 504, statusText: 'Gateway Timeout' });
    }
  })());
});
