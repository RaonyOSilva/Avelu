
const $=s=>document.querySelector(s),id=new URLSearchParams(location.search).get('id');
const node=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
let appointment,record,dirty=false,busy=false,locked=false;
const dateLabel=s=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'long',timeStyle:'short'}).format(new Date(s));
async function api(body){
 const r=await fetch('/api/consultations/'+encodeURIComponent(id),{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json().catch(()=>({}));
 if(r.status===401){location.assign('entrar.html?next='+encodeURIComponent('/consulta.html?id='+id));throw Error('Entre novamente para acessar este atendimento.');}
 if(!r.ok)throw Error(data.error||'Não foi possível carregar ou salvar o atendimento.');
 return data;
}
function controls(){
 ['#save','#finish','#print-all','#print-prescription','#finish-confirm','#finish-back'].forEach(s=>$(s).disabled=busy);
 $('#evolution').readOnly=$('#prescription').readOnly=locked||busy;
 $('#save').hidden=$('#finish').hidden=locked;
}
async function load(){
 $('#retry').hidden=true;
 try{
 if(!/^[1-9]\d{0,14}$/.test(id||''))throw Error('Escolha um atendimento na sua agenda.');
 const data=await api();appointment=data.appointment;record=data.record;
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
async function save(finalizar=false){
 if(busy)return false;if(locked)return true;
 busy=true;controls();$('#message').textContent='Salvando registro…';
 try{
 const data=await api({evolucao:$('#evolution').value,receita:$('#prescription').value,versao:record.versao,finalizar});
 record=data.record;appointment.status=data.status;dirty=false;locked=data.status==='concluido';
 $('#save-status').textContent='Todas as alterações foram salvas.';
 $('#message').textContent=locked?'Atendimento finalizado. Você pode imprimir os documentos.':'Rascunho salvo.';
 return true;
 }catch(e){$('#message').textContent=e.message;return false;}finally{busy=false;controls();}
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
$('#record-form').addEventListener('input',()=>{dirty=true;$('#save-status').textContent='Alterações ainda não salvas.';$('#print-document').replaceChildren();});
$('#record-form').addEventListener('submit',e=>{e.preventDefault();save();});
$('#finish').addEventListener('click',()=>{if(!$('#evolution').value.trim()){$('#message').textContent='Registre a evolução antes de finalizar.';$('#evolution').focus();return;}$('#finish-dialog').showModal();});
$('#finish-back').addEventListener('click',()=>$('#finish-dialog').close());
$('#finish-confirm').addEventListener('click',async()=>{await save(true);$('#finish-dialog').close();});
$('#finish-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('#print-all').addEventListener('click',()=>printRecord('all'));$('#print-prescription').addEventListener('click',()=>printRecord('prescription'));
$('#retry').addEventListener('click',load);
window.addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
load();
