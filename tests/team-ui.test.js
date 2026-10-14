const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../atendimento.js'),'utf8');

function harness({denied=false,emptyPlace=false,fullAgenda=false,professional=false}={}){
  class Element{
    constructor(tag='div'){this.tag=tag;this.children=[];this.listeners={};this.attributes={};this.dataset={};this.value='';this.hidden=false;this.textContent='';this.options=this.children;}
    append(...items){this.children.push(...items);}
    replaceChildren(...items){this.children.splice(0,this.children.length,...items);}
    addEventListener(event,fn){this.listeners[event]=fn;}
    setAttribute(key,value){this.attributes[key]=value;}
    getAttribute(key){return this.attributes[key];}
    focus(){}
    scrollIntoView(){}
    querySelector(){return new Element('button');}
    querySelectorAll(){return [];}
    closest(){return this;}
    reportValidity(){return true;}
    reset(){}
    showModal(){this.open=true;}
    close(){this.open=false;}
  }
  const elements=new Map(),get=key=>{if(!elements.has(key))elements.set(key,new Element());return elements.get(key);};
  const filter=get('#filters');filter.elements={dia:new Element(),profissional:new Element(),local:new Element()};
  const publish=get('#publish-form');publish.elements=Object.fromEntries(['dia','inicio','fim','duracao','valor','profissional_id','local_id'].map(key=>[key,new Element()]));
  get('#action-form').elements={motivo:new Element(),liberar:new Element()};
  const tabs=['agenda','disponivel','agendado','confirmado','cancelled'].map(view=>{const e=new Element('button');e.dataset.view=view;return e;});
  const document={querySelector:get,querySelectorAll:selector=>selector==='[data-view]'?tabs:[],createElement:tag=>new Element(tag)};
  let destination;const requests=[];
  const context=vm.createContext({document,URLSearchParams,AbortSignal,Intl,Date,location:{pathname:professional?'/profissional.html':'/atendimento.html',assign:v=>destination=v,replace:v=>destination=v},FormData:class{constructor(form){this.form=form;}*[Symbol.iterator](){for(const [key,e]of Object.entries(this.form.elements||{}))yield[key,e.value];}},fetch:async(url,options)=>{
    requests.push({url,options});
    if(denied&&url!=='/api/auth/logout')return{ok:false,status:403,json:async()=>({error:'Acesso não autorizado.'})};
    const data=url.endsWith('/context')?{user:{name:'Recepção',role:'profissional'},pairs:[{profissional_id:7,local_id:8,profissional:'Dra. Teste',local:'Clínica A',publicado:1}]}:{slots:[{id:3,profissional_id:7,local_id:8,profissional:'Dra. Teste',local:'Clínica A',inicio_em:'2035-01-20T09:00:00-03:00',fim_em:'2035-01-20T09:30:00-03:00',status:'disponivel',valor:150},{id:4,profissional:'Dra. Teste',local:'Clínica A',inicio_em:'2035-01-20T10:00:00-03:00',fim_em:'2035-01-20T10:30:00-03:00',status:'reservado',agendamento_status:'agendado',agendamento_id:12,paciente:'Paciente de teste',telefone:'33999991234',origem:'site'}],cancelled:[]};
    if(fullAgenda&&data.slots){data.slots.push({...data.slots[1],id:5,agendamento_status:'confirmado'},{...data.slots[0],id:6,status:'bloqueado'});data.cancelled.push({...data.slots[1],id:7,motivo_cancelamento:'Solicita??o do paciente'});}
    if(emptyPlace&&url.endsWith('/context')){data.pairs=[];data.places=[{id:8,name:'Clínica sem equipe',ativo:1}];}
    return{ok:true,status:200,json:async()=>data};
  }});
  return{context,elements,requests,tabs,destination:()=>destination};
}
async function settle(){for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));}
test('área de atendimento carrega agenda e abre agendamento manual no horário escolhido',async()=>{
  const h=harness();vm.runInContext(source,h.context);await settle();
  assert.equal(h.elements.get('#workspace').hidden,false);assert.equal(h.elements.get('#count-free').textContent,1);assert.equal(h.elements.get('#count-pending').textContent,1);
  const rows=h.elements.get('#agenda-list').children;assert.equal(rows.length,2);
  const manual=rows[0].children[3].children[0];assert.equal(manual.textContent,'Agendar paciente');manual.listeners.click();
  assert.equal(h.elements.get('#manual-dialog').open,true);assert.match(h.elements.get('#manual-summary').textContent,/Clínica A/);assert.match(h.elements.get('#manual-summary').textContent,/09:00/);
  const confirm=rows[1].children[3].children[0];assert.equal(confirm.textContent,'Confirmar');confirm.listeners.click();assert.equal(h.elements.get('#action-dialog').open,true);assert.equal(h.elements.get('#cancel-fields').hidden,true);
  rows[1].children[3].children[1].listeners.click();assert.equal(h.elements.get('#cancel-fields').hidden,false);assert.equal(h.elements.get('#action-form').elements.motivo.required,true);
});
test('acesso recusado não exibe dados de pacientes',async()=>{
  const h=harness({denied:true});vm.runInContext(source,h.context);await settle();
  assert.equal(h.elements.get('#workspace').hidden,true);assert.equal(h.elements.get('#agenda-list').children.length,0);assert.match(h.elements.get('#access-status').textContent,/não autorizado/);
});
test('local sem profissionais aparece no filtro com orientação para abrir a agenda',async()=>{
  const h=harness({emptyPlace:true});vm.runInContext(source,h.context);await settle();
  const select=h.elements.get('#filters').elements.local;
  assert.equal(select.options[1].textContent,'Clínica sem equipe');assert.equal(select.value,'8');
  assert.equal(h.elements.get('#workspace').hidden,false);assert.equal(h.elements.get('#publish-open').hidden,true);
  assert.match(h.elements.get('#access-status').textContent,/Seu acesso está liberado/);
  assert.match(h.elements.get('#access-status').textContent,/não têm profissionais vinculados/);
});

test('sair encerra sessão e retorna ao login com destino da agenda',async()=>{const h=harness();vm.runInContext(source,h.context);await settle();const button=h.elements.get('#logout');await button.listeners.click({currentTarget:button});assert.ok(h.requests.some(r=>r.url==='/api/auth/logout'&&r.options.method==='POST'));const url=new URL(h.destination(),'http://localhost');assert.equal(url.pathname,'/entrar.html');assert.equal(url.searchParams.get('next'),'/atendimento.html');assert.equal(h.elements.get('#workspace').hidden,true);});

test('conta sem permissão pode sair e entrar com outra conta',async()=>{const h=harness({denied:true});vm.runInContext(source,h.context);await settle();const button=h.elements.get('#switch-account');assert.equal(button.hidden,false);assert.equal(h.elements.get('#logout').hidden,false);assert.equal(h.elements.get('#access-retry').hidden,true);await button.listeners.click({currentTarget:button});assert.equal(new URL(h.destination(),'http://localhost').searchParams.get('next'),'/atendimento.html');assert.ok(h.requests.some(r=>r.url==='/api/auth/logout'));});

test('cart?es filtram estados, preservam a??es e permitem voltar ? agenda completa',async()=>{
  const h=harness({fullAgenda:true});vm.runInContext(source,h.context);await settle();
  const select=view=>h.tabs.find(b=>b.dataset.view===view).listeners.click();
  const rows=()=>h.elements.get('#agenda-list').children;
  const filters=h.elements.get('#filters').elements;filters.profissional.value='7';filters.local.value='8';
  const day=filters.dia.value;
  for(const [view,label] of [['disponivel','Livre'],['agendado','Aguardando confirmação'],['confirmado','Confirmado'],['cancelled','Cancelado']]){
    select(view);assert.equal(rows().length,1);assert.equal(rows()[0].children[1].children[0].textContent,label);
    assert.equal(h.tabs.find(b=>b.dataset.view===view).attributes['aria-pressed'],'true');
    assert.equal(filters.dia.value,day);assert.equal(filters.profissional.value,'7');assert.equal(filters.local.value,'8');
    assert.equal(h.elements.get('#count-free').textContent,1);assert.equal(h.elements.get('#count-pending').textContent,1);
    if(view==='disponivel')assert.equal(rows()[0].children[3].children[0].textContent,'Agendar paciente');
    if(view==='agendado')assert.equal(rows()[0].children[3].children[0].textContent,'Confirmar');
    if(view==='confirmado')assert.equal(rows()[0].children[3].children[0].textContent,'Cancelar');
    if(view==='cancelled'){assert.equal(rows()[0].children[3].children.length,0);assert.equal(rows()[0].children[2].children.at(-1).textContent,'Solicita??o do paciente');}
  }
  select('agendado');await h.elements.get('#filters').listeners.change();assert.equal(rows().length,1);assert.equal(rows()[0].children[1].children[0].textContent,'Aguardando confirmação');
  select('agenda');assert.equal(rows().length,4);
});
test('filtro sem resultados informa o estado escolhido',async()=>{
  const h=harness();vm.runInContext(source,h.context);await settle();
  h.tabs.find(b=>b.dataset.view==='confirmado').listeners.click();
  assert.equal(h.elements.get('#agenda-list').children[0].children[0].textContent,'Nenhum atendimento confirmado neste dia');
});

test('profissional consulta a própria API e sai para o login da sua agenda',async()=>{
 const h=harness({professional:true});vm.runInContext(source,h.context);await settle();
 assert.ok(h.requests.some(r=>r.url==='/api/professional/context'));
 assert.ok(h.requests.some(r=>r.url.startsWith('/api/professional/agenda?')));
 assert.equal(h.elements.get('#filters').elements.profissional.value,'7');
 const button=h.elements.get('#logout');await button.listeners.click({currentTarget:button});
 assert.equal(new URL(h.destination(),'http://localhost').searchParams.get('next'),'/profissional.html');
});

test('grade semanal mantém pacientes, profissionais e ações; remarcação abre busca de vagas',async()=>{
 const h=harness({fullAgenda:true});vm.runInContext(source,h.context);
 vm.runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname,'../atendimento-extras.js'),'utf8'),h.context);
 await settle();
 h.elements.get('#agenda-period').value='semana';
 await h.elements.get('#filters').listeners.change();
 const grid=h.elements.get('#week-grid');assert.equal(grid.hidden,false);assert.equal(h.elements.get('#agenda-list').hidden,true);assert.equal(grid.children.length,7);
 // Os registros de teste são de 2035; ao selecionar a data correta aparecem na grade.
 h.elements.get('#filters').elements.dia.value='2035-01-20';await h.elements.get('#filters').listeners.change();
 const firstDay=grid.children[0],table=firstDay.children[1].children[0];
 assert.equal(table.tag,'table');
 const tbody=table.children[1];assert.ok(tbody.children.length);
 h.elements.get('#agenda-period').value='dia';await h.elements.get('#filters').listeners.change();
 const reserved=h.elements.get('#agenda-list').children[1];
 const reschedule=reserved.children[3].children.find(b=>b.textContent==='Remarcar');assert.ok(reschedule);
 await reschedule.listeners.click();await settle();assert.equal(h.elements.get('#reschedule-dialog').open,true);
 assert.ok(h.elements.get('#reschedule-slot').options.length>1);
});
