const localParams=new URLSearchParams(location.search),localId=localParams.get('local');
const $=selector=>document.querySelector(selector);
const element=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
const normalized=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const dateKey=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const dateLabel=value=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(new Date(value+'T12:00:00-03:00'));
const hour=value=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const price=value=>value==null?'Consultar valor':Number(value)===0?'Gratuito':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value));
let cards=[],generation=0;
async function publicApi(url){const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(response.status===404?'Este local ou profissional não está disponível.':data.error||'Não foi possível carregar.');return data;}
function bookingLink(professional,slot){const query=new URLSearchParams({profissional:professional.id,local:localId,origem:'local'});if(slot)query.set('horario',slot.id);return 'agendar.html?'+query;}
function filterCards(){const query=normalized($('#professional-query').value);let count=0;for(const {item,card} of cards){card.hidden=!normalized(item.nome+' '+item.titulo).includes(query);if(!card.hidden)count++;}$('#professional-count').textContent=count+' '+(count===1?'profissional':'profissionais');$('#no-match').hidden=count>0||cards.length===0;}
async function loadAgenda(item,area,version){
  area.replaceChildren(element('p','Buscando horários…','agenda-feedback'));area.setAttribute('aria-busy','true');
  try{
    const data=await publicApi('/api/professionals/'+item.id+'/availability?local='+encodeURIComponent(localId));if(version!==generation)return;
    // Mesmo que uma resposta antiga esteja em cache, nunca ofereça uma vaga de outra unidade.
    const slots=data.slots.filter(slot=>String(slot.local_id)===localId&&new Date(slot.inicio_em)>new Date()).sort((a,b)=>new Date(a.inicio_em)-new Date(b.inicio_em));
    area.replaceChildren(element('h3','Horários nesta unidade'));
    if(!slots.length){area.append(element('p','Sem horários online disponíveis neste local no momento.','agenda-feedback'));return;}
    const days=[...new Set(slots.map(slot=>dateKey(slot.inicio_em)))];
    const field=element('div','','agenda-day'),label=element('label','Dia'),select=document.createElement('select');select.id='day-'+item.id;label.htmlFor=select.id;
    for(const day of days){const option=element('option',dateLabel(day));option.value=day;select.append(option);}select.value=days[0];field.append(label,select);
    const times=element('div','','local-slots');const more=element('button','Mostrar mais horários deste dia','agenda-more');more.type='button';let expanded=false;
    function renderDay(){const selected=slots.filter(slot=>dateKey(slot.inicio_em)===select.value);times.replaceChildren();for(const slot of selected.slice(0,expanded?selected.length:8)){const link=element('a',hour(slot.inicio_em),'local-slot');link.href=bookingLink(item,slot);link.append(element('small',price(slot.valor)));link.setAttribute('aria-label',`Agendar com ${item.nome}, ${dateLabel(select.value)}, às ${hour(slot.inicio_em)}, ${price(slot.valor)}`);times.append(link);}more.hidden=expanded||selected.length<=8;}
    more.addEventListener('click',()=>{expanded=true;renderDay();});select.addEventListener('change',()=>{expanded=false;renderDay();});
    area.append(field,times,more);renderDay();
    const all=element('a','Ver agenda completa →','agenda-more');all.href=bookingLink(item);area.append(all);
  }catch{if(version!==generation)return;area.replaceChildren(element('p','Não conseguimos carregar os horários deste profissional.','agenda-feedback'));const retry=element('button','Tentar novamente','agenda-more');retry.type='button';retry.addEventListener('click',()=>loadAgenda(item,area,version));area.append(retry);}
  finally{area.setAttribute('aria-busy','false');}
}
async function loadLocal(){
  const version=++generation;cards=[];$('#local-content').hidden=true;$('#retry-local').hidden=true;$('#local-contact').hidden=true;$('#local-status').textContent='Carregando profissionais…';$('#local-professionals').replaceChildren();
  try{
    if(!/^[1-9]\d{0,14}$/.test(localId||''))throw new Error('Escolha um local na tela Agendar.');
    const data=await publicApi('/api/profiles/local/'+localId);if(version!==generation)return;
    $('#local-name').textContent=data.nome;document.title='Agendar em '+data.nome+' — Avelu';$('#local-address').textContent=[data.endereco,data.numero,data.complemento,data.bairro,data.cidade+'/'+data.estado].filter(Boolean).join(', ');
    $('#back-local').href='perfil.html?tipo=local&id='+localId;$('#back-local').textContent='← Voltar ao perfil do local';
    const contact=$('#local-contact');contact.replaceChildren(element('p','Não encontrou um horário? Consulte o local sobre outras possibilidades.'));if(data.telefone){const call=element('a','Ligar para o local');call.href='tel:'+data.telefone;contact.append(call);}const profile=element('a','Ver todos os contatos');profile.href='perfil.html?tipo=local&id='+localId+'#contatos';contact.append(profile);contact.hidden=false;
    const jobs=[];
    for(const item of data.relacionados){const card=element('article','','local-professional'),identity=element('div','','professional-identity'),initial=element('span',item.nome.charAt(0),'professional-initial');initial.setAttribute('aria-hidden','true');const info=element('div','');info.append(element('h2',item.nome),element('p',item.titulo));const profileLink=element('a','Conhecer o profissional');profileLink.href='perfil.html?tipo=profissional&id='+item.id+'&local='+localId;info.append(profileLink);identity.append(initial,info);const agenda=element('div','','professional-agenda');agenda.append(element('p','Buscando horários…','agenda-feedback'));agenda.setAttribute('aria-busy','true');agenda.setAttribute('aria-label','Agenda de '+item.nome);agenda.setAttribute('aria-live','polite');card.append(identity,agenda);$('#local-professionals').append(card);cards.push({item,card});jobs.push({item,agenda});}
    $('#local-content').hidden=!cards.length;$('#local-status').textContent=cards.length?'':'Este local ainda não tem profissionais com perfil publicado. Consulte os contatos abaixo para saber sobre atendimentos.';filterCards();
    // Limita requisições simultâneas para manter a navegação leve em equipes grandes.
    let cursor=0;await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{while(cursor<jobs.length&&version===generation){const job=jobs[cursor++];await loadAgenda(job.item,job.agenda,version);}}));
  }catch(error){if(version!==generation)return;$('#local-status').textContent=error.name==='TimeoutError'?'O carregamento demorou mais que o esperado. Tente novamente.':error.message;$('#retry-local').hidden=false;}
}
$('#professional-query').addEventListener('input',filterCards);$('#retry-local').addEventListener('click',loadLocal);loadLocal();
