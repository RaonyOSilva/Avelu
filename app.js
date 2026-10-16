const menuButton=document.querySelector('.menu');
const mobileNav=document.querySelector('#mobile-nav');
menuButton?.addEventListener('click',()=>{const open=mobileNav.classList.toggle('open');menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Fechar menu':'Abrir menu');});
mobileNav?.addEventListener('click',event=>{if(event.target.closest('a')){mobileNav.classList.remove('open');menuButton.setAttribute('aria-expanded','false');}});
fetch('/api/auth/me?audience=patient').then(response=>response.ok?response.json():null).then(session=>{
  if(session?.user?.role!=='paciente')return;
  const admin=session.user.role==='administrador';
  document.querySelectorAll('a[href="entrar.html"]').forEach(link=>{link.href=admin?'admin.html':session.user.isProfessional?'profissional.html':session.user.role==='equipe'?'atendimento.html':'agendamentos.html';link.textContent=admin?'Administrar':session.user.isProfessional?'Minha agenda':session.user.role==='equipe'?'Área de atendimento':'Minha conta';});
  document.querySelectorAll('.actions a[href="cadastro.html"],.mobile-nav a[href="cadastro.html"]').forEach(link=>link.remove());
}).catch(()=>{});
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));}
