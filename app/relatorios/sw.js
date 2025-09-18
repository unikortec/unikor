const CACHE='unikor-relatorios-v101';
self.addEventListener('install', e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(CACHE);
    await c.addAll(['./','./index.html','./css/style.css','./js/app.js','./js/firebase.js']);
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    self.clients.claim();
  })());
});
self.addEventListener('fetch', e=>{
  const url=new URL(e.request.url);
  if (url.origin===location.origin){
    e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request)));
  }
});
self.addEventListener('message', e=>{ if (e.data==='SKIP_WAITING') self.skipWaiting(); });
