const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../agendar-local.js'),'utf8');
function harness({empty=false,offline=false,noTeam=false}={}){
  class Element{
    constructor(tag){this.tag=tag;this.children=[];this.value='';this.listeners={};this.attributes={};this.hidden=false;}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
    addEventListener(name,fn){this.listeners[name]=fn;}
    setAttribute(name,value){this.attributes[name]=value;}
  }
  const elements=new Map(),get=key=>{if(!elements.has(key))elements.set(key,new Element('div'));return elements.get(key);};
  const requests=[];
  const context=vm.createContext({document:{querySelector:get,createElement:tag=>new Element(tag)},location:{search:'?local=5'},URLSearchParams,AbortSignal,Intl,Date,fetch:async url=>{
    requests.push(url);
    if(offline&&url.includes('/availability'))throw new Error('offline');
    return{ok:true,json:async()=>url.startsWith('/api/profiles/')?{nome:'Clínica A',endereco:'Rua A',cidade:'Cidade',estado:'MG',telefone:'3333333333',relacionados:noTeam?[]:[{id:9,nome:'Dra. Ana',titulo:'Ortopedia'}]}:{slots:empty?[]:[{id:42,local_id:5,inicio_em:'2035-06-10T12:00:00Z',valor:'180.00'},{id:43,local_id:8,inicio_em:'2035-06-10T13:00:00Z',valor:100},{id:44,local_id:5,inicio_em:'2035-06-11T12:00:00Z',valor:null}]}};
  }});
  return{context,elements,requests};
}
async function run(h){vm.runInContext(source,h.context);for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));}
test('agenda do local mostra dias e preços e leva o horário da unidade à confirmação',async()=>{
  const h=harness();await run(h);
  assert.ok(h.requests.includes('/api/professionals/9/availability?local=5'));
  const card=h.elements.get('#local-professionals').children[0],agenda=card.children[1];
  const select=agenda.children[1].children[1],times=agenda.children[2];
  assert.equal(select.children.length,2);assert.equal(times.children.length,1);
  const link=times.children[0],url=new URL(link.href,'http://localhost');
  assert.equal(url.searchParams.get('local'),'5');assert.equal(url.searchParams.get('profissional'),'9');assert.equal(url.searchParams.get('horario'),'42');assert.equal(url.searchParams.get('origem'),'local');
  assert.match(link.children[0].textContent,/180,00/);assert.match(link.attributes['aria-label'],/09:00/);
  select.value='2035-06-11';select.listeners.change();assert.match(times.children[0].href,/horario=44/);assert.equal(times.children[0].children[0].textContent,'Consultar valor');
  h.elements.get('#professional-query').value='Ana';h.elements.get('#professional-query').listeners.input();assert.equal(card.hidden,false);
  h.elements.get('#professional-query').value='inexistente';h.elements.get('#professional-query').listeners.input();assert.equal(card.hidden,true);assert.equal(h.elements.get('#no-match').hidden,false);
});
test('agenda vazia oferece contato sem inventar horários',async()=>{
  const h=harness({empty:true});await run(h);const agenda=h.elements.get('#local-professionals').children[0].children[1];assert.match(agenda.children[1].textContent,/Sem horários online/);assert.equal(h.elements.get('#local-contact').hidden,false);
});
test('falha de um profissional oferece nova tentativa e mantém o local visível',async()=>{
  const h=harness({offline:true});await run(h);const agenda=h.elements.get('#local-professionals').children[0].children[1];assert.equal(agenda.children[1].textContent,'Tentar novamente');assert.equal(agenda.attributes['aria-busy'],'false');assert.equal(h.elements.get('#local-name').textContent,'Clínica A');
});
test('local sem equipe mantém contatos e explica indisponibilidade',async()=>{
  const h=harness({noTeam:true});await run(h);assert.equal(h.elements.get('#local-content').hidden,true);assert.match(h.elements.get('#local-status').textContent,/ainda não tem profissionais/);assert.equal(h.elements.get('#local-contact').hidden,false);
});
