const CACHE='avelu-v8';
const FILES=['./','./index.html','./sobre.html','./cadastro.html','./entrar.html','./agendar.html','./agendamentos.html','./paginas.css','./conta.css','./conta.js','./app.js','./manifest.webmanifest','./assets/icon.svg','./assets/logo.png','./assets/hero-woman.png','./assets/avatar-gustavo.png','./assets/avatar-mariana.png','./assets/avatar-pedro.png'];
FILES.push('./buscar.html','./buscar.css','./buscar.js');
FILES.push('./recuperar.html','./recuperar.js');
FILES.push('./perfil.html','./perfil.css','./perfil.js');
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/')){
    event.respondWith(fetch(event.request).catch(()=>new Response(JSON.stringify({error:'Você está offline.'}),{status:503,headers:{'Content-Type':'application/json'}})));
    return;
  }
  if(!FILES.some(file=>new URL(file,self.location.href).pathname===url.pathname))return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;}).catch(()=>caches.match(event.request,{ignoreSearch:true}).then(cached=>cached||Response.error())));
});
