/* Unikor – Relatórios SW */
const APP_VERSION = '1.1.4';
const CACHE = `unikor-relatorios::${APP_VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const core = [
      './', './index.html', './manifest.json',
      './css/style.css',
      './js/firebase.js', './js/db.js', './js/render.js',
      './js/modal.js', './js/export.js', './js/app.js',
      './sw.js'
    ];
    await Promise.allSettled(core.map(u => cache.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('unikor-relatorios::') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isHTML = req => req.mode === 'navigate' || (req.headers.get('accept')||'').includes('text/html');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (isHTML(req)) {
    event.respondWith((async () => {
      try {
        const net = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE);
        cache.put(req, net.clone());
        return net;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match(req, { ignoreSearch:true })) || (await cache.match('./index.html')) ||
          new Response('<h1>Offline</h1>', { headers:{'Content-Type':'text/html; charset=utf-8'} });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    try { return await fetch(req); }
    catch {
      const cache = await caches.open(CACHE);
      return (await cache.match(req, { ignoreSearch:true })) || new Response('', { status:504 });
    }
  })());
});