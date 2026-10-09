const page = document.body.dataset.page;
const params = new URLSearchParams(location.search);
const message = document.querySelector('#form-message');
function safeNext(value) {
  if (!value) return '/agendamentos.html';
  try {
    const url = new URL(value, location.origin);
    if (url.origin === location.origin && ['/agendar.html', '/agendamentos.html', '/admin.html', '/agenda-admin.html'].includes(url.pathname)) return url.pathname + url.search;
  } catch { /* Use o destino padrão para URLs inválidas. */ }
  return '/agendamentos.html';
}
const next = safeNext(params.get('next'));
async function api(url, options = {}) {
  let response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(15000), ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }); }
  catch { throw new Error('Não foi possível conectar. Verifique sua conexão e tente novamente.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || 'Não foi possível concluir. Tente novamente.'); error.status = response.status; throw error; }
  return data;
}
function loginFor(target) { location.assign(`/entrar.html?next=${encodeURIComponent(target)}`); }
function dateLabel(value) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)); }
function node(tag, value, className) { const element = document.createElement(tag); element.textContent = value; if (className) element.className = className; return element; }

if (page === 'register' || page === 'login') {
  document.querySelector('#return-note').hidden = !next.startsWith('/agendar.html');
  document.querySelector('#switch-auth').href = `${page === 'login' ? 'cadastro' : 'entrar'}.html?next=${encodeURIComponent(next)}`;
  document.querySelector('#toggle-password').addEventListener('click', event => {
    const input = document.querySelector('#password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    event.currentTarget.textContent = show ? 'Ocultar' : 'Mostrar';
    event.currentTarget.setAttribute('aria-pressed', String(show));
  });
  document.querySelector('#auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type=submit]');
    const original = button.textContent;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    message.textContent = '';
    button.disabled = true; button.textContent = 'Aguarde…';
    try {
      const result = await api(`/api/auth/${page}`, { method: 'POST', body: JSON.stringify(data) });
      location.assign(result.user.role === 'administrador' && !params.has('next') ? '/admin.html' : next);
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; button.textContent = original; }
  });
}


function priceLabel(value){return value==null?'Valor a consultar com o atendimento':Number(value)===0?'Atendimento gratuito':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value));}
function action(label,callback){const button=node('button',label,'btn btn-light');button.type='button';button.addEventListener('click',callback);return button;}
if(page==='booking'){
 const professionalId=params.get('profissional'),form=document.querySelector('#booking-form');let user=null,available=[];
 const target=()=>{const query=new URLSearchParams(params);query.set('horario',new FormData(form).get('slotId')||'');return '/agendar.html?'+query;};
 const review=document.querySelector('#booking-review');
 function updateReview(){const selected=available.find(slot=>String(slot.id)===new FormData(form).get('slotId'));review.replaceChildren();review.hidden=!selected;if(!selected)return;review.append(node('h3','Confira seu atendimento'),node('p',dateLabel(selected.inicio_em)),node('strong',selected.local_nome),node('p',selected.local_endereco),node('p',priceLabel(selected.valor)));if(params.has('remarcar'))review.append(node('p','Seu horário atual será mantido até você confirmar esta troca.','muted'));}
 form.addEventListener('change',updateReview);
 async function loadSlots(){form.hidden=true;document.querySelector('#loading').hidden=false;document.querySelector('#retry-slots').hidden=true;
  try{if(!/^[1-9]\d{0,14}$/.test(professionalId||''))throw new Error('Escolha um profissional na tela Agendar para consultar seus horários.');
   const query=new URLSearchParams();if(params.get('local'))query.set('local',params.get('local'));
   const data=await api('/api/professionals/'+professionalId+'/availability?'+query);available=data.slots;
   const summary=document.querySelector('#professional-summary');const img=document.createElement('img');img.src=data.professional.avatar_url||'assets/icon.svg';img.alt='';const description=node('div','');description.append(node('h2',data.professional.name),node('p',data.professional.specialty,'muted'));summary.replaceChildren(img,description);
   document.title='Agendar com '+data.professional.name+' — Avelu';
   const back=document.querySelector('#booking-back');back.href='perfil.html?tipo=profissional&id='+professionalId+(params.get('local')?'&local='+encodeURIComponent(params.get('local')):'');back.textContent='← Voltar ao perfil';
   const slots=document.querySelector('#slots');slots.replaceChildren();
   for(const slot of available){const label=node('label','','slot'),radio=document.createElement('input');radio.type='radio';radio.name='slotId';radio.value=slot.id;radio.required=true;radio.checked=String(slot.id)===params.get('horario');const details=node('span','','slot-details');details.append(node('strong',dateLabel(slot.inicio_em)),node('span',slot.local_nome),node('small',slot.local_endereco),node('span',priceLabel(slot.valor)));label.append(radio,details);slots.append(label);}
   document.querySelector('#empty-slots').hidden=available.length>0;form.hidden=!available.length;updateReview();
   if(params.has('horario')&&!available.some(slot=>String(slot.id)===params.get('horario')))message.textContent='O horário escolhido não está mais disponível. Selecione outro.';
   const session=await api('/api/auth/me');user=session.user;
   document.querySelector('#booking-note').textContent=user?'Você está conectado como '+user.name+'. Confira o local, o dia e o valor antes de confirmar.':'Entre ou crie sua conta para confirmar. Seu horário ainda não está reservado.';
   form.querySelector('[type=submit]').textContent=user?(params.has('remarcar')?'Confirmar remarcação':'Confirmar agendamento'):'Entrar e continuar';
  }catch(error){message.textContent=error.message;document.querySelector('#retry-slots').hidden=false;}finally{document.querySelector('#loading').hidden=true;}}
 document.querySelector('#retry-slots').addEventListener('click',()=>{message.textContent='';loadSlots();});
 form.addEventListener('submit',async event=>{event.preventDefault();if(!user)return loginFor(target());const button=form.querySelector('[type=submit]');button.disabled=true;message.textContent='';try{const result=await api('/api/appointments',{method:'POST',body:JSON.stringify({slotId:new FormData(form).get('slotId'),rescheduleId:params.get('remarcar')||undefined})});try{sessionStorage.setItem('avelu-booked',String(result.id));}catch{}location.assign('/agendamentos.html');}catch(error){if(error.status===401)return loginFor(target());if(error.status===409)await loadSlots();message.textContent=error.message;}finally{button.disabled=false;}});loadSlots();
}
if(page==='appointments'){
 let booked;try{booked=sessionStorage.getItem('avelu-booked');sessionStorage.removeItem('avelu-booked');}catch{}
 const list=document.querySelector('#appointments'),dialog=document.querySelector('#cancel-dialog');let cancelId=null;
 const statusLabels={agendado:'Agendado',confirmado:'Confirmado',concluido:'Concluído',cancelado:'Cancelado'};
 async function loadAppointments(){document.querySelector('#loading').hidden=false;document.querySelector('#retry-appointments').hidden=true;
  try{const appointments=await api('/api/appointments');list.replaceChildren();appointments.sort((a,b)=>{const active=x=>['agendado','confirmado'].includes(x.status)&&new Date(x.inicio_em)>new Date();return Number(active(b))-Number(active(a))||(active(a)?new Date(a.inicio_em)-new Date(b.inicio_em):new Date(b.inicio_em)-new Date(a.inicio_em));});
   if(!appointments.length)list.append(node('p','Você ainda não tem agendamentos. Encontre um profissional e escolha seu primeiro horário.','muted'));
   for(const a of appointments){const card=node('article','','appointment-item');card.id='agendamento-'+a.id;card.append(node('span',statusLabels[a.status]||a.status,'status-pill'),node('h2',a.name),node('p',a.specialty,'muted'),node('p',dateLabel(a.inicio_em)),node('strong',a.local_nome||'Local ainda não informado'),node('p',a.local_endereco||'Confirme o endereço com o profissional.'),node('p',priceLabel(a.valor)));if(['agendado','confirmado'].includes(a.status)&&new Date(a.inicio_em)>new Date()){const actions=node('div','','booking-actions');const change=node('a','Remarcar','btn btn-light');change.href='agendar.html?profissional='+a.profissional_id+'&remarcar='+a.id;const cancel=action('Cancelar',()=>{cancelId=a.id;document.querySelector('#cancel-detail').textContent=a.name+' · '+dateLabel(a.inicio_em);document.querySelector('#cancel-message').textContent='';dialog.showModal();});actions.append(change,cancel);card.append(actions);}list.append(card);}
   if(booked){document.querySelector('#booking-success').hidden=false;const card=document.querySelector('#agendamento-'+booked);if(card){card.classList.add('appointment-selected');card.tabIndex=-1;card.focus();}booked=null;}
  }catch(error){if(error.status===401)return loginFor('/agendamentos.html');message.textContent=error.message;document.querySelector('#retry-appointments').hidden=false;}finally{document.querySelector('#loading').hidden=true;}}
 document.querySelector('#retry-appointments').addEventListener('click',()=>{message.textContent='';loadAppointments();});
 document.querySelector('#keep-appointment').addEventListener('click',()=>dialog.close());
 document.querySelector('#confirm-cancel').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{await api('/api/appointments/'+cancelId+'/cancel',{method:'POST'});dialog.close();message.textContent='';document.querySelector('#booking-success').hidden=true;await loadAppointments();}catch(error){document.querySelector('#cancel-message').textContent=error.message;}finally{button.disabled=false;}});
 const profile=document.querySelector('#account-form');
 async function loadAccount(){try{const data=await api('/api/account');profile.elements.name.value=data.name;profile.elements.phone.value=data.phone||'';profile.elements.email.value=data.email;profile.hidden=false;}catch(error){if(error.status===401)return loginFor('/agendamentos.html');document.querySelector('#account-message').textContent=error.message;}}
 profile.addEventListener('submit',async event=>{event.preventDefault();const button=profile.querySelector('button');button.disabled=true;try{await api('/api/account',{method:'POST',body:JSON.stringify({name:profile.elements.name.value,phone:profile.elements.phone.value})});document.querySelector('#account-message').textContent='Dados atualizados.';}catch(error){document.querySelector('#account-message').textContent=error.message;}finally{button.disabled=false;}});
 document.querySelector('#logout').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{await api('/api/auth/logout',{method:'POST'});location.assign('/index.html');}catch(error){message.textContent=error.message;button.disabled=false;}});
 loadAppointments();loadAccount();
}
