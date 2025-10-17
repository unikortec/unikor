const CACHE_NAME = 'unikor-config-v2';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/firestore.js',
  './js/importers.js',
  './js/utils.js',
  './manifest.json',
  '/assets/logo/unikorbranco-logo-192.png',
  '/assets/logo/unikorbranco-logo-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
  self.clients.matchAll({ type: 'window' }).then(clients => {
    for (const client of clients) client.navigate(client.url);
  });
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(res =>
      res || fetch(e.request).catch(() => caches.match('./index.html'))
    )
  );
});