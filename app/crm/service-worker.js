const CACHE='unikor-crm-cache-v1';
const ASSETS=['./','./index.html','./styles.css','./manifest.json',
'./js/app.js','./js/firebase.js','./js/utils.js','./js/ofx.js',
'./js/modules/clients.js','./js/modules/map.js','./js/modules/expenses.js',
'./js/modules/entries.js','./js/modules/finance.js','./js/modules/total.js'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k===CACHE?null:caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',e=>{
  e.respondWith(
    caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
      if(e.request.method==='GET'){
        const cp=res.clone();
        caches.open(CACHE).then(c=>c.put(e.request,cp));
      }
      return res;
    }).catch(()=>r))
  );
});