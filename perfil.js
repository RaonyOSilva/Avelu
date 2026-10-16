const params=new URLSearchParams(location.search);
const kind=params.get('tipo');const id=params.get('id');
const types={clinica:'Clínica',consultorio:'Consultório',hospital:'Hospital',laboratorio:'Laboratório',centro_medico:'Centro médico',outro:'Local de atendimento'};
const node=(tag,text,cls)=>{const element=document.createElement(tag);element.textContent=text;if(cls)element.className=cls;return element;};
const address=item=>[item.endereco,item.numero,item.complemento,item.bairro,[item.cidade,item.estado].filter(Boolean).join('/')].filter(Boolean).join(', ');
const phone=value=>value.replace(/\D/g,'').replace(/^(?:55)?(\d{2})(\d{4,5})(\d{4})$/,'($1) $2-$3');
function contact(label,text,href){const item=node('div','','contact-item');item.append(node('strong',label));const value=node(href?'a':'span',text);if(href){value.href=href;if(/^https?:/.test(href)){value.target='_blank';value.rel='noopener noreferrer';}}item.append(value);document.querySelector('#contact-list').append(item);}
function webLink(value){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}}
function profileLink(type,value){return `perfil.html?tipo=${type}&id=${encodeURIComponent(value)}`;}
async function load(){
  const status=document.querySelector('#profile-status');
  try{
    if(!['local','profissional'].includes(kind)||!/^[1-9]\d{0,14}$/.test(id||''))throw new Error('Escolha um perfil na tela Agendar.');
    const response=await fetch(`/api/profiles/${kind}/${id}`,{cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error(response.status===404?'Este perfil não está disponível.':'Não foi possível carregar o perfil. Tente novamente.');
    const data=await response.json();const isPlace=kind==='local';
    document.title=`${data.nome} — Avelu`;
    document.querySelector('#back-link').href=`buscar.html?aba=${isPlace?'locais':'profissionais'}`;try{const saved=JSON.parse(sessionStorage.getItem('avelu-search')||'null');if(saved?.url&&/^\/buscar\.html(?:\?|$)/.test(saved.url))document.querySelector('#back-link').href=saved.url;}catch{}
    document.querySelector('#profile-name').textContent=data.nome;
    document.querySelector('#profile-type').textContent=isPlace?(types[data.tipo]||'Local de atendimento'):'Profissional de saúde';
    document.querySelector('#profile-subtitle').textContent=isPlace?`${data.cidade} / ${data.estado}`:data.titulo;
    if(!isPlace){const avatar=document.querySelector('#profile-avatar');if(data.avatar_url){const image=document.createElement('img');image.src=data.avatar_url;image.alt='';avatar.replaceChildren(image);}else avatar.textContent=data.nome.charAt(0).toUpperCase();}
    document.querySelector('#description').textContent=data.descricao||'A apresentação deste perfil ainda não foi informada.';
    if(data.registro){const registration=document.querySelector('#registration');registration.hidden=false;registration.textContent=`Registro profissional: ${data.registro}`;}
    const specialties=document.querySelector('#specialties');
    for(const item of data.atendimentos||[]){const block=node('div','','specialty-item');block.append(node('h3',item.nome));const tags=node('div','','specialty-tags');item.areas.forEach(area=>tags.append(node('span',area.nome)));block.append(tags);specialties.append(block);}
    if(!data.atendimentos?.length)specialties.append(node('p','As especialidades ainda não foram informadas.'));
    document.querySelector('#related-nav').textContent=isPlace?'Profissionais':'Locais de atendimento';
    document.querySelector('#related-title').textContent=isPlace?'Profissionais deste local':'Locais de atendimento';
    const list=document.querySelector('#related-list');
    document.querySelector('#related-note').textContent=isPlace?'Escolha um profissional para conhecer seu perfil e consultar horários.':'Consulte o endereço do seu atendimento antes de confirmar o agendamento.';
    for(const item of data.relacionados){const card=node('article','','related-card');const info=node('div','');info.append(node('strong',item.nome),node('p',isPlace?item.titulo:address(item)));const link=node('a','Ver perfil →');link.href=profileLink(isPlace?'profissional':'local',item.id)+(isPlace?`&local=${id}`:'');link.setAttribute('aria-label',`Ver perfil de ${item.nome}`);card.append(info,link);list.append(card);}
    if(!data.relacionados.length)list.append(node('p',isPlace?'Ainda não há profissionais publicados neste local. Entre em contato para consultar atendimentos.':'Nenhum local de atendimento informado.'));
    const schedule=document.querySelector('#schedule');
    schedule.href=isPlace?`agendar-local.html?local=${id}`:`agendar.html?profissional=${id}${/^[1-9]\d{0,14}$/.test(params.get('local')||'')?'&local='+params.get('local'):''}`;
    schedule.textContent='Agendar atendimento';
    document.querySelector('#schedule-note').textContent=isPlace?'Veja os profissionais e escolha um horário disponível nesta unidade.':'Consulte os horários disponíveis e escolha o melhor para você.';
    if(isPlace){contact('Endereço',address(data));if(data.cep)contact('CEP',data.cep.replace(/^(\d{5})(\d{3})$/,'$1-$2'));contact('Mapa','Ver como chegar',`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address(data))}`);}
    if(data.telefone){contact('Telefone',phone(data.telefone),`tel:${data.telefone}`);const call=document.querySelector('#call');call.hidden=false;call.href=`tel:${data.telefone}`;call.textContent=`Ligar: ${phone(data.telefone)}`;}
    if(data.whatsapp&&/^\d{10,15}$/.test(data.whatsapp)){const href=`https://wa.me/${data.whatsapp}`;contact('WhatsApp',phone(data.whatsapp),href);const button=document.querySelector('#whatsapp');button.href=href;button.hidden=false;}else contact('WhatsApp','Ainda não informado');
    if(data.email_publico)contact('E-mail',data.email_publico,`mailto:${data.email_publico}`);
    const site=webLink(data.site);if(site)contact('Site',data.site,site);
    document.querySelector('#rating-summary').textContent='Avaliações';
    document.querySelector('#reviews').append(node('p','As avaliações de pacientes estarão disponíveis em uma próxima etapa.'));
    document.querySelector('#profile').hidden=false;status.hidden=true;
  }catch(error){status.textContent=error.name==='TimeoutError'?'O carregamento demorou mais que o esperado.':error.message;const retry=node('button','Tentar novamente','btn btn-light');retry.addEventListener('click',()=>location.reload());status.append(retry);}
}
fetch('/api/auth/me?audience=patient').then(response=>response.ok?response.json():null).then(session=>{if(session?.user?.role==='paciente'){const link=document.querySelector('#account-link');link.href=session.user.role==='administrador'?'admin.html':session.user.isProfessional?'profissional.html':session.user.role==='equipe'?'atendimento.html':'agendamentos.html';link.textContent=session.user.role==='administrador'?'Administrar':session.user.isProfessional?'Minha agenda':session.user.role==='equipe'?'Área de atendimento':'Minha conta';}}).catch(()=>{});
load();
