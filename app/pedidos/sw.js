const CACHE_NAME = 'unikor-pedidos-v1.2'; // INCREMENTEI A VERSÃO
const urlsToCache = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/ui.js',
  './js/utils.js',
  './js/firebase.js',
  './js/clientes.js',
  './js/frete.js',
  './js/pdf.js',
  './js/modal-cliente.js', // ADICIONADO
  './manifest.json',
  '/assets/logo/unikorbranco-logo.svg',
  '/assets/logo/favicon.ico',
  '/assets/logo/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          return response || fetch(event.request);
        })
    );
  }
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
