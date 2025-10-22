// /app/pedidos/sw.js
const APP_VER   = '1.4.2';   // 🔺 bump para forçar atualização
const TAG       = 'pedidos';
const STATIC    = `${TAG}-static-${APP_VER}`;
const OFFLINE   = './index.html';

const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/firebase.js',
  './js/utils.js',
  './js/ui.js',
  './js/itens.js',
  './js/frete.js',
  './js/pdf.js'
];

async function put(cacheName, req, res) {
  try { const c = await caches.open(cacheName); await c.put(req, res); } catch {}
}

self.addEventListener('install', (evt) => {
  evt.waitUntil((async () => {
    const c = await caches.open(STATIC);
    await c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith(`${TAG}-static-`) && k !== STATIC)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (evt) => {
  if (evt.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (evt) => {
  const req = evt.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    evt.respondWith((async () => {
      try {
        const net = await fetch(req);
        put(STATIC, './index.html', net.clone());
        return net;
      } catch {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  const url = new URL(req.url);
  const same = url.origin === location.origin;
  if (same) {
    const hit = ASSETS.some(p => url.pathname.endsWith(p.replace('./','/')));
    if (hit) {
      evt.respondWith((async () => {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        const net = await fetch(req);
        put(STATIC, req, net.clone());
        return net;
      })());
    }
  }
});
