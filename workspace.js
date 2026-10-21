(()=>{
 const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.json()).then(({user})=>{if(!user)return;if(user.passwordChangeRequired){location.replace('senha.html');return;}
 const nav=el('nav','');nav.className='workspace-nav';nav.setAttribute('aria-label','Menu do módulo');
 const professionalModule=['/profissional.html','/consulta.html'].includes(location.pathname);
 const links=professionalModule?[['profissional.html?aba=conta','Minha Conta']]:[['index.html','Ver site'],['senha.html','Minha senha']];
 if(user.isProfessional)links.push(['profissional.html','Minha Agenda'],['profissional.html?aba=relatorios','Relatórios']);
 if(user.role==='equipe'||user.role==='administrador')links.push(['atendimento.html','Agenda da equipe'],['programacao.html','Publicar agendas'],['operacao.html?aba=pacientes','Pacientes'],['operacao.html?aba=comunicacao','Comunicação']);
 if(user.role==='administrador')links.push(['operacao.html?aba=indicadores','Visão geral'],['admin.html','Profissionais e locais'],['operacao.html?aba=usuarios','Usuários e permissões'],['equipe.html','Liberar acessos'],['operacao.html?aba=auditoria','Histórico de ações'],['operacao.html?aba=unidades','Orientações e convênios']);
 if(user.role==='paciente'&&!professionalModule)links.push(['agendamentos.html','Minha conta']);
 for(const [href,label] of links){const a=el('a',label);a.href=href;if(location.pathname.slice(1)+location.search===href)a.setAttribute('aria-current','page');nav.append(a);}
 if(user.role==='administrador'){const a=el('a','Convites de homologação');a.href='convites.html';a.hidden=true;nav.append(a);fetch('/api/environment').then(r=>r.json()).then(env=>{a.hidden=!env.inviteOnly;}).catch(()=>{});}
 const exit=el('button','Sair');exit.className='text-button';exit.onclick=async()=>{exit.disabled=true;try{const r=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error();location.assign('entrar.html?next='+encodeURIComponent(location.pathname+location.search));}catch{exit.disabled=false;exit.textContent='Tentar sair novamente';}};nav.append(exit);
 const identity=el('div','');identity.className='workspace-identity';
 identity.append(el('small','Conectado como'),el('strong',user.name),el('small',user.email));nav.append(identity);
 document.body.classList.add('has-workspace');document.body.prepend(nav);
 }).catch(()=>{});
})();
