// /app/pedidos/sw.js
const APP_VER   = '1.1.3';
const TAG       = 'pedidos';
const STATIC    = `${TAG}-static-${APP_VER}`;
const OFFLINE   = './index.html';

// Shell mínimo para não quebrar APIs do Firebase/Google
const ASSETS = [
  './',
  './index.html',
  './css/style.css',

  // JS essenciais do app (adicione/retire se necessário)
  './js/app.js',
  './js/firebase.js',
  './js/utils.js',
  './js/ui.js',
  './js/itens.js',
  './js/clientes.js',
  './js/frete.js',
  './js/pdf.js',
  './js/modal-cliente.js',
];

// utilidades
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
    // limpa versões antigas
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith(`${TAG}-static-`) && k !== STATIC)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// recebe mensagem do page script para ativar imediatamente
self.addEventListener('message', (evt) => {
  if (evt.data === 'SKIP_WAITING') self.skipWaiting();
});

// network-first para navegação; fallback p/ offline
self.addEventListener('fetch', (evt) => {
  const req = evt.request;
  if (req.method !== 'GET') return;

  // navegação
  if (req.mode === 'navigate') {
    evt.respondWith((async () => {
      try {
        const net = await fetch(req);
        // guarda última index para offline
        put(STATIC, './index.html', net.clone());
        return net;
      } catch {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // estáticos do shell
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