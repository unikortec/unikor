/* Unikor – Pedidos: Service Worker */
const APP_VERSION = '3.4.1';
const SW_VERSION  = `pedidos-v${APP_VERSION}`;
const CACHE_NAME  = `unikor-pedidos::${SW_VERSION}`;

/* Escopo detectado (ex.: /portal/app/pedidos/) */
const SCOPE_URL = new URL(self.registration.scope);
const BASE_PATH = SCOPE_URL.pathname.endsWith('/') ? SCOPE_URL.pathname : SCOPE_URL.pathname + '/';
const abs = (path) => new URL(path, SCOPE_URL).toString();

/* Ativos essenciais (relativos ao diretório do app)
   + ícones globais fora do diretório (paths absolutos começando com /assets/...) */
const CORE_ASSETS_REL = [
  'index.html',
  'manifest.json',
  'css/style.css',

  // JS principais
  'js/app.js',
  'js/itens.js',
  'js/frete.js',
  'js/pdf.js',
  'js/firebase.js',
  'js/db.js',
  'js/clientes.js',
  'js/ui.js',
  'js/utils.js',
  'js/legacy-adapter.js',

  // Ícones/branding em assets/logo (raiz do site)
  '/assets/logo/icon-192.png',
  '/assets/logo/icon-512.png',
  '/assets/logo/apple-touch-icon.png',
  '/assets/logo/unikorbranco-logo.svg',
  '/assets/logo/favicon.ico',

  // O próprio SW
  'sw.js'
];

/* Converte para URLs absolutas respeitando subpasta */
const CORE_ASSETS = [ BASE_PATH, ...CORE_ASSETS_REL.map((p) => abs(p)) ];

/* Pré-cache (best-effort) */
async function cacheCoreAssets(cache) {
  const reqs = CORE_ASSETS.map((u) => new Request(u, { cache: 'reload' }));
  await Promise.allSettled(reqs.map((r) => cache.add(r)));
}

/* INSTALL */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cacheCoreAssets(cache);
    await self.skipWaiting();
  })());
});

/* ACTIVATE */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('unikor-pedidos::') && k !== CACHE_NAME)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();

    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      client.postMessage({ type: 'SW_ACTIVATED', version: SW_VERSION });
    }
  })());
});

/* Mensagens */
self.addEventListener('message', (event) => {
  const data = event.data;
  const type = (typeof data === 'string') ? data : (data && data.type);
  if (type === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (type === 'PING') { event.source && event.source.postMessage({ type: 'PONG', version: SW_VERSION }); }
  if (type === 'CLEAR_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      event.source && event.source.postMessage({ type: 'CACHE_CLEARED' });
    })());
  }
});

/* Utils */
function fetchWithTimeout(req, ms = 9000, opts = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort('timeout'), ms);
  return fetch(req, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
}
function isHTMLRequest(req) {
  if (req.mode === 'navigate') return true;
  const accept = req.headers.get('accept') || '';
  return accept.includes('text/html');
}

/* Não cachear APIs e domínios dinâmicos */
function isBypassCache(url) {
  const u = new URL(url);

  // APIs do app (…/pedidos/api/*)
  if (u.origin === self.location.origin && u.pathname.startsWith(BASE_PATH + 'api/')) return true;

  // APIs do portal ( /portal/api/* ou /api/* )
  if (u.origin === self.location.origin && /^\/(portal\/)?api\//.test(u.pathname)) return true;

  // Firebase
  const bypassHosts = new Set([
    'firestore.googleapis.com',
    'firebaseinstallations.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'storage.googleapis.com',
    'unikorapp.appspot.com'
  ]);
  return bypassHosts.has(u.host);
}

function isStaticSameOrigin(url) {
  const u = new URL(url);
  if (u.origin !== self.location.origin) return false;
  return /\.(png|jpg|jpeg|svg|webp|ico|css|js|json|woff2?)$/i.test(u.pathname);
}

/* Offline mínimo */
function offlineHTML() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Offline</title><h1>Offline</h1><p>Sem conexão e sem cache disponível.</p>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

/* Fetch strategy */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (isBypassCache(req.url)) return;

  if (isHTMLRequest(req)) {
    event.respondWith((async () => {
      try {
        const net = await fetchWithTimeout(req, 9000, { cache: 'no-store' });
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, net.clone());
        return net;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req, { ignoreSearch: true }) ||
                       await cache.match(abs('index.html')) ||
                       await cache.match(BASE_PATH);
        return cached || offlineHTML();
      }
    })());
    return;
  }

  if (isStaticSameOrigin(req.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req, { ignoreSearch: true });
      const fetchAndUpdate = fetch(req).then((resp) => {
        if (resp && resp.status === 200) cache.put(req, resp.clone());
        return resp;
      }).catch(() => null);
      return cached || await fetchAndUpdate || new Response('', { status: 504 });
    })());
    return;
  }

  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req, { ignoreSearch: true });
        return cached || new Response('', { status: 504 });
      }
    })());
  }
});