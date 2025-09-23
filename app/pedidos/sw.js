/* Unikor – Pedidos: Service Worker */
const APP_VERSION = '1.0.1';
const SW_VERSION  = `pedidos-v${APP_VERSION}`;
const CACHE_NAME  = `unikor-pedidos::${SW_VERSION}`;

/* === Escopo / Base path detectados do registro (ex.: /portal/app/pedidos/) === */
const SCOPE_URL = new URL(self.registration.scope);
const BASE_PATH = SCOPE_URL.pathname.endsWith('/') ? SCOPE_URL.pathname : SCOPE_URL.pathname + '/';
const abs = (path) => new URL(path, SCOPE_URL).toString();

/* === Lista de ativos essenciais (same-origin, relativos ao diretório do app) ===
   Ajuste conforme a pasta /portal/app/pedidos/ */
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
  // 'js/state.js', // inclua se existir no build final

  // Logos/ícones
  'unikorbranco-logo.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',

  // O próprio SW (útil p/ update/debug)
  'sw.js'
];

/* Converte para URLs absolutas respeitando subpasta */
const CORE_ASSETS = [ BASE_PATH, ...CORE_ASSETS_REL.map((p) => abs(p)) ];

/* === Pré-cache (best-effort) === */
async function cacheCoreAssets(cache) {
  const reqs = CORE_ASSETS.map((u) => new Request(u, { cache: 'reload' }));
  await Promise.allSettled(reqs.map((r) => cache.add(r)));
}

/* === INSTALL → precache + ativação imediata === */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cacheCoreAssets(cache);
    await self.skipWaiting();
  })());
});

/* === ACTIVATE → limpa caches antigos + assume abas === */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('unikor-pedidos::') && k !== CACHE_NAME)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();

    // avisa janelas que novo SW está ativo
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      client.postMessage({ type: 'SW_ACTIVATED', version: SW_VERSION });
    }
  })());
});

/* === Mensagens da página === */
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

/* === Utils === */
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

/* Não cachear APIs e domínios dinâmicos (Firebase e afins) */
function isBypassCache(url) {
  const u = new URL(url);
  // APIs do app: /portal/app/pedidos/api/*  (ou qualquer /api sob o BASE_PATH)
  if (u.origin === self.location.origin && u.pathname.startsWith(BASE_PATH + 'api/')) return true;

  // Rotas API no root do portal (ex.: /portal/api/* ou /api/*)
  if (u.origin === self.location.origin && /^\/(portal\/)?api\//.test(u.pathname)) return true;

  // Infra Firebase / uploads
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

/* Estáticos same-origin? */
function isStaticSameOrigin(url) {
  const u = new URL(url);
  if (u.origin !== self.location.origin) return false;
  return /\.(png|jpg|jpeg|svg|webp|ico|css|js|json|woff2?)$/i.test(u.pathname);
}

/* Offline HTML simples */
function offlineHTML() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Offline</title><h1>Offline</h1><p>Sem conexão e sem cache disponível.</p>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

/* === Estratégias de fetch === */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Nunca interceptar chamadas que não devem ser cacheadas
  if (isBypassCache(req.url)) return;

  // Navegação HTML → network-first com fallback ao cache/offline
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

  // Estáticos same-origin → stale-while-revalidate
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

  // Outros GET same-origin → network com fallback simples de cache
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