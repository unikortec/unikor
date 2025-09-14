/* UNIKOR Portal – Service Worker (v1.0.0) */
const CACHE = "unikor-portal-v1.0.0";
const CORE = [
  "./index.html","./manifest.json","./favicon.ico",
  "./js/firebase.js","./js/auth.js","./js/guard.js","./js/ui.js","./js/icons.js",
  "./assets/logo/unikor-logo.svg","./assets/logo/unikor-logo.png"
];

self.addEventListener("install", (e)=>{
  e.waitUntil((async()=>{
    const c = await caches.open(CACHE);
    await c.addAll(CORE.map(u=>new Request(u,{cache:"reload"})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate",(e)=>{
  e.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch",(e)=>{
  const req = e.request;
  if (req.method!=="GET") return;
  e.respondWith((async()=>{
    try{
      const net = await fetch(req);
      if (net.ok && new URL(req.url).origin === location.origin){
        const c = await caches.open(CACHE);
        c.put(req, net.clone());
      }
      return net;
    }catch{
      const c = await caches.open(CACHE);
      const hit = await c.match(req, {ignoreSearch:true});
      return hit || new Response("",{status:504});
    }
  })());
});
