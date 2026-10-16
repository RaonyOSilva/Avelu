const professionalPortal=location.pathname==='/profissional.html';
const portalPath=professionalPortal?'/profissional.html':'/atendimento.html';
const $ = selector => document.querySelector(selector);
const node = (tag,text,cls) => { const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e; };
const filters=$('#filters'), publish=$('#publish-form'), manual=$('#manual-form'), actionForm=$('#action-form');
let pairs=[], slots=[], cancelled=[], view='agenda', version=0, selectedSlot=null, selectedAction=null;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const hour=value=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const dayLabel=value=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'long'}).format(new Date(value+'T12:00:00-03:00'));
const money=value=>value==null?'Valor a consultar':Number(value)===0?'Gratuito':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value));
const labels={encerrado:'Horário encerrado',disponivel:'Livre',reservado:'Reservado',bloqueado:'Bloqueado',agendado:'Aguardando confirmação',confirmado:'Confirmado',concluido:'Concluído',cancelado:'Cancelado'};
filters.elements.dia.value=today();

async function api(url,body,method) {
  let response;
  try { response=await fetch(professionalPortal?url.replace('/api/team/','/api/professional/'):url,{method:method||(body?'POST':'GET'),signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}); }
  catch { throw new Error('Não foi possível conectar. Confira sua conexão e tente novamente.'); }
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    if(response.status===401)location.assign('entrar.html?next='+encodeURIComponent(portalPath));
    if(response.status===403){$('#workspace').hidden=true;$('#publish-open').hidden=true;$('#agenda-list').replaceChildren();$('#access-status').textContent=data.error||'Seu acesso foi revogado.';$('#switch-account').hidden=false;$('#logout').hidden=false;$('#password-open').hidden=true;}
    throw Object.assign(new Error(data.error||'Não foi possível concluir. Atualize a agenda.'),{status:response.status});
  }
  return data;
}
function button(text,callback,primary=false) {const e=node('button',text,'btn '+(primary?'btn-primary':'btn-light'));e.type='button';e.addEventListener('click',callback);return e;}
function options(select,items,placeholder) {
  const previous=select.value;select.replaceChildren();
  const initial=node('option',placeholder);initial.value='';select.append(initial);
  for(const item of items){const option=node('option',item.name);option.value=item.id;select.append(option);}
  if(items.some(item=>String(item.id)===previous))select.value=previous;
}
function unique(items,id,name){return [...new Map(items.map(p=>[p[id],{id:p[id],name:p[name]}])).values()];}
function selectPublishPlaces(){
  options(publish.elements.local_id,unique(pairs.filter(p=>p.publicado&&String(p.profissional_id)===publish.elements.profissional_id.value),'local_id','local'),'Selecione o local');
  if(publish.elements.local_id.options.length===2)publish.elements.local_id.selectedIndex=1;
}
function slotSummary(slot){return `${slot.profissional} · ${slot.local||'Local não informado'} · ${dayLabel(slot.inicio_em.slice(0,10))} às ${hour(slot.inicio_em)} · ${money(slot.valor)}`;}
function openManual(slot){selectedSlot=slot;manual.reset();if(typeof fillWaitingPatient==='function')fillWaitingPatient(slot);$('#manual-summary').textContent=slotSummary(slot);$('#manual-message').textContent='';$('#manual-dialog').showModal();}
function openAction(slot,type){
  selectedAction={slot,type};actionForm.reset();$('#action-message').textContent='';
  const titles={confirmado:'Confirmar atendimento?',cancelado:'Cancelar atendimento?',concluido:'Concluir atendimento?',bloqueado:'Bloquear este horário?',disponivel:'Reabrir este horário?'};
  $('#action-title').textContent=titles[type];$('#action-summary').textContent=(slot.paciente?slot.paciente+' — ':'')+slotSummary(slot);
  $('#cancel-fields').hidden=type!=='cancelado';actionForm.elements.motivo.required=type==='cancelado';
  $('#action-submit').textContent={confirmado:'Confirmar atendimento',cancelado:'Cancelar atendimento',concluido:'Marcar como concluído',bloqueado:'Bloquear horário',disponivel:'Disponibilizar no site'}[type];
  $('#action-dialog').showModal();
}
function render(){
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  const titles={agenda:'Agenda de ',disponivel:'Horários livres de ',agendado:'A confirmar em ',confirmado:'Confirmados em ',cancelled:'Cancelamentos de ',aguardando:'Pacientes aguardando em ',em_atendimento:'Em atendimento em ',faltou:'Não compareceram em '};
  $('#agenda-title').textContent=titles[view]+dayLabel(filters.elements.dia.value);
  $('#count-free').textContent=slots.filter(s=>s.status==='disponivel'&&new Date(s.inicio_em)>new Date()).length;
  $('#count-pending').textContent=slots.filter(s=>s.agendamento_status==='agendado').length;
  $('#count-confirmed').textContent=slots.filter(s=>s.agendamento_status==='confirmado'&&s.fluxo!=='faltou').length;
  $('#count-cancelled').textContent=cancelled.length;
  const list=$('#agenda-list');list.replaceChildren();const items=view==='cancelled'?cancelled:view==='agenda'?slots:slots.filter(s=>view==='disponivel'?s.status==='disponivel'&&new Date(s.inicio_em)>new Date():(['aguardando','em_atendimento','faltou'].includes(view)?s.agendamento_status==='confirmado'&&s.fluxo===view:s.agendamento_status===view&&s.fluxo!=='faltou'));
  const emptyTitles={agenda:'Nenhum horário neste dia',disponivel:'Nenhum horário livre neste dia',agendado:'Nenhum atendimento aguardando confirmação',confirmado:'Nenhum atendimento confirmado neste dia',cancelled:'Nenhum cancelamento neste dia',aguardando:'Nenhum paciente aguardando',em_atendimento:'Nenhum atendimento em andamento',faltou:'Nenhuma falta registrada'};
  if(!items.length){const box=node('div','','empty-agenda');box.append(node('h3',emptyTitles[view]),node('p',view==='agenda'?'Escolha outra data ou disponibilize horários para começar.':'Consulte outra data ou selecione Agenda completa para ver os demais horários.'));list.append(box);return;}
  for(const slot of items){
    const card=node('article','','agenda-card'),time=node('div','','agenda-time');time.append(node('strong',hour(slot.inicio_em)),node('small',slot.fim_em?'até '+hour(slot.fim_em):''));
    const info=node('div','','agenda-info');const state=view==='cancelled'?'cancelado':slot.agendamento_status||(slot.status==='disponivel'&&new Date(slot.inicio_em)<=new Date()?'encerrado':slot.status);
    info.append(node('span',labels[state]||state,'agenda-status '+state),node('strong',slot.profissional),node('small',slot.local||'Local não informado'));
    const patient=node('div','','agenda-info agenda-patient');
    if(slot.paciente){patient.append(node('strong',slot.paciente));if(slot.telefone){const tel=node('a',slot.telefone);tel.href='tel:'+slot.telefone.replace(/\D/g,'');patient.append(tel);}if(slot.email)patient.append(node('small',slot.email));patient.append(node('small',slot.origem==='manual'?'Agendamento da recepção':view!=='cancelled'?'Agendamento pelo site':''));}
    else patient.append(node('p',state==='disponivel'?'Disponível para agendar':state==='encerrado'?'Horário passado — não disponível para agendar':state==='bloqueado'?'Fora da agenda online':'Sem paciente informado'));
    if(view==='cancelled'&&slot.motivo_cancelamento)patient.append(node('p',slot.motivo_cancelamento));
    if(slot.agendamento_status==='confirmado'&&slot.fluxo&&slot.fluxo!=='previsto')patient.append(node('span',({aguardando:'Paciente chegou',em_atendimento:'Em atendimento',faltou:'Não compareceu'})[slot.fluxo],'agenda-status'));
    const actions=node('div','','agenda-actions'),future=new Date(slot.inicio_em)>new Date();
    if(slot.agendamento_status==='confirmado'&&slot.inicio_em.slice(0,10)===today()&&slot.fluxo!=='em_atendimento'){
      const change=async fluxo=>{try{await api('/api/team/queue/'+slot.agendamento_id,{fluxo});await loadAgenda();}catch(e){$('#agenda-message').textContent=e.message;}};
      if(!slot.fluxo||slot.fluxo==='previsto')actions.append(button('Paciente chegou',()=>change('aguardando'),true));
      if(slot.fluxo==='aguardando'||slot.fluxo==='faltou')actions.append(button('Corrigir presença',()=>change('previsto')));
      if(slot.fluxo!=='faltou'&&new Date(slot.fim_em)<=new Date())actions.append(button('Não compareceu',()=>{if(confirm('Registrar que o paciente não compareceu?'))change('faltou');}));
    }
    if(view!=='cancelled'){
      if(slot.status==='disponivel'&&future){actions.append(button('Agendar paciente',()=>openManual(slot),true),button('Bloquear',()=>openAction(slot,'bloqueado')));}
      if(slot.status==='bloqueado'&&future)actions.append(button('Reabrir horário',()=>openAction(slot,'disponivel')));
      if(slot.agendamento_status==='confirmado'&&slot.whatsapp){
        if(slot.whatsapp.url){const link=node('a','Enviar confirmação pelo WhatsApp','btn btn-light');link.href=slot.whatsapp.url;link.target='_blank';link.rel='noopener noreferrer';link.title='Abre a mensagem pronta. Clique em Enviar no WhatsApp para concluir.';actions.append(link);actions.append(node('small','Envio manual: conclua no WhatsApp.'));}
        else actions.append(node('small',slot.whatsapp.error));
      }
      if(slot.agendamento_status==='agendado')actions.append(button('Confirmar',()=>openAction(slot,'confirmado'),true));
      if(['agendado','confirmado'].includes(slot.agendamento_status)){if(!future)actions.append(button('Concluir',()=>openAction(slot,'concluido')));actions.append(button('Cancelar',()=>openAction(slot,'cancelado')));if(typeof openReschedule==='function')actions.append(button('Remarcar',()=>openReschedule(slot)));}
    }
    card.dataset.day=slot.inicio_em.slice(0,10);card.dataset.time=hour(slot.inicio_em);card.dataset.professional=slot.profissional;card.append(time,info,patient,actions);list.append(card);
  }
}
async function loadAgenda(silent=false){
  silent=silent===true;
  if(silent&&(document.hidden||document.querySelector('dialog[open]')||document.activeElement?.closest('form,button,a')||$('#workspace').hidden||$('#agenda-list').getAttribute('aria-busy')==='true'))return;
  if(!filters.reportValidity())return;
  if(!silent){slots=[];cancelled=[];}
  const current=++version;$('#agenda-list').setAttribute('aria-busy','true');if(!silent){$('#agenda-list').replaceChildren();$('#agenda-message').textContent='Carregando agenda…';}$('#agenda-retry').hidden=true;
  try{const data=await api('/api/team/agenda?'+new URLSearchParams(new FormData(filters)));if(current!==version)return;slots=data.slots;cancelled=data.cancelled;render();if(typeof renderWeek==='function')renderWeek();if($('#sync-status'))$('#sync-status').textContent='Atualizado às '+hour(new Date())+' · automático a cada 30 s';$('#agenda-message').textContent=data.truncated?'Há mais resultados. Filtre por profissional ou local para conferir todos.':'';}
  catch(error){if(current!==version)return;$('#agenda-message').textContent=error.message;$('#agenda-retry').hidden=false;}
  finally{if(current===version)$('#agenda-list').setAttribute('aria-busy','false');}
}
async function initialize(){
  $('#access-status').textContent='Verificando seu acesso…';$('#access-retry').hidden=true;
  try{const data=await api('/api/team/context');pairs=data.pairs;$('#greeting').textContent=`Olá, ${data.user.name}. ${professionalPortal?'Confira seus horários e os atendimentos confirmados pela equipe.':'Acompanhe os atendimentos da sua equipe.'}`;$('#admin-link').hidden=data.user.role!=='administrador';$('#logout').hidden=false;$('#password-open').hidden=false;
    const places=data.places||unique(pairs,'local_id','local');
    options(filters.elements.profissional,unique(pairs,'profissional_id','profissional'),'Todos os meus profissionais');options(filters.elements.local,places,'Todos os meus locais');
    if(places.length===1)filters.elements.local.value=String(places[0].id);
    options(publish.elements.profissional_id,unique(pairs.filter(p=>p.publicado),'profissional_id','profissional'),'Selecione o profissional');selectPublishPlaces();
    if(professionalPortal&&pairs.length){filters.elements.profissional.value=String(pairs[0].profissional_id);publish.elements.profissional_id.value=String(pairs[0].profissional_id);selectPublishPlaces();}
    const ready=pairs.some(p=>p.publicado);
    $('#workspace').hidden=false;$('#switch-account').hidden=true;$('#publish-open').hidden=!ready;
    $('#access-status').textContent=ready?'':places.length&&!pairs.length
      ?'Seu acesso está liberado. Os locais disponíveis ainda não têm profissionais vinculados. Para abrir horários, cadastre e vincule um profissional ao local.'
      :'Seu acesso está liberado. Para abrir horários, é necessário um profissional vinculado a um local, ambos publicados.';
    if(!ready){const help=node('a',data.user.role==='administrador'?' Cadastrar ou vincular profissionais →':'','text-link');if(data.user.role==='administrador'){help.href='admin.html';$('#access-status').append(help);}else $('#access-status').append(node('span',' Solicite essa configuração ao administrador da Avelu.'));}
    await loadAgenda();
  }catch(error){$('#access-status').textContent=error.message+(error.status===403?' Se você entrou como cliente, use outra conta com acesso de profissional, recepção ou administrador.':'');$('#access-retry').hidden=error.status===403;}
}
function preview(){
 const values=Object.fromEntries(new FormData(publish)),start=new Date(values.dia+'T'+values.inicio+':00-03:00'),end=new Date(values.dia+'T'+values.fim+':00-03:00'),duration=Number(values.duracao);
 const count=Math.floor((end-start)/(duration*60000)),remaining=(end-start)/60000-count*duration;
 $('#publish-preview').textContent=start<=new Date()?'Escolha um início após o horário atual. É permitido abrir horários para hoje.':count>0&&count<=96&&end-start<=43200000
 ?count+' horários de '+duration+' minutos serão publicados, até '+hour(new Date(+start+count*duration*60000))+'.'+(remaining?' Os '+remaining+' minutos restantes não formarão uma consulta.':'')
 :'O intervalo deve comportar ao menos uma consulta completa, com limite de 12 horas e 96 horários.';
}
publish.addEventListener('input',preview);publish.elements.profissional_id.addEventListener('change',selectPublishPlaces);
$('#publish-open').addEventListener('click',()=>{publish.reset();publish.elements.dia.value=filters.elements.dia.value;publish.elements.inicio.value='08:00';publish.elements.fim.value='12:00';publish.elements.profissional_id.value=filters.elements.profissional.value;if(publish.elements.profissional_id.options.length===2)publish.elements.profissional_id.selectedIndex=1;selectPublishPlaces();if([...publish.elements.local_id.options].some(o=>o.value===filters.elements.local.value)&&filters.elements.local.value)publish.elements.local_id.value=filters.elements.local.value;preview();$('#publish-message').textContent='';$('#publish-dialog').showModal();});
async function submit(form,message,work){
  const dialog=form.closest('dialog');dialog.dataset.busy='true';form.querySelectorAll('button').forEach(b=>b.disabled=true);$(message).textContent='';
  try{await work();dialog.close();await loadAgenda();}catch(error){$(message).textContent=error.message;}
  finally{dialog.dataset.busy='false';form.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
publish.addEventListener('submit',event=>{event.preventDefault();submit(publish,'#publish-message',async()=>{const b=Object.fromEntries(new FormData(publish));await api('/api/team/availability',{...b,inicio:b.dia+'T'+b.inicio,fim:b.dia+'T'+b.fim});filters.elements.dia.value=b.dia;filters.elements.profissional.value=b.profissional_id;filters.elements.local.value=b.local_id;view='agenda';});});
manual.addEventListener('submit',event=>{event.preventDefault();submit(manual,'#manual-message',()=>api('/api/team/appointments',{...Object.fromEntries(new FormData(manual)),slotId:selectedSlot.id,...(typeof waitingBookingId==='function'?waitingBookingId():{})}).then(data=>{if(typeof waitingPatient!=='undefined'&&waitingPatient){waitingPatient=null;$('#access-status').textContent='Agendamento salvo. Confira a confirmação com o paciente.';}return data;}));});
actionForm.addEventListener('submit',event=>{event.preventDefault();submit(actionForm,'#action-message',()=>{const {slot,type}=selectedAction;return ['bloqueado','disponivel'].includes(type)?api('/api/team/availability/'+slot.id+'/state',{status:type}):api('/api/team/appointments/'+slot.agendamento_id+'/state',{status:type,motivo:actionForm.elements.motivo.value,liberar:actionForm.elements.liberar.checked}).then(data=>{if(type==='confirmado')view='confirmado';return data;});});});
document.querySelectorAll('dialog').forEach(dialog=>{dialog.addEventListener('cancel',e=>{if(dialog.dataset.busy==='true')e.preventDefault();});dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());});
filters.addEventListener('submit',event=>{event.preventDefault();loadAgenda();});filters.addEventListener('change',loadAgenda);
function moveDay(delta){const d=new Date(filters.elements.dia.value+'T12:00:00Z');if(!Number.isFinite(+d))return;d.setUTCDate(d.getUTCDate()+delta);filters.elements.dia.value=d.toISOString().slice(0,10);loadAgenda();}
$('#previous-day').addEventListener('click',()=>moveDay(-1));$('#next-day').addEventListener('click',()=>moveDay(1));$('#today').addEventListener('click',()=>{filters.elements.dia.value=today();loadAgenda();});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;if($('#agenda-list').getAttribute('aria-busy')==='true')return;render();if(typeof renderWeek==='function')renderWeek();$('#agenda-title').focus({preventScroll:true});$('#agenda-title').scrollIntoView({block:'start',behavior:'instant'});}));$('#agenda-retry').addEventListener('click',loadAgenda);$('#access-retry').addEventListener('click',initialize);
if(typeof window!=='undefined'&&window.setInterval)window.setInterval(()=>loadAgenda(true),30000);
async function switchAccount(event){const button=event.currentTarget;button.disabled=true;try{await api('/api/auth/logout',{});$('#workspace').hidden=true;$('#agenda-list').replaceChildren();location.replace('entrar.html?next='+encodeURIComponent(portalPath));}catch(error){$('#access-status').textContent=error.message;button.disabled=false;}}
$('#logout').addEventListener('click',switchAccount);
$('#switch-account').addEventListener('click',switchAccount);
$('#password-open').addEventListener('click',()=>{$('#password-form').reset();$('#password-message').textContent='';$('#password-dialog').showModal();});
$('#password-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const b=form.querySelector('[type=submit]');b.disabled=true;try{await api('/api/team/password',Object.fromEntries(new FormData(form)));location.assign('entrar.html?next='+encodeURIComponent(portalPath));}catch(error){$('#password-message').textContent=error.message;}finally{b.disabled=false;}});
initialize();
