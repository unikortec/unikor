// SW super simples – só mantém a página on-line e ignora cache agressivo
self.addEventListener('install', (e)=> self.skipWaiting());
self.addEventListener('activate', (e)=> self.clients.claim());

// Não vamos interceptar/guardar nada do Drive (deixa rede decidir)
self.addEventListener('fetch', ()=>{ /* no-op */ });