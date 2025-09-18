/* UNIKOR Portal – Service Worker (v1.0.2) */
const CACHE = "unikor-portal-v1.0.2.16";

const CORE = [
  // Shell & PWA
  "./index.html",
  "./manifest.json",
  "./favicon.ico",

  // Módulos (offline-ready)
  "./pedidos.html",
  "./relatorios.html",
  "./estoque.html",
  "./despesas.html",
  "./crm.html",
  "./dashboard.html",
  "./config.html",

  // JS
  "./js/firebase.js",
  "./js/auth.js",
  "./js/guard.js",
  "./js/ui.js",
  "./js/icons.js",

  // Ícones
  "./assets/logo/unikor-logo.svg",
  "./assets/logo/unikor-logo.png",
  "./assets/logo/android-chrome-192x192.png",
  "./assets/logo/android-chrome-512x512.png",
  "./assets/logo/apple-touch-icon.png",
  "./assets/logo/favicon-32x32.png",
  "./assets/logo/favicon-16x16.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE.map(u => new Request(u, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith((async () => {
    try {
      // ONLINE FIRST
      const net = await fetch(req);
      if (net.ok && new URL(req.url).origin === location.origin) {
        const cache = await caches.open(CACHE);
        cache.put(req, net.clone());
      }
      return net;
    } catch {
      // OFFLINE FALLBACK
      const cache = await caches.open(CACHE);

      // Navegações (HTML) → devolve o index.html do cache (SPA fallback)
      const isNav =
        req.mode === "navigate" ||
        (req.headers.get("accept") || "").includes("text/html");
      if (isNav) {
        const index = await cache.match("./index.html", { ignoreSearch: true });
        if (index) return index;
      }

      // Tenta retornar o recurso do cache
      const hit = await cache.match(req, { ignoreSearch: true });
      return hit || new Response("", { status: 504 });
    }
  })());
});












