const CACHE='avelu-v3';
const FILES=['./','./index.html','./sobre.html','./paginas.css','./app.js','./manifest.webmanifest','./assets/icon.svg','./assets/logo.png','./assets/hero-woman.png','./assets/avatar-gustavo.png','./assets/avatar-mariana.png','./assets/avatar-pedro.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.pathname.startsWith('/api/')){
    event.respondWith(fetch(event.request).catch(()=>new Response(JSON.stringify({error:'Você está offline.'}),{status:503,headers:{'Content-Type':'application/json'}})));
    return;
  }
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html'))));
});
