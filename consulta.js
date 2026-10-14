
const $=s=>document.querySelector(s),id=new URLSearchParams(location.search).get('id');
const node=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
let appointment,record,dirty=false,busy=false,locked=false,autoSaving=false,autoTimer=null,saveConflict=false;
const dateLabel=s=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'long',timeStyle:'short'}).format(new Date(s));
async function api(body){
 const r=await fetch('/api/consultations/'+encodeURIComponent(id),{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json().catch(()=>({}));
 if(r.status===401){if(!body&&!dirty)location.assign('entrar.html?next='+encodeURIComponent('/consulta.html?id='+id));throw Object.assign(Error(body?'Sua sessão expirou. Entre novamente em outra aba e volte para salvar. Suas anotações permanecem nesta tela.':'Entre novamente para acessar este atendimento.'),{status:401});}
 if(!r.ok)throw Object.assign(Error(data.error||'Não foi possível carregar ou salvar o atendimento.'),{status:r.status});
 return data;
}
function controls(){
 ['#save','#finish','#print-all','#print-prescription','#finish-confirm','#finish-back'].forEach(s=>$(s).disabled=busy);
 $('#evolution').readOnly=$('#prescription').readOnly=locked||(busy&&!autoSaving);
 $('#save').hidden=$('#finish').hidden=locked;
}
async function load(){
 $('#retry').hidden=true;
 try{
 if(!/^[1-9]\d{0,14}$/.test(id||''))throw Error('Escolha um atendimento na sua agenda.');
 if(dirty){$('#message').textContent='Há anotações não salvas. Salve antes de recarregar.';return;}
 const data=await api();appointment=data.appointment;record=data.record;renderHistory(data.history||[]);
 locked=appointment.status==='concluido'||!!record.finalizado_em;
 $('#patient-name').textContent=appointment.paciente||'Paciente';
 $('#appointment-context').textContent=dateLabel(appointment.inicio_em)+' · '+(appointment.local||'Local não informado');
 const details=$('#patient-details');details.replaceChildren();
 for(const [label,value] of [['Telefone',appointment.telefone],['E-mail',appointment.email],['Motivo do agendamento',appointment.motivo],['Endereço do atendimento',appointment.endereco]]){const div=node('div','');div.append(node('dt',label),node('dd',value||'Não informado'));details.append(div);}
 $('#evolution').value=record.evolucao;$('#prescription').value=record.receita;dirty=false;
 $('#workspace').hidden=false;$('#message').textContent=locked?'Atendimento finalizado. Registro disponível para consulta e impressão.':'';
 $('#save-status').textContent=record.versao?'Registro salvo.':'Nenhuma anotação salva ainda.';controls();
 }catch(e){$('#message').textContent=e.message;$('#retry').hidden=false;}
}
async function save(finalizar=false,automatic=false){
 if(busy)return false;if(locked)return true;
 let savedOk=false;clearTimeout(autoTimer);autoSaving=automatic;
 const snapshot={evolucao:$('#evolution').value,receita:$('#prescription').value};
 busy=true;controls();$('#save-status').textContent='Salvando…';if(!automatic)$('#message').textContent='Salvando registro…';
 try{
 const data=await api({...snapshot,versao:record.versao,finalizar});
 savedOk=true;record=data.record;appointment.status=data.status;dirty=$('#evolution').value!==snapshot.evolucao||$('#prescription').value!==snapshot.receita;saveConflict=false;locked=data.status==='concluido';
 $('#save-status').textContent=dirty?'Há alterações novas para salvar.':'Salvo às '+new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());
 $('#message').textContent=locked?'Atendimento finalizado. Você pode imprimir os documentos.':'Rascunho salvo.';
 return true;
 }catch(e){saveConflict=[401,403,409].includes(e.status);$('#message').textContent=e.message;$('#save-status').textContent='Não foi possível salvar. Seu texto permanece nesta tela.';return false;}finally{busy=false;autoSaving=false;controls();if(dirty&&!saveConflict&&!locked&&automatic)scheduleAutosave(savedOk?1800:15000);}
}
function printPage(title,text){
 const section=node('section','','print-page');section.append(node('h1',title));
 const identity=node('div','','print-identity');
 identity.append(node('p','Paciente: '+(appointment.paciente||'Não informado')),node('p','Atendimento: '+dateLabel(appointment.inicio_em)),node('p','Local: '+(appointment.local||'Não informado')+'\n'+(appointment.endereco||'')),node('p','Profissional: '+appointment.profissional+' · '+appointment.titulo_profissional+'\nRegistro: '+(appointment.numero_registro||'Não informado')));
 section.append(identity);
 if(!record.finalizado_em)section.append(node('p','RASCUNHO — atendimento não finalizado'));
 section.append(node('h2',title==='Receita'?'Prescrição':'Evolução'),node('p',text||'Não registrado.'));
 section.append(node('p',appointment.profissional+'\nRegistro: '+(appointment.numero_registro||'Não informado')+'\nAssinatura do profissional','print-signature'));return section;
}
async function printRecord(mode){
 if(busy||!appointment)return;
 if(mode==='prescription'&&!$('#prescription').value.trim()){$('#message').textContent='Preencha a receita antes de imprimir.';return;}
 if(!locked&&!await save())return;
 const document=$('#print-document');document.replaceChildren();
 if(mode==='all'){
 const page=printPage('Registro do atendimento',record.evolucao);
 page.insertBefore(node('p','Motivo do agendamento: '+(appointment.motivo||'Não informado')+'\nTelefone: '+(appointment.telefone||'Não informado')+' · E-mail: '+(appointment.email||'Não informado')),page.children[2]);
 document.append(page);
 }
 if(mode==='prescription'||record.receita.trim())document.append(printPage('Receita',record.receita));
 window.print();
}
function scheduleAutosave(delay=1800){clearTimeout(autoTimer);if(dirty&&!locked&&!saveConflict)autoTimer=setTimeout(()=>{if(busy)scheduleAutosave();else save(false,true);},delay);}
function changed(){dirty=true;$('#save-status').textContent='Alterações ainda não salvas.';$('#print-document').replaceChildren();scheduleAutosave();}
$('#record-form').addEventListener('input',changed);
$('#record-form').addEventListener('submit',e=>{e.preventDefault();save();});
$('#finish').addEventListener('click',()=>{if(!$('#evolution').value.trim()){$('#message').textContent='Registre a evolução antes de finalizar.';$('#evolution').focus();return;}$('#finish-dialog').showModal();});
$('#finish-back').addEventListener('click',()=>$('#finish-dialog').close());
$('#finish-confirm').addEventListener('click',async()=>{await save(true);$('#finish-dialog').close();});
$('#finish-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('#print-all').addEventListener('click',()=>printRecord('all'));$('#print-prescription').addEventListener('click',()=>printRecord('prescription'));
$('#retry').addEventListener('click',load);
window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
load();

function renderHistory(history){
 const list=$('#history-list');list.replaceChildren();
 if(!history.length){list.append(node('p',appointment.paciente_id?'Nenhum registro anterior finalizado por você para este paciente.':'Este agendamento manual não está vinculado a uma conta de paciente. O histórico não é associado por nome ou telefone.'));return;}
 for(const entry of history){const details=node('details','','history-entry');details.append(node('summary',dateLabel(entry.inicio_em)+' · '+(entry.local_nome||'')),node('h3','Evolução'),node('p',entry.evolucao,'clinical-text'),node('h3','Receita'),node('p',entry.receita||'Não registrada.','clinical-text'));list.append(details);}
}
