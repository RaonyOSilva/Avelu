
const $=s=>document.querySelector(s);
const node=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const hour=s=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date(s));
const dayLabel=s=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'long'}).format(new Date(s+'T12:00:00-03:00'));
const login='entrar.html?next=%2Fprofissional.html';
let mode='day',allPage=1;
let slots=[],cancelled=[],view='confirmado',version=0,selected=null,ready=false;
$('#day').value=today();
async function api(url,body){
 const response=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>({}));
 if(response.status===401){location.replace(login);throw Error('Entre para acessar sua agenda.');}
 if(response.status===403){$('#workspace').hidden=true;ready=false;}
 if(!response.ok)throw Error(data.error||'Não foi possível concluir. Tente novamente.');
 return data;
}
function openAction(slot,status){
 selected={slot,status};$('#action-form').reset();$('#action-message').textContent='';
 $('#action-title').textContent=status==='concluido'?'Realizar atendimento':'Cancelar atendimento';
 $('#action-summary').textContent=slot.paciente+' · '+hour(slot.inicio_em)+' · '+slot.local;
 $('#action-help').textContent=status==='concluido'?'Confirme somente após realizar a consulta. O atendimento será marcado como realizado e contará no seu progresso.':'O horário ficará bloqueado para a equipe reorganizar a agenda. Avise o paciente sobre o cancelamento.';
 $('#reason-field').hidden=status!=='cancelado';$('#reason').required=status==='cancelado';
 $('#action-submit').textContent=status==='concluido'?'Marcar como realizado':'Confirmar cancelamento';$('#action-dialog').showModal();
}
function render(){
 const confirmed=slots.filter(s=>s.agendamento_status==='confirmado'),done=slots.filter(s=>s.agendamento_status==='concluido'),total=confirmed.length+done.length;
 $('#remaining').textContent=confirmed.length;$('#progress').max=total||1;$('#progress').value=done.length;
 $('#day-title').textContent=($('#day').value===today()?'Hoje · ':'')+dayLabel($('#day').value);
 $('#progress-label').textContent=done.length+' de '+total+' atendimentos realizados';
 $('#progress-note').textContent=!total?'Os atendimentos confirmados pela equipe aparecerão aqui.':!confirmed.length?'Jornada concluída. Todos os atendimentos desta seleção foram realizados.':'Acompanhe seu progresso, um paciente de cada vez.';
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
 const list=$('#patients');list.replaceChildren();
 let groupDate='',groupList=list;
 const items=view==='cancelled'?cancelled:view==='concluido'?done:confirmed;
 if(!items.length){const box=node('div','','empty-agenda');box.append(node('h3',view==='confirmado'?'Nenhum atendimento confirmado':view==='concluido'?'Nenhum atendimento realizado':'Nenhum atendimento cancelado'),node('p',mode==='all'?'Os atendimentos aparecerão aqui após a confirmação pela equipe.':'Para esta data e local. Você pode consultar outro dia no calendário.'));list.append(box);return;}
 items.forEach((slot,index)=>{
 if(mode==='all'&&groupDate!==slot.inicio_em.slice(0,10)){groupDate=slot.inicio_em.slice(0,10);const group=node('section','','scheduled-day');group.append(node('h3',(groupDate===today()?'Hoje · ':'')+dayLabel(groupDate)));groupList=node('div','','scheduled-cards');group.append(groupList);list.append(group);}
 const card=node('article','','patient-card'+(view==='confirmado'&&index===0?' next-patient':''));
 const top=node('div','','patient-top');top.append(node('strong',hour(slot.inicio_em)),node('span',view==='concluido'?'✓ Realizado':view==='cancelled'?'Cancelado':index===0?'Próximo da lista':'Confirmado pela equipe','patient-badge'));
 const identity=node('div','','patient-identity');const initials=(slot.paciente||'Paciente').split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join('');
 const avatar=node('span',initials,'patient-avatar');avatar.setAttribute('aria-hidden','true');identity.append(avatar,node('h3',slot.paciente||'Paciente'));
 card.append(top,identity,node('p',slot.local||'Local não informado','muted'));
 if(slot.fim_em)card.append(node('small','Até '+hour(slot.fim_em)));
 if(view==='cancelled'&&slot.motivo_cancelamento)card.append(node('p',slot.motivo_cancelamento));
 if(view==='confirmado'){
 const actions=node('div','','patient-actions'),perform=node('button','Realizar atendimento','btn btn-primary'),cancel=node('button','Cancelar atendimento','btn btn-light cancel-button');
 perform.type=cancel.type='button';perform.disabled=slot.inicio_em.slice(0,10)!==today();
 perform.addEventListener('click',()=>location.assign('consulta.html?id='+slot.agendamento_id));cancel.addEventListener('click',()=>openAction(slot,'cancelado'));actions.append(perform,cancel);card.append(actions);
 if(perform.disabled)card.append(node('small','Disponível para realizar em qualquer horário na data agendada.'));
 }
 if(view==='concluido'){const link=node('a','Ver registro e imprimir','btn btn-light');link.href='consulta.html?id='+slot.agendamento_id;card.append(link);}
 groupList.append(card);
 });
}
async function load(silent=false){
 silent=silent===true;
 if(silent&&(document.hidden||!ready||document.querySelector('dialog[open]')||document.activeElement?.closest('form,button,a')||$('#patients').getAttribute('aria-busy')==='true'))return;
 if(!$('#filters').reportValidity())return;
 const current=++version;if(!silent)$('#patients').replaceChildren();$('#patients').setAttribute('aria-busy','true');if(!silent)$('#message').textContent='Buscando seus atendimentos…';$('#retry').hidden=true;
 try{const data=await api(mode==='all'?'/api/professional/scheduled?'+new URLSearchParams({local:$('#place').value,page:allPage}):'/api/professional/agenda?'+new URLSearchParams({dia:$('#day').value,local:$('#place').value}));if(current!==version)return;slots=data.slots;cancelled=data.cancelled||[];render();if(mode==='all'){const summary=$('#all-summary');summary.replaceChildren();for(const [value,label] of [[data.summary.total,'atendimentos confirmados'],[data.summary.days,'dias com pacientes'],[data.summary.places,'locais de atendimento']]){const box=node('div');box.append(node('strong',value),node('span',label));summary.append(box);}$('#all-previous').disabled=allPage===1;$('#all-next').disabled=!data.hasMore;$('#all-page').textContent='Página '+allPage+' · por data e horário';}if($('#sync-status'))$('#sync-status').textContent='Atualizado às '+hour(new Date())+' · atualização automática a cada 30 s';$('#message').textContent=data.truncated?'Há mais resultados. Selecione um local para refinar a consulta.':'';}
 catch(e){if(current!==version)return;$('#message').textContent=e.message;$('#retry').hidden=false;}
 finally{if(current===version)$('#patients').setAttribute('aria-busy','false');}
}
async function initialize(){
 try{const data=await api('/api/professional/context');ready=true;$('#greeting').textContent='Olá, '+data.user.name+'. Vamos cuidar dos seus pacientes?';
 $('#place').replaceChildren(node('option','Todos os meus locais'));$('#place').children[0].value='';
 for(const place of data.places){const option=node('option',place.name);option.value=place.id;$('#place').append(option);}
 $('#workspace').hidden=false;$('#password-open').hidden=false;await load();
 }catch(e){$('#message').textContent=e.message;$('#retry').hidden=false;}
}
$('#filters').addEventListener('submit',e=>{e.preventDefault();load();});$('#filters').addEventListener('change',()=>{allPage=1;load();});
function move(delta){const date=new Date($('#day').value+'T12:00:00Z');if(!Number.isFinite(+date))return;date.setUTCDate(date.getUTCDate()+delta);$('#day').value=date.toISOString().slice(0,10);load();}
$('#previous').addEventListener('click',()=>move(-1));$('#next').addEventListener('click',()=>move(1));$('#today').addEventListener('click',()=>{$('#day').value=today();load();});
$('#retry').addEventListener('click',()=>ready?load():initialize());
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;if($('#patients').getAttribute('aria-busy')!=='true')render();}));
$('#action-form').addEventListener('submit',async e=>{
 e.preventDefault();const button=$('#action-submit'),dialog=$('#action-dialog');button.disabled=true;dialog.dataset.busy='true';$('#action-message').textContent='';
 try{await api('/api/professional/appointments/'+selected.slot.agendamento_id+'/state',{status:selected.status,motivo:$('#reason').value,liberar:false});dialog.close();await load();}
 catch(error){$('#action-message').textContent=error.message;}finally{button.disabled=false;dialog.dataset.busy='false';}
});
$('#logout').addEventListener('click',async()=>{try{await api('/api/auth/logout',{});location.replace(login);}catch(e){$('#message').textContent=e.message;}});
$('#password-open').addEventListener('click',()=>{$('#password-form').reset();$('#password-message').textContent='';$('#password-dialog').showModal();});
$('#password-form').addEventListener('submit',async e=>{e.preventDefault();const b=e.currentTarget.querySelector('[type=submit]');b.disabled=true;try{await api('/api/professional/password',Object.fromEntries(new FormData(e.currentTarget)));location.replace(login);}catch(error){$('#password-message').textContent=error.message;}finally{b.disabled=false;}});
document.querySelectorAll('dialog').forEach(d=>{d.addEventListener('cancel',e=>{if(d.dataset.busy==='true')e.preventDefault();});d.querySelector('[data-close]').addEventListener('click',()=>{if(d.dataset.busy!=='true')d.close();});});
if(typeof window!=='undefined'&&window.setInterval)window.setInterval(()=>load(true),30000);
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{
 mode=b.dataset.mode;view='confirmado';allPage=1;
 document.querySelectorAll('[data-mode]').forEach(t=>t.setAttribute('aria-pressed',String(t.dataset.mode===mode)));
 $('#filters').className=mode==='all'?'all-filters':'';$('#day').parentElement.hidden=mode==='all';$('.day-navigation').hidden=mode==='all';$('.journey').hidden=mode==='all';$('.agenda-heading .view-tabs').hidden=mode==='all';
 $('#all-summary').hidden=mode!=='all';$('#all-pagination').hidden=mode!=='all';$('#patients').className=mode==='all'?'all-scheduled':'';
 load();
}));
$('#all-previous').addEventListener('click',()=>{if(allPage>1){allPage--;load();}});
$('#all-next').addEventListener('click',()=>{allPage++;load();});
initialize();
