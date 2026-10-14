
(()=>{let templates=[];
const select=$('#template-select');
async function templatesApi(path='',body,method){const r=await fetch('/api/templates'+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error||'Não foi possível carregar os modelos.');return data;}
async function loadTemplates(){try{templates=await templatesApi();select.replaceChildren(node('option','Selecione um modelo'));select.children[0].value='';for(const t of templates){const o=node('option',(t.tipo==='receita'?'Receita':'Evolução')+' · '+t.titulo);o.value=t.id;select.append(o);}}catch(e){$('#template-message').textContent=e.message;}}
$('#template-apply').addEventListener('click',()=>{if(locked||busy){$('#template-message').textContent='O registro está somente para leitura ou sendo salvo.';return;}const t=templates.find(t=>String(t.id)===select.value);if(!t)return;const input=$(t.tipo==='receita'?'#prescription':'#evolution');const text=(input.value?input.value+'\n\n':'')+t.conteudo;if(text.length>30000){$('#template-message').textContent='O campo excederia 30 mil caracteres.';return;}input.value=text;changed();input.focus();$('#template-message').textContent='Modelo inserido. Revise o texto para este paciente.';});
$('#template-new').addEventListener('click',()=>{$('#template-form').reset();$('#template-error').textContent='';$('#template-dialog').showModal();});
$('#template-close').addEventListener('click',()=>$('#template-dialog').close());
$('#template-form').addEventListener('submit',async e=>{e.preventDefault();$('#template-save').disabled=true;try{await templatesApi('',{titulo:$('#template-name').value,tipo:$('#template-type').value,conteudo:$('#template-text').value});$('#template-dialog').close();await loadTemplates();}catch(e){$('#template-error').textContent=e.message;}finally{$('#template-save').disabled=false;}});
$('#template-delete').addEventListener('click',async()=>{if(!select.value||!confirm('Excluir este modelo pessoal?'))return;try{await templatesApi('/'+select.value,null,'DELETE');await loadTemplates();}catch(e){$('#template-message').textContent=e.message;}});
loadTemplates();
})();
