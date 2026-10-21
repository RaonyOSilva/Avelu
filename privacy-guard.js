(()=>{
 const protectedPage=/\/(?:agendamentos|atendimento|profissional|consulta|equipe|admin|agenda-admin|operacao|programacao|senha|convites)\.html$/i.test(location.pathname);
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('avelu-session'):null;
 function hide(){if(!protectedPage)return;document.body.replaceChildren();location.replace('/entrar.html?next='+encodeURIComponent(location.pathname));}
 if(channel)channel.onmessage=e=>{if(e.data==='logout')hide();};
 addEventListener('pageshow',e=>{if(e.persisted){document.body.replaceChildren();location.reload();}});
 const original=window.fetch.bind(window);
 window.fetch=async(...args)=>{const response=await original(...args);const url=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href);
  if(url.origin===location.origin&&url.pathname==='/api/auth/logout'&&response.ok){
   channel?.postMessage('logout');
   if('caches' in window)caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('avelu-')).map(k=>caches.delete(k)))).catch(()=>{});
  }return response;
 };
})();
