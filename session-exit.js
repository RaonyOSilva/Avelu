(()=>{
 const file=location.pathname.split('/').pop();
 const target=['profissional.html','consulta.html'].includes(file)?'/profissional.html':
 ['admin.html','equipe.html','agenda-admin.html'].includes(file)?'/admin.html':
 file==='operacao.html'&&!['pacientes','comunicacao'].includes(new URLSearchParams(location.search).get('aba'))?'/admin.html':
 ['atendimento.html','programacao.html','operacao.html'].includes(file)?'/atendimento.html':'/agendamentos.html';
 const login='entrar.html?next='+encodeURIComponent(target);
 if(location.protocol==='file:'){location.replace('http://localhost:3000/'+login);return;}
 window.addEventListener?.('pageshow',event=>{if(event.persisted)location.reload();});
 const bar=document.createElement('div');bar.className='session-exit';
 const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent='Sair';
 const status=document.createElement('span');status.setAttribute('role','status');
 const back=document.createElement('a');back.textContent='Voltar ao login';back.href=login;back.hidden=true;
 bar.append(button,status,back);(document.querySelector('header')||document.body).append(bar);
 let busy=false;
 async function exit(){if(busy)return;busy=true;button.disabled=true;status.textContent='';
  try{const r=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});if(!r.ok&&r.status!==401)throw Error();location.replace(login);}
  catch{status.textContent='Não foi possível encerrar a sessão. Tente novamente ou volte ao login; a sessão pode continuar ativa.';back.hidden=false;}
  finally{busy=false;button.disabled=false;}
 }
 window.exitModule=exit;button.addEventListener('click',exit);
 document.addEventListener('click',event=>{const e=event.target.closest?.('#logout,#team-logout,.workspace-nav button');if(!e)return;event.preventDefault();event.stopImmediatePropagation();exit();},true);
})();
