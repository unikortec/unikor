const CACHE_NAME = 'unikor-config-v1'; // troque versão sempre que atualizar
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/firestore.js',
  './js/importers.js',
  './js/utils.js',
  './manifest.json'
];

// Instalação (pré-cache e skipWaiting)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
  );
  // força ativação imediata (sem esperar usuários fecharem abas antigas)
  self.skipWaiting();
});

// Ativação (limpa caches antigos e assume controle)
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  // assume imediatamente as páginas abertas
  self.clients.claim();

  // força recarregar abas ativas pra aplicar versão nova
  self.clients.matchAll({ type: 'window' }).then(clients => {
    for (const client of clients) {
      client.navigate(client.url);
    }
  });
});

// Fetch handler (cache-first fallback)
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(res =>
      res ||
      fetch(req).catch(() => caches.match('./index.html'))
    )
  );
});