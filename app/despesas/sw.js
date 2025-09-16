// portal/apps/despesas/sw.js
// Força update: skipWaiting + clients.claim + network-first p/ navegações
const CACHE_VERSION = 'v3'; // <-- se mudar assets, incremente aqui
const CACHE = `unikor-despesas-${CACHE_VERSION}`;
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/app.js',
  './js/drive.js',
  './js/nfe.js',
  './js/store.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE_ASSETS);
  })());
  // entra em ação imediatamente na próxima navegação
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // limpa caches antigos
    const names = await caches.keys();
    await Promise.all(names.map(n => (n.startsWith('unikor-despesas-') && n !== CACHE) ? caches.delete(n) : undefined));
    await self.clients.claim();
  })());
});

// opcional: permitir pular waiting via mensagem
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Estratégia:
// - Navegações (HTML): network-first com no-store (pega versão nova do app); fallback cache quando offline
// - Outros assets: cache-first
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // HTML / navegações
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    event.respondWith((async () => {
      try {
        // sempre tentar rede sem usar cache do browser
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE);
        cache.put('./', fresh.clone()); // mantém um shell
        return fresh;
      } catch {
        // se offline, tentar cache
        const cached = await caches.match('./');
        return cached || new Response('Offline', { status: 200 });
      }
    })());
    return;
  }

  // Demais arquivos: cache-first
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone());
      return res;
    } catch {
      // offline e sem cache
      return new Response('Offline', { status: 200 });
    }
  })());
});