const CACHE_NAME = 'unikor-pedidos-v1.3.2';

const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './manifest.json',
  './js/utils.js',
  './js/ui.js',
  './js/firebase.js',
  './js/itens.js',
  './js/clientes.js',
  './js/frete.js',
  './js/pdf.js',
  './js/modal-cliente.js',
  './js/app.js',
  '/assets/logo/unikorbranco-logo.svg',
  '/assets/logo/favicon.ico',
  '/assets/logo/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((n) => n !== CACHE_NAME && caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Network-first para HTML/JS (evita prender versão antiga).
// Cache-first para demais GETs.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const { request } = event;
  const isHTML = request.mode === 'navigate' || request.destination === 'document';
  const isJS   = request.destination === 'script';

  if (isHTML || isJS) {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          return resp;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
