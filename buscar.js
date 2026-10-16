const form=document.querySelector('#browse-form');
// Compatibilidade com HTML anterior ainda aberto no navegador.
if(!form.elements.city){
  const field=document.createElement('div');field.className='city-input';
  const label=document.createElement('label');label.htmlFor='city';label.textContent='Cidade';
  const select=document.createElement('select');select.id='city';select.name='city';
  const option=document.createElement('option');option.value='';option.textContent='Todas as cidades';
  select.append(option);field.append(label,select);
  form.insertBefore(field,document.querySelector('#type-field'));
}
const results=document.querySelector('#results');
const status=document.querySelector('#results-status');
const params=new URLSearchParams(location.search);
const types={clinica:'Clínica',consultorio:'Consultório',hospital:'Hospital',laboratorio:'Laboratório',centro_medico:'Centro médico',outro:'Local de atendimento'};
let view=params.get('aba')==='profissionais'?'profissionais':'locais';
let localId=params.get('local')||'';
let local=null;
let requestVersion=0;
let citiesReady=false;
function selectedCity(){return form.elements.city.value?JSON.parse(form.elements.city.value):null;}
function chooseCity(cidade,uf){
  const value=JSON.stringify([cidade,uf]);
  if(!Array.from(form.elements.city.options).some(option=>option.value===value)){
    const option=node('option',`${cidade} / ${uf}`);option.value=value;form.elements.city.append(option);
  }
  form.elements.city.value=value;
}
async function loadCities(){
  if(citiesReady)return;
  const cities=await api('/api/cities');
  if(!Array.isArray(cities))throw new Error('Cidades indisponíveis');
  form.elements.city.replaceChildren();const all=node('option','Todas as cidades');all.value='';form.elements.city.append(all);
  for(const city of cities)chooseCity(city.cidade,city.uf);
  form.elements.city.value='';
  if(params.get('cidade')&&params.get('uf'))chooseCity(params.get('cidade'),params.get('uf'));
  else if(!params.has('cidade')&&cities.length===1)chooseCity(cities[0].cidade,cities[0].uf);
  citiesReady=true;
}
if(localId)view='profissionais';
for(const key of ['disponibilidade','pagamento','convenio'])if(form.elements[key]){form.elements[key].value=params.get(key)||'';form.elements[key].addEventListener('change',()=>load());}
form.elements.q.value=params.get('q')||'';
form.elements.tipo.value=types[params.get('tipo')]?params.get('tipo'):'';
function node(tag,text,cls){const value=document.createElement(tag);value.textContent=text;if(cls)value.className=cls;return value;}
async function api(url){
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Não foi possível carregar os atendimentos.');
  return response.json();
}
function address(item){return [item.endereco,item.numero,item.complemento,item.bairro,[item.cidade,item.estado].filter(Boolean).join('/')].filter(Boolean).join(', ');}
function phone(number){const value=number.replace(/\D/g,'');return value.replace(/^(?:55)?(\d{2})(\d{4,5})(\d{4})$/,'($1) $2-$3');}
function action(text,fn){const button=node('button',text,'result-action');button.type='button';button.addEventListener('click',fn);return button;}
function sync(){
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
  document.querySelector('#type-field').hidden=view!=='locais';
  form.elements.q.placeholder=view==='locais'?'Nome, especialidade ou cidade':'Nome ou especialidade';
  document.querySelector('#results-title').textContent=view==='locais'?'Locais de atendimento':'Profissionais';
  document.querySelector('#local-context').hidden=!local;
  if(local){document.querySelector('#local-name').textContent=local.nome;document.querySelector('#local-address').textContent=address(local);}
  const query=new URLSearchParams({aba:view});
  if(form.elements.q.value.trim())query.set('q',form.elements.q.value.trim());
  if(view==='locais'&&form.elements.tipo.value)query.set('tipo',form.elements.tipo.value);
  for(const key of ['disponibilidade','pagamento','convenio'])if(form.elements[key]?.value)query.set(key,form.elements[key].value);
  if(localId)query.set('local',localId);
  const city=selectedCity();query.set('cidade',city?city[0]:'');if(city)query.set('uf',city[1]);
  try{history.replaceState(null,'',`buscar.html?${query}`);}catch{/* Arquivos locais podem impedir alteração da URL. */}
}
function specialtySummary(card,item){
  const names=[...new Set((item.atendimentos||[]).map(entry=>entry.nome))];
  if(names.length)card.append(node('p',names.slice(0,3).join(' · ')+(names.length>3?` · +${names.length-3}`:''),'result-specialties'));
}
function placeCard(item){
  const card=node('article','','result-card');const heading=node('div','','result-heading');const icon=node('span','▦','result-icon');icon.setAttribute('aria-hidden','true');
  const title=node('div','');const nameLink=node('a',item.nome);nameLink.href=`perfil.html?tipo=local&id=${item.id}`;const name=node('h3','');name.append(nameLink);title.append(node('small',types[item.tipo]||'Local de atendimento'),name);heading.append(icon,title);
  card.append(heading,node('p',address(item),'result-address'));specialtySummary(card,item);if(item.next_available_at)card.append(node('p','Próximo horário: '+new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(item.next_available_at)),'result-availability'));if(item.convenios)card.append(node('small','Convênios da unidade: '+item.convenios));
  const footer=node('div','','result-footer');
  if(item.telefone){const link=node('a',phone(item.telefone),'result-phone');link.href=`tel:${item.telefone}`;footer.append(link);}
  const choose=node('a','Ver perfil →','result-action');choose.href=`perfil.html?tipo=local&id=${item.id}`;choose.setAttribute('aria-label',`Ver perfil de ${item.nome}`);
  footer.append(choose);card.append(footer);return card;
}
function professionalCard(item){
  const card=node('article','','result-card');const heading=node('div','','result-heading');
  const image=document.createElement('img');image.src=item.avatar_url||'assets/icon.svg';image.alt='';image.loading='lazy';image.className='result-avatar';
  const title=node('div','');const nameLink=node('a',item.name);nameLink.href=`perfil.html?tipo=profissional&id=${item.id}`;const name=node('h3','');name.append(nameLink);title.append(name,node('small',item.specialty));heading.append(image,title);card.append(heading);specialtySummary(card,item);
  if(item.next_available_at){const date=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(item.next_available_at));card.append(node('p',`Próximo horário: ${date}`,'result-availability'));}
  else card.append(node('p','Sem horários disponíveis no momento','result-availability'));
  const footer=node('div','','result-footer');
  const link=node('a','Ver perfil →','result-action');link.href=`perfil.html?tipo=profissional&id=${item.id}`;link.setAttribute('aria-label',`Ver perfil de ${item.name}`);footer.append(link);card.append(footer);return card;
}
function emptyState(title,description,retry){
  const box=node('div','','empty-state');box.append(node('h3',title),node('p',description));
  box.append(action(retry?'Tentar novamente':'Ver todas as opções',()=>{if(!retry){local=null;localId='';form.elements.q.value='';form.elements.tipo.value='';for(const key of ['disponibilidade','pagamento','convenio'])if(form.elements[key])form.elements[key].value='';}load();}));
  if(retry&&localId)box.append(action('Escolher outro local',()=>{local=null;localId='';view='locais';load();}));
  if(local?.telefone){const link=node('a','Ligar para o local','result-phone');link.href=`tel:${local.telefone}`;box.append(link);}
  results.replaceChildren(box);
}
async function load(){
  const version=++requestVersion;status.textContent='Buscando opções…';results.setAttribute('aria-busy','true');results.replaceChildren();
  try{
    sync();
    await loadCities();if(version!==requestVersion)return;sync();
    if(localId&&!local){const loadedLocal=await api(`/api/places/${encodeURIComponent(localId)}`);if(version!==requestVersion)return;local=loadedLocal;chooseCity(local.cidade,local.estado);sync();}
    const query=new URLSearchParams({q:form.elements.q.value.trim()});
    const city=selectedCity();if(city){query.set('cidade',city[0]);query.set('uf',city[1]);}
    if(view==='locais')query.set('tipo',form.elements.tipo.value);else if(localId)query.set('local',localId);
    for(const key of ['disponibilidade','pagamento','convenio'])if(form.elements[key]?.value)query.set(key,form.elements[key].value);query.set('tipo_busca',view);
    const items=await api(form.elements.disponibilidade?'/api/discovery?'+query:`/api/${view==='locais'?'places':'professionals'}?${query}`);
    if(version!==requestVersion)return;
    if(!Array.isArray(items))throw new Error('Resposta inválida');
    status.textContent=`${items.length} ${items.length===1?'opção encontrada':'opções encontradas'}${city?` em ${city[0]} / ${city[1]}`:''}`;
    if(!items.length){emptyState(local?'Nenhum profissional disponível neste local':'Não encontramos opções para esta busca',local?'Este local ainda não possui profissionais publicados que correspondam à busca. Você pode entrar em contato ou procurar outros profissionais.':'Tente outro nome, especialidade ou tipo de local.',false);return;}
    results.replaceChildren(...items.map(view==='locais'?placeCard:professionalCard));
    try{const saved=JSON.parse(sessionStorage.getItem('avelu-search')||'null');if(saved?.url===location.pathname+location.search&&!window.aveluRestored){window.aveluRestored=true;requestAnimationFrame(()=>window.scrollTo(0,saved.scroll||0));}}catch{}
  }catch{if(version===requestVersion){status.textContent='Não foi possível carregar';emptyState('Vamos tentar novamente?','Confira sua conexão e tente novamente em instantes. Seus filtros foram mantidos.',true);}}
  finally{if(version===requestVersion)results.setAttribute('aria-busy','false');}
}
form.addEventListener('submit',event=>{event.preventDefault();load();});
form.elements.tipo.addEventListener('change',()=>load());
form.elements.city.addEventListener('change',()=>{local=null;localId='';load();});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view;if(view==='locais'){local=null;localId='';}load();}));
document.querySelector('#clear-local').addEventListener('click',()=>{view='locais';local=null;localId='';form.elements.q.value='';load();});
api('/api/auth/me?audience=patient').then(({user})=>{if(user?.role==='paciente'){const link=document.querySelector('#account-link');link.href=user.role==='administrador'?'admin.html':user.isProfessional?'profissional.html':user.role==='equipe'?'atendimento.html':'agendamentos.html';link.textContent=user.role==='administrador'?'Administrar':user.isProfessional?'Minha agenda':user.role==='equipe'?'Área de atendimento':'Minha conta';}}).catch(()=>{});
load();

results.addEventListener('click',event=>{if(!event.target.closest('a[href^="perfil.html"]'))return;try{sessionStorage.setItem('avelu-search',JSON.stringify({url:location.pathname+location.search,scroll:window.scrollY}));}catch{}});
