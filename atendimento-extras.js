
let rescheduleSlot=null,rescheduleVersion=0,waitingPatient=null,gridLayout=false;
function renderWeek(){
 const weekly=$('#agenda-period').value==='semana',grid=$('#week-grid'),list=$('#agenda-list');
 const asGrid=weekly||gridLayout;grid.hidden=!asGrid;list.hidden=asGrid;grid.replaceChildren();
 document.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.period===$('#agenda-period').value)));
 if(!asGrid)return;
 if(weekly)$('#agenda-title').textContent='7 dias a partir de '+dayLabel(filters.elements.dia.value);
 const cards=[...list.children].filter(c=>c.dataset.day);
 for(let n=0;n<(weekly?7:1);n++){
 const day=new Date(filters.elements.dia.value+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+n);const key=day.toISOString().slice(0,10),section=node('section','','week-day');
 section.append(node('h3',dayLabel(key)));
 const dayCards=cards.filter(c=>c.dataset.day===key);
 if(!dayCards.length){section.append(node('p','Nenhum resultado para este dia e filtro.','muted'));grid.append(section);continue;}
 const names=[...new Set(dayCards.map(c=>c.dataset.professional))],table=node('table','','week-table'),head=node('thead',''),row=node('tr','');
 row.append(node('th','Horário'));names.forEach(name=>row.append(node('th',name)));head.append(row);table.append(head);
 const body=node('tbody','');
 for(const time of [...new Set(dayCards.map(c=>c.dataset.time))].sort()){
 const tr=node('tr','');tr.append(node('th',time));
 for(const name of names){const td=node('td','');dayCards.filter(c=>c.dataset.time===time&&c.dataset.professional===name).forEach(c=>td.append(c));tr.append(td);}
 body.append(tr);
 }table.append(body);const wrap=node('div','','week-scroll');wrap.tabIndex=0;wrap.setAttribute('aria-label','Agenda de '+dayLabel(key));wrap.append(table);section.append(wrap);grid.append(section);
 }
}
$('#layout-toggle').addEventListener('click',()=>{gridLayout=!gridLayout;$('#layout-toggle').setAttribute('aria-pressed',String(gridLayout));$('#layout-toggle').textContent=gridLayout?'Ver lista compacta':'Ver grade por profissional';render();renderWeek();});
document.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',()=>{$('#agenda-period').value=b.dataset.period;loadAgenda();}));
async function openReschedule(slot){rescheduleSlot=slot;$('#reschedule-form').reset();$('#reschedule-day').value=filters.elements.dia.value;$('#reschedule-summary').textContent=(slot.paciente||'Paciente')+' · '+slotSummary(slot);$('#reschedule-message').textContent='';$('#reschedule-dialog').showModal();await searchReschedule();}
async function searchReschedule(){
 const version=++rescheduleVersion,select=$('#reschedule-slot');select.replaceChildren();$('#reschedule-message').textContent='Buscando horários livres…';
 try{const data=await api('/api/team/agenda?'+new URLSearchParams({dia:$('#reschedule-day').value,profissional:rescheduleSlot.profissional_id}));
 if(version!==rescheduleVersion)return;
 options(select,data.slots.filter(s=>s.status==='disponivel'&&new Date(s.inicio_em)>new Date()).map(s=>({id:s.id,name:hour(s.inicio_em)+' · '+s.local+' · '+money(s.valor)})),'Escolha um horário');
 $('#reschedule-message').textContent=select.options.length>1?'Avise o paciente sobre a nova data. Nenhuma mensagem será enviada automaticamente.':'Nenhum horário livre. Consulte outra data.';
 }catch(e){if(version===rescheduleVersion)$('#reschedule-message').textContent=e.message;}
}
$('#reschedule-search').addEventListener('click',searchReschedule);$('#reschedule-day').addEventListener('change',searchReschedule);
$('#reschedule-form').addEventListener('submit',async e=>{e.preventDefault();await submit($('#reschedule-form'),'#reschedule-message',async()=>{await api('/api/team/appointments/'+rescheduleSlot.agendamento_id+'/reschedule',{slotId:$('#reschedule-slot').value});filters.elements.dia.value=$('#reschedule-day').value;view='agendado';});});
function waitingPlaces(){options($('#waitlist-place'),unique(pairs.filter(p=>p.publicado&&String(p.profissional_id)===$('#waitlist-professional').value),'local_id','local'),'Selecione um local');}
$('#waitlist-professional').addEventListener('change',waitingPlaces);
$('#waitlist-open').addEventListener('click',()=>{options($('#waitlist-professional'),unique(pairs.filter(p=>p.publicado),'profissional_id','profissional'),'Selecione um profissional');$('#waitlist-professional').value=filters.elements.profissional.value;waitingPlaces();$('#waitlist-place').value=filters.elements.local.value;$('#waitlist-dialog').showModal();loadWaitlist();});
async function loadWaitlist(){
 try{const data=await api('/api/team/waitlist?'+new URLSearchParams({profissional:filters.elements.profissional.value,local:filters.elements.local.value})),list=$('#waitlist-items');list.replaceChildren();
 $('#waitlist-message').textContent=data.truncated?'Exibindo 200 registros. Refine os filtros da agenda.':data.items.length+' pessoas aguardando ou contatadas.';
 for(const item of data.items){const card=node('article','','waiting-card');card.append(node('h3',item.nome),node('p',item.profissional+' · '+item.local),node('p',item.preferencia||'Sem preferência informada','muted'),node('span',item.status==='contatado'?'Contato realizado':'Aguardando contato','agenda-status'));
 const phone=node('a',item.telefone);phone.href='tel:'+item.telefone;card.append(phone);
 const actions=node('div','','booking-actions');
 actions.append(button('Buscar vaga',()=>{waitingPatient=item;filters.elements.profissional.value=String(item.profissional_id);filters.elements.local.value=String(item.local_id);view='disponivel';$('#waitlist-dialog').close();$('#access-status').textContent='Buscando vaga para '+item.nome+'. Escolha uma data e clique em Agendar paciente. O cadastro da espera será preenchido.';loadAgenda();}));
 actions.append(button(item.status==='contatado'?'Voltar para aguardando':'Marcar contato',()=>updateWaitlist(item,item.status==='contatado'?'aguardando':'contatado')),button('Encerrar espera',()=>{if(confirm('Encerrar a espera de '+item.nome+'?'))updateWaitlist(item,'encerrado');}));
 card.append(actions);list.append(card);}
 }catch(e){$('#waitlist-message').textContent=e.message;}
}
async function updateWaitlist(item,status){try{await api('/api/team/waitlist/'+item.id+'/state',{status});await loadWaitlist();}catch(e){$('#waitlist-message').textContent=e.message;}}
$('#waitlist-form').addEventListener('submit',async e=>{e.preventDefault();$('#waitlist-save').disabled=true;try{await api('/api/team/waitlist',{profissional_id:$('#waitlist-professional').value,local_id:$('#waitlist-place').value,nome:$('#waitlist-name').value,telefone:$('#waitlist-phone').value,preferencia:$('#waitlist-preference').value});$('#waitlist-name').value='';$('#waitlist-phone').value='';$('#waitlist-preference').value='';await loadWaitlist();}catch(e){$('#waitlist-message').textContent=e.message;}finally{$('#waitlist-save').disabled=false;}});
function fillWaitingPatient(slot){if(waitingPatient&&String(slot.profissional_id)===String(waitingPatient.profissional_id)&&String(slot.local_id)===String(waitingPatient.local_id)){manual.elements.nome.value=waitingPatient.nome;manual.elements.telefone.value=waitingPatient.telefone;}}
function waitingBookingId(){return waitingPatient&&manual.elements.nome.value===waitingPatient.nome&&manual.elements.telefone.value.replace(/\D/g,'')===waitingPatient.telefone&&String(selectedSlot.profissional_id)===String(waitingPatient.profissional_id)&&String(selectedSlot.local_id)===String(waitingPatient.local_id)?{waitlistId:waitingPatient.id}:{};}
