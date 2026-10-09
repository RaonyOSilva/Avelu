const types = { clinica: 'Clínica', consultorio: 'Consultório', hospital: 'Hospital', laboratorio: 'Laboratório', centro_medico: 'Centro médico', outro: 'Outro' };
const state = { professionals: [], places: [], specialties: [] };
const mainMessage = document.querySelector('#admin-message');
function element(tag, value, className) { const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node; }
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) location.assign('/entrar.html?next=%2Fadmin.html');
    throw new Error(data.error || 'Não foi possível concluir a operação.');
  }
  return data;
}
function switchTab(tab) {
  document.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tab === tab)));
  document.querySelector('#professionals-panel').hidden = tab !== 'professionals';
  document.querySelector('#places-panel').hidden = tab !== 'places';
  document.querySelector('#professional-editor').hidden = true;
  document.querySelector('#place-editor').hidden = true;
}
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
function renderRecords(kind) {
  const singular = kind === 'professionals' ? 'professional' : 'place';
  const query = document.querySelector(`#${singular}-search`).value.toLocaleLowerCase('pt-BR');
  const list = document.querySelector(`#${singular}-list`); list.replaceChildren();
  const records = state[kind].filter(record => [record.nome, record.titulo, record.email, record.cidade, types[record.tipo], ...(record.atendimentos||[]).flatMap(item=>[item.nome,...item.areas.map(area=>area.nome)])].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(query));
  if (!records.length) list.append(element('p', query ? 'Nenhum cadastro encontrado.' : 'Ainda não há cadastros. Use o botão acima para começar.', 'empty'));
  for (const record of records) {
    const card = element('article', '', 'record');
    const details = document.createElement('div');
    details.append(element('h3', record.nome), element('p', kind === 'professionals' ? record.titulo : `${types[record.tipo]} · ${record.cidade}/${record.estado}`, 'muted'));
    if (kind === 'professionals') {
      const names = record.locais.map(id => state.places.find(place => String(place.id) === String(id))?.nome).filter(Boolean);
      details.append(element('p', names.length ? names.join(' · ') : 'Nenhum local vinculado', 'muted'));
    } else {
      const count = state.professionals.filter(professional => professional.locais.some(id => String(id) === String(record.id))).length;
      details.append(element('p', `${count} profissional(is) vinculado(s)`, 'muted'));
    }
    details.append(element('span', record.demonstracao ? 'Demonstração · oculto na busca' : record.ativo ? 'Publicado' : 'Rascunho', `status-pill${record.ativo ? '' : ' draft'}`));
    if(record.atendimentos?.length) details.append(element('p', record.atendimentos.map(item=>item.nome+(item.areas.length?`: ${item.areas.map(area=>area.nome).join(', ')}`:'')).join(' · '), 'muted'));
    const edit = element('button', 'Editar', 'btn btn-light'); edit.type = 'button'; edit.setAttribute('aria-label', `Editar ${record.nome}`); edit.addEventListener('click', () => openEditor(singular, record));
    card.append(details, edit); list.append(card);
  }
}
async function refresh() {
  const [professionals, places, specialties] = await Promise.all([api('/api/admin/professionals'), api('/api/admin/places'), api('/api/specialties')]);
  Object.assign(state, { professionals, places, specialties });
  updateCatalogParents();
  document.querySelector('#professional-count').textContent = professionals.length;
  document.querySelector('#place-count').textContent = places.length;
  renderRecords('professionals'); renderRecords('places');
}
function choices(target, records, name, selected) {
  const container = document.querySelector(target); container.replaceChildren();
  if (!records.length) container.append(element('p', 'Nenhum cadastro disponível.', 'muted'));
  for (const record of records) {
    const label = element('label', '', 'check-line');
    const input = document.createElement('input'); input.type = 'checkbox'; input.name = name; input.value = record.id; input.checked = selected.map(String).includes(String(record.id));
    label.append(input, element('span', record.nome + (record.cidade ? ` — ${record.cidade}/${record.estado}${record.ativo ? '' : ' (rascunho)'}` : ''))); container.append(label);
  }
}
const normalized = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function specialtyPicker(kind, selectedSpecialties, selectedAreas) {
  const container = document.querySelector(`#${kind}-specialties`); container.replaceChildren();
  const selected = new Set(selectedSpecialties.map(String));
  const areas = new Set(selectedAreas.map(String));
  const controls = element('div','','picker-controls');
  const label = element('label','Buscar especialidade ou especificação'); label.htmlFor=`${kind}-specialty-search`;
  const search = document.createElement('input'); search.type='search'; search.id=label.htmlFor; search.placeholder='Ex.: ortopedia, braço, coluna, psicologia';
  const clear = element('button','Limpar seleção','btn btn-light'); clear.type='button';
  const counter = element('p','','muted'); counter.setAttribute('aria-live','polite');
  const selectedList = element('p','','picker-selection');
  const tree = element('div','','specialty-tree');
  const empty = element('p','Nenhuma opção encontrada. Você pode adicioná-la ao catálogo acima.','muted'); empty.hidden=true;
  controls.append(label,search,clear); container.append(controls,counter,selectedList,tree,empty);
  const branches=[];
  for(const specialty of state.specialties){
    const branch=document.createElement('details'); branch.className='specialty-branch';
    const summary=element('summary',`${specialty.nome} · ${specialty.grupo}`);
    const body=element('div','','specialty-body');
    const parentLabel=element('label','','check-line');
    const parent=document.createElement('input'); parent.type='checkbox'; parent.name='especialidades'; parent.value=specialty.id; parent.checked=selected.has(String(specialty.id));
    parentLabel.append(parent,element('span',`Atende ${specialty.nome}`));
    const detailGrid=element('div','','choice-grid');
    const children=[];
    for(const area of specialty.areas||[]){
      const areaLabel=element('label','','check-line'); const input=document.createElement('input');
      input.type='checkbox'; input.name='areas'; input.value=area.id; input.checked=areas.has(String(area.id));
      if(input.checked)parent.checked=true;
      input.addEventListener('change',()=>{if(input.checked)parent.checked=true;update();});
      areaLabel.append(input,element('span',area.nome)); detailGrid.append(areaLabel); children.push({input,label:areaLabel,name:area.nome});
    }
    parent.addEventListener('change',()=>{if(!parent.checked)children.forEach(child=>{child.input.checked=false;});update();});
    body.append(parentLabel,element('p','Especificações (opcionais):','muted'),detailGrid); branch.append(summary,body);branch.open=parent.checked;tree.append(branch);
    branches.push({branch,summary,parent,children,name:specialty.nome,group:specialty.grupo});
  }
  function update(){
    let count=0, detailCount=0; const descriptions=[];
    for(const item of branches){
      const chosen=item.children.filter(child=>child.input.checked); if(item.parent.checked){count++; descriptions.push(item.name+(chosen.length?`: ${chosen.map(child=>child.name).join(', ')}`:''));}
      detailCount+=chosen.length;
      item.summary.textContent=`${item.parent.checked?'✓ ':''}${item.name} · ${item.group}${chosen.length?` · ${chosen.length} especificação(ões)`:''}`;
    }
    counter.textContent=`${count} especialidade(s) e ${detailCount} especificação(ões) selecionadas.`;
    selectedList.textContent=descriptions.join(' • ');selectedList.hidden=!descriptions.length;
  }
  search.addEventListener('input',()=>{
    const term=normalized(search.value.trim());let visible=0;
    for(const item of branches){
      const parentMatches=normalized(`${item.name} ${item.group}`).includes(term);
      let childMatches=false;
      for(const child of item.children){const match=parentMatches||normalized(child.name).includes(term);child.label.hidden=!match;childMatches ||= match;}
      item.branch.hidden=!parentMatches&&!childMatches;
      if(!item.branch.hidden)visible++;
      item.branch.open=term? !item.branch.hidden:item.parent.checked;
    }
    empty.hidden=visible>0;
  });
  clear.addEventListener('click',()=>{container.querySelectorAll('input[type=checkbox]').forEach(input=>{input.checked=false;});update();});
  update();
}
function updateCatalogParents(){
  const select=document.querySelector('#catalog-parent');const current=select.value;
  select.replaceChildren();const first=element('option','Nova especialidade / categoria');first.value='';select.append(first);
  for(const item of state.specialties){const option=element('option',`${item.nome} — nova especificação`);option.value=item.id;select.append(option);}
  select.value=current;
}
document.querySelector('#catalog-parent').addEventListener('change',event=>{document.querySelector('#catalog-group-field').hidden=Boolean(event.target.value);});
document.querySelector('#catalog-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;const button=form.querySelector('[type=submit]');const message=document.querySelector('#catalog-message');
  button.disabled=true;message.textContent='';let saved=false;
  try{
    await api('/api/admin/specialties',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});saved=true;
    state.specialties=await api('/api/specialties');updateCatalogParents();
    for(const kind of ['professional','place']){
      if(document.querySelector(`#${kind}-editor`).hidden)continue;
      const data=new FormData(document.querySelector(`#${kind}-form`));specialtyPicker(kind,data.getAll('especialidades'),data.getAll('areas'));
    }
    form.elements.nome.value='';message.textContent='Opção adicionada. Agora você pode selecioná-la nos cadastros.';
  }catch(error){message.textContent=saved?'Opção salva. Atualize a página para recarregar o catálogo.':error.message;}
  finally{button.disabled=false;}
});
function openEditor(kind, record = {}) {
  const form = document.querySelector(`#${kind}-form`); form.reset();
  form.elements.id.value = record.id || '';
  for (const [key, value] of Object.entries(record)) {
    const field = form.elements.namedItem(key);
    if (field && !['locais', 'especialidades', 'areas', 'atendimentos'].includes(key)) { if (field.type === 'checkbox') field.checked = Boolean(value); else field.value = value ?? ''; }
  }
  if (kind === 'professional') {
    choices('#place-options', state.places, 'locais', record.locais || []);
  }
  specialtyPicker(kind, record.especialidades || [], record.areas || []);
  document.querySelector(`#${kind}-message`).textContent = '';
  const title = document.querySelector(`#${kind}-form-title`); title.textContent = `${record.id ? 'Editar' : 'Novo'} ${kind === 'professional' ? 'profissional' : 'local de atendimento'}`;
  document.querySelector(`#${kind}-editor`).hidden = false; title.focus();
}
for (const kind of ['professional', 'place']) {
  document.querySelector(`#new-${kind}`).addEventListener('click', () => openEditor(kind));
  document.querySelector(`[data-cancel="${kind}"]`).addEventListener('click', () => { document.querySelector(`#${kind}-editor`).hidden = true; document.querySelector(`#new-${kind}`).focus(); });
  document.querySelector(`#${kind}-search`).addEventListener('input', () => renderRecords(kind === 'professional' ? 'professionals' : 'places'));
  document.querySelector(`#${kind}-form`).addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget;
    const data = new FormData(form); const payload = Object.fromEntries(data); payload.ativo = form.elements.ativo.checked;
    if (kind === 'professional') payload.locais = data.getAll('locais');
    payload.especialidades = data.getAll('especialidades');
    payload.areas = data.getAll('areas');
    const id = payload.id; delete payload.id;
    const button = form.querySelector('[type=submit]'); button.disabled = true;
    const message = document.querySelector(`#${kind}-message`); message.textContent = ''; mainMessage.textContent = '';
    try {
      await api(`/api/admin/${kind === 'professional' ? 'professionals' : 'places'}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      document.querySelector(`#${kind}-editor`).hidden = true;
      mainMessage.className = 'saved'; mainMessage.textContent = 'Cadastro salvo com sucesso.';
      try { await refresh(); } catch { mainMessage.textContent = 'Cadastro salvo. Atualize a página para recarregar a lista.'; }
      document.querySelector(`#new-${kind}`).focus();
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  });
}
for (const uf of 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')) {
  const option = element('option', uf); option.value = uf; document.querySelector('#l-estado').append(option);
}
document.querySelector('#logout').addEventListener('click', async event => {
  event.currentTarget.disabled = true;
  try { await api('/api/auth/logout', { method: 'POST' }); location.assign('/index.html'); }
  catch (error) { mainMessage.className = 'form-message'; mainMessage.textContent = error.message; event.currentTarget.disabled = false; }
});
(async () => {
  const status = document.querySelector('#access-status');
  try {
    const { user } = await api('/api/auth/me');
    if (!user) return location.replace('/entrar.html?next=%2Fadmin.html');
    document.querySelector('#logout').hidden = false;
    if (user.role !== 'administrador') { status.textContent = 'Sua conta não tem acesso administrativo. Solicite a liberação ao responsável pela plataforma.'; return; }
    await refresh(); status.textContent = `Olá, ${user.name}.`;
    document.querySelector('#admin-content').hidden = false;
  } catch (error) { status.textContent = 'Não foi possível abrir a administração.'; mainMessage.textContent = error.message; }
})();
