
const $=s=>document.querySelector(s),node=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const displayDate=s=>s.split('-').reverse().join('/');
let pairs=[],holidays=[],calendarSignature='',previewData=null,previewConfig=null,withdrawing=null,busy=false;
const signature=()=>[$('#professional').value,$('#place').value,$('#start').value,$('#end').value].join('|');
async function api(url,body){
 const r=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(90000),...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json().catch(()=>({}));
 if(r.status===401)location.assign('entrar.html?next=%2Fprogramacao.html');
 if(!r.ok)throw Error(data.error||'Não foi possível concluir. Tente novamente.');
 return data;
}
function invalidate(){previewData=null;previewConfig=null;$('#preview-section').hidden=true;}
function setBusy(value){busy=value;document.querySelectorAll('#schedule-form input,#schedule-form select,#schedule-form button,#publish').forEach(e=>e.disabled=value);}
function option(select,text,value){const o=node('option',text);o.value=value;select.append(o);}
function choosePlaces(){const previous=$('#place').value;$('#place').replaceChildren();option($('#place'),'Selecione o local','');for(const p of pairs.filter(p=>p.publicado&&String(p.profissional_id)===$('#professional').value))option($('#place'),p.local,p.local_id);if([...$('#place').options].some(o=>o.value===previous))$('#place').value=previous;resetCalendar();}
function resetCalendar(){holidays=[];calendarSignature='';$('#holidays').replaceChildren();$('#calendar-reviewed').checked=false;$('#calendar-message').textContent='Carregue o calendário após selecionar o local e período.';invalidate();}
let rowId=0;
function field(row,label,type,value,kind){const wrapper=node('div','','field'),id='planning-'+(++rowId),input=node('input','');input.type=type;input.id=id;input.value=value;input.dataset.kind=kind;input.required=true;if(type==='text')input.maxLength=120;const title=node('label',label);title.htmlFor=id;wrapper.append(title,input);row.append(wrapper);return input;}
function removeButton(row){const b=node('button','Remover','text-button');b.type='button';b.addEventListener('click',()=>{row.remove();invalidate();});row.append(b);}
function addShift(start='08:00',end='12:00'){
 if($('#shifts').children.length>=4)return;
 const row=node('div','','shift-row');field(row,'Das','time',start,'start');field(row,'Até','time',end,'end');removeButton(row);$('#shifts').append(row);invalidate();
}
function addException(){if($('#exceptions').children.length>=100)return;const row=node('div','','exception-row');field(row,'De','date',$('#start').value,'start');field(row,'Até','date',$('#start').value,'end');field(row,'Motivo','text','Férias ou recesso','reason');removeButton(row);$('#exceptions').append(row);invalidate();}
function renderHolidays(){
 const list=$('#holidays');list.replaceChildren();
 holidays.forEach((h,i)=>{const row=node('div','','holiday-row'),label=node('label',''),input=node('input','');input.type='checkbox';input.checked=h.excluir;input.addEventListener('change',()=>{h.excluir=input.checked;$('#calendar-reviewed').checked=false;invalidate();});label.append(input,node('span',displayDate(h.data)+' · '+h.nome+' ('+h.tipo+')'));row.append(label);
 if(h.fonte){const a=node('a','Fonte oficial');a.href=h.fonte;a.target='_blank';a.rel='noopener noreferrer';row.append(a);}
 if(h.custom){const b=node('button','Remover','text-button');b.type='button';b.addEventListener('click',()=>{holidays.splice(i,1);$('#calendar-reviewed').checked=false;renderHolidays();invalidate();});row.append(b);}list.append(row);});
}
async function loadCalendar(){
 const expected=signature();$('#load-calendar').disabled=true;
 try{
 if(!$('#professional').value||!$('#place').value||!$('#start').value||!$('#end').value)throw Error('Selecione profissional, local e período.');
 const data=await api('/api/team/schedules/calendar?'+new URLSearchParams({profissional:$('#professional').value,local:$('#place').value,inicio:$('#start').value,fim:$('#end').value}));
 if(expected!==signature())return;
 holidays=data.entries;calendarSignature=expected;renderHolidays();$('#calendar-reviewed').checked=false;$('#calendar-message').textContent=data.cidade+'/'+data.estado+'. '+data.warnings.join(' ');invalidate();
 }catch(e){$('#calendar-message').textContent=e.message;}finally{$('#load-calendar').disabled=false;}
}
function config(){
 if(calendarSignature!==signature())throw Error('Carregue e revise o calendário para o local e período atuais.');
 return{profissional_id:$('#professional').value,local_id:$('#place').value,inicio:$('#start').value,fim:$('#end').value,dias:[...document.querySelectorAll('[name=weekday]:checked')].map(e=>Number(e.value)),turnos:[...$('#shifts').children].map(row=>({inicio:row.querySelector('[data-kind=start]').value,fim:row.querySelector('[data-kind=end]').value})),duracao:Number($('#duration').value),valor:$('#price').value,modo:$('#mode').value,janela:Number($('#window').value),calendario_revisado:$('#calendar-reviewed').checked,feriados:holidays.map(({data,nome,tipo,excluir})=>({data,nome,tipo,excluir})),excecoes:[...$('#exceptions').children].map(row=>({inicio:row.querySelector('[data-kind=start]').value,fim:row.querySelector('[data-kind=end]').value,motivo:row.querySelector('[data-kind=reason]').value}))};
}
function showPreview(data){
 $('#preview-place').textContent=data.place.nome+' · '+data.place.cidade+'/'+data.place.estado+' · Liberar até '+displayDate(data.end);
 const totals=$('#preview-totals');totals.replaceChildren();
 for(const [value,label]of [[data.created,'novos horários agora'],[data.conflictCount,'conflitos ignorados'],[data.excluded,'dias excluídos'],[data.deferred,'horários para liberar depois']]){const box=node('div','','preview-total');box.append(node('strong',String(value)),node('span',label));totals.append(box);}
 const days=$('#preview-days');days.replaceChildren();
 for(const d of data.days){const row=node('tr','');[displayDate(d.data),d.criar,d.conflitos,d.passados,d.motivo||'—'].forEach(value=>row.append(node('td',String(value))));days.append(row);}
 const conflicts=$('#preview-conflicts');conflicts.replaceChildren();
 if(!data.conflicts.length)conflicts.append(node('p','Nenhum conflito encontrado.'));
 for(const c of data.conflicts)conflicts.append(node('p',displayDate(c.inicio.slice(0,10))+' · '+c.inicio.slice(11,16)+'–'+c.fim.slice(11,16)+' · '+c.local+' · '+c.status));
 if(data.conflictCount>200)conflicts.append(node('p','Exibindo os primeiros 200 conflitos. A contagem e a prévia de datas incluem todos.'));
 $('#preview-section').hidden=false;$('#preview-section').focus();$('#preview-section').scrollIntoView({block:'start',behavior:'instant'});
}
$('#schedule-form').addEventListener('input',invalidate);
$('#schedule-form').addEventListener('change',invalidate);
$('#professional').addEventListener('change',choosePlaces);
['#place','#start','#end'].forEach(s=>$(s).addEventListener('change',resetCalendar));
$('#load-calendar').addEventListener('click',loadCalendar);
$('#next-year').addEventListener('click',()=>{const year=Number(today().slice(0,4))+1;$('#start').value=year+'-01-01';$('#end').value=year+'-12-31';resetCalendar();});
$('#add-shift').addEventListener('click',()=>addShift('14:00','18:00'));
$('#add-exception').addEventListener('click',addException);
$('#add-holiday').addEventListener('click',()=>{
 const date=$('#holiday-date').value,name=$('#holiday-name').value.trim();
 if(!date||!name||date<$('#start').value||date>$('#end').value||calendarSignature!==signature()){$('#calendar-message').textContent='Carregue o calendário e informe uma data dentro do período e o nome.';return;}
 holidays.push({data:date,nome:name,tipo:$('#holiday-type').value,excluir:true,custom:true});holidays.sort((a,b)=>a.data.localeCompare(b.data));$('#calendar-reviewed').checked=false;renderHolidays();invalidate();$('#holiday-name').value='';
});
$('#mode').addEventListener('change',()=>{const rolling=$('#mode').value==='movel';$('#window-field').hidden=!rolling;$('#window-note').textContent=rolling?'A agenda avança automaticamente até o fim do período. O servidor precisa estar funcionando; retomadas recuperam a janela atual.':'Todos os horários válidos do período serão publicados após a confirmação.';});
$('#schedule-form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;
 try{const c=config();setBusy(true);$('#message').textContent='Calculando dias, exceções e conflitos…';const data=await api('/api/team/schedules/preview',c);previewConfig=c;previewData=data;showPreview(data);$('#message').textContent='Confira a prévia. Nenhum horário foi publicado ainda.';}
 catch(e){invalidate();$('#message').textContent=e.message;}finally{setBusy(false);}
});
$('#publish').addEventListener('click',async()=>{
 if(busy||!previewData)return;
 setBusy(true);
 try{const data=await api('/api/team/schedules',{config:previewConfig,key:previewData.key});invalidate();$('#message').textContent=data.alreadyPublished?'Esta programação já havia sido publicada. Nenhuma duplicação foi feita.':data.created+' horários publicados. '+data.conflictCount+' conflitos ignorados. Os horários estão disponíveis no site.';await loadSchedules();}
 catch(e){$('#message').textContent=e.message;invalidate();}finally{setBusy(false);}
});
function action(text,fn){const b=node('button',text,'btn btn-light');b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(e){$('#list-message').textContent=e.message;}finally{b.disabled=false;}});return b;}
async function loadSchedules(){
 try{const data=await api('/api/team/schedules'),list=$('#schedules');list.replaceChildren();$('#list-message').textContent=data.truncated?'Exibindo as 100 programações mais recentes.':data.items.length?'':'Nenhuma programação cadastrada.';
 for(const rule of data.items){const c=rule.configuracao,card=node('article','','rule-card');card.append(node('h3',rule.profissional+' · '+rule.local),node('span',{ativa:'Janela móvel ativa',pausada:'Pausada',concluida:'Liberação concluída'}[rule.status],'status-tag'),node('p',displayDate(c.inicio)+' até '+displayDate(c.fim)+' · '+(c.modo==='movel'?'Janela de '+c.janela+' dias':'Publicação integral')),node('p','Última verificação: '+(rule.ultima_execucao||'Ainda não executada'),'muted'));
 if(rule.ultimo_erro)card.append(node('p',rule.ultimo_erro,'rule-error'));
 const details=node('details','');details.append(node('summary','Ver configuração'),node('p','Dias: '+c.dias.map(n=>['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][n]).join(', ')+' · Turnos: '+c.turnos.map(t=>t.inicio+'–'+t.fim).join(', ')+' · '+c.duracao+' minutos'),node('p',c.excecoes.length+' exceções e '+c.feriados.filter(h=>h.excluir).length+' datas excluídas no calendário.'));card.append(details);
 const actions=node('div','','rule-actions');
 if(rule.status==='ativa'||rule.status==='pausada'&&c.modo==='movel'&&c.fim>=today())actions.append(action(rule.status==='ativa'?'Pausar novas liberações':'Retomar janela móvel',async()=>{await api('/api/team/schedules/'+rule.id+'/state',{status:rule.status==='ativa'?'pausada':'ativa'});await loadSchedules();}));
 actions.append(action('Retirar horários livres',()=>{withdrawing=rule;$('#withdraw-summary').textContent=rule.profissional+' · '+rule.local;$('#withdraw-start').value=c.inicio>today()?c.inicio:today();$('#withdraw-end').value=c.fim;$('#withdraw-message').textContent='';$('#withdraw-dialog').showModal();}));card.append(actions);list.append(card);}
 }catch(e){$('#list-message').textContent=e.message;}
}
$('#refresh').addEventListener('click',loadSchedules);
$('#withdraw-close').addEventListener('click',()=>$('#withdraw-dialog').close());
$('#withdraw-form').addEventListener('submit',async e=>{e.preventDefault();$('#withdraw-submit').disabled=true;$('#withdraw-close').disabled=true;try{const data=await api('/api/team/schedules/'+withdrawing.id+'/withdraw',{inicio:$('#withdraw-start').value,fim:$('#withdraw-end').value});$('#withdraw-dialog').close();$('#message').textContent=data.removed+' horários livres retirados. '+data.preserved+' consultas reservadas preservadas.';await loadSchedules();}catch(e){$('#withdraw-message').textContent=e.message;}finally{$('#withdraw-submit').disabled=false;$('#withdraw-close').disabled=false;}});
$('#withdraw-dialog').addEventListener('cancel',e=>{if($('#withdraw-submit').disabled)e.preventDefault();});
async function initialize(){
 $('#start').value=today();$('#end').value=today().slice(0,4)+'-12-31';addShift();addShift('14:00','18:00');
 try{const data=await api('/api/team/context');pairs=data.pairs.filter(p=>p.publicado);option($('#professional'),'Selecione o profissional','');for(const p of [...new Map(pairs.map(p=>[p.profissional_id,p])).values()])option($('#professional'),p.profissional,p.profissional_id);choosePlaces();$('#workspace').hidden=false;$('#message').textContent=pairs.length?'':'Cadastre, publique e vincule um profissional e um local antes de programar.';await loadSchedules();}catch(e){$('#message').textContent=e.message;}
}
initialize();
