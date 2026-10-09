const menuButton=document.querySelector('.menu');
const mobileNav=document.querySelector('#mobile-nav');
menuButton?.addEventListener('click',()=>{const open=mobileNav.classList.toggle('open');menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Fechar menu':'Abrir menu');});
mobileNav?.addEventListener('click',event=>{if(event.target.closest('a')){mobileNav.classList.remove('open');menuButton.setAttribute('aria-expanded','false');}});
fetch('/api/auth/me').then(response=>response.ok?response.json():null).then(session=>{
  if(!session?.user)return;
  const admin=session.user.role==='administrador';
  document.querySelectorAll('a[href="entrar.html"]').forEach(link=>{link.href=admin?'admin.html':'agendamentos.html';link.textContent=admin?'Administrar':'Minha conta';});
  document.querySelectorAll('.actions a[href="cadastro.html"],.mobile-nav a[href="cadastro.html"]').forEach(link=>link.remove());
}).catch(()=>{});
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));}
