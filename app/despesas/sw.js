// SW de update agressivo (sempre pega versão nova quando houver)
const VERSION = 'despesas-v3-' + (self.registration?.scope || '');
const PRECACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/scanner.js',
  './js/modal.js',
  './manifest.json'
];

// Instala e já ativa a nova versão (skipWaiting)
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(VERSION);
      await cache.addAll(PRECACHE);
    } catch (e) {
      // se algum asset falhar, ainda assim prossegue
      console.warn('[SW] Precaching parcial:', e?.message || e);
    }
  })());
  self.skipWaiting();
});

// Remove caches antigos e toma o controle imediato
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== VERSION ? caches.delete(k) : null)));
    await self.clients.claim();
    // avisa as páginas para recarregarem se quiserem
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(c => c.postMessage({ type: 'SW_ACTIVATED', version: VERSION }));
  })());
});

// Mensagem externa para forçar update (usado pela página)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

// Estratégia de fetch:
// - Para navegações/HTML: NETWORK-FIRST e NÃO cacheia (sempre mais novo).
// - Para outros assets (CSS/JS/PNG): STALE-WHILE-REVALIDATE.
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Ignora métodos não-GET
  if (req.method !== 'GET') return;

  const isHTML =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // HTML sempre da rede; se falhar, tenta cache
    event.respondWith((async () => {
      try {
        // no-store para evitar servir em cache intermediário
        const fresh = await fetch(new Request(req, { cache: 'no-store' }));
        return fresh;
      } catch (e) {
        const cached = await caches.match('./index.html');
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Assets estáticos: SWR
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then((netRes) => {
      // evita cachear respostas inválidas
      if (netRes && netRes.status === 200 && netRes.type !== 'opaque') {
        cache.put(req, netRes.clone()).catch(()=>{});
      }
      return netRes;
    }).catch(() => cached);
    return cached || fetchPromise;
  })());
});