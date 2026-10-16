
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('painel abre hoje e abre registro sem concluir automaticamente',async()=>{
 class Element{
 constructor(){this.children=[];this.listeners={};this.dataset={};this.attributes={};this.value='';this.textContent='';}
 append(...e){this.children.push(...e)} replaceChildren(...e){this.children=e} addEventListener(t,f){this.listeners[t]=f}
 setAttribute(k,v){this.attributes[k]=v} getAttribute(k){return this.attributes[k]} reportValidity(){return true} reset(){} showModal(){this.open=true} close(){this.open=false}
 }
 const elements=new Map(),get=k=>{if(!elements.has(k))elements.set(k,new Element());return elements.get(k)};
 const tabs=['confirmado','concluido','cancelled'].map(v=>{const e=new Element();e.dataset.view=v;return e});
 const modes=['day','all'].map(v=>{const e=new Element();e.dataset.mode=v;return e});get('#day').parentElement=new Element();
 const currentDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const slots=[{id:1,agendamento_id:2,paciente:'Ana',local:'Clínica A',inicio_em:currentDay+'T23:58:00-03:00',agendamento_status:'confirmado'},{id:2,paciente:'Não confirmado',agendamento_status:'agendado'},{id:3,agendamento_status:null},{id:4,paciente:'Já realizado',local:'Clínica A',inicio_em:'2020-01-01T07:00:00-03:00',agendamento_status:'concluido'}];
 let destination;const calls=[];const context=vm.createContext({document:{querySelector:get,querySelectorAll:s=>s==='[data-view]'?tabs:s==='[data-mode]'?modes:[],createElement:()=>new Element()},Intl,Date,URLSearchParams,AbortSignal,location:{replace(){},assign(v){destination=v;}},fetch:async(url,options)=>{
 calls.push({url,options});
 if(url.includes('/state'))slots[0].agendamento_status=JSON.parse(options.body).status;
 return{ok:true,status:200,json:async()=>url.endsWith('/context')?{user:{name:'Doutor'},places:[]}:url.includes('/scheduled?')?{slots:slots.filter(s=>s.agendamento_status==='confirmado'),summary:{total:1,days:1,places:1},hasMore:false}:{slots,cancelled:[]}};
 }});
 vm.runInContext(fs.readFileSync('profissional.js','utf8'),context);
 const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r))};await settle();
 assert.equal(get('#day').value,new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
 assert.equal(get('#patients').children.length,1);assert.equal(get('#remaining').textContent,1);assert.equal(get('#progress').value,1);assert.equal(get('#progress').max,2);
 const actions=get('#patients').children[0].children.at(-1);assert.equal(actions.children[0].textContent,'Realizar atendimento');
 assert.equal(actions.children[0].disabled,false);
 slots[0].inicio_em='2035-01-20T08:00:00-03:00';tabs[0].listeners.click();assert.equal(get('#patients').children[0].children.at(-2).children[0].disabled,true);
 slots[0].inicio_em='2020-01-01T08:00:00-03:00';tabs[0].listeners.click();assert.equal(get('#patients').children[0].children.at(-2).children[0].disabled,true);
 slots[0].inicio_em=currentDay+'T23:58:00-03:00';tabs[0].listeners.click();
 await actions.children[0].listeners.click();assert.equal(destination,'consulta.html?id=2');
 assert.equal(get('#remaining').textContent,1);assert.ok(!calls.some(c=>c.url.includes('/state')));
 tabs[1].listeners.click();assert.equal(get('#patients').children.length,1);
 get('#day').value='2035-01-20';await get('#filters').listeners.change();assert.ok(calls.at(-1).url.includes('dia=2035-01-20'));
 modes[1].listeners.click();await settle();
 assert.ok(calls.at(-1).url.includes('/scheduled?'));assert.ok(!calls.at(-1).url.includes('dia='));
 assert.equal(get('#day').parentElement.hidden,true);assert.equal(get('#all-summary').children.length,3);
 assert.equal(get('#patients').children[0].className,'scheduled-day');assert.equal(get('#all-next').disabled,true);
 modes[0].listeners.click();await settle();assert.equal(get('#day').parentElement.hidden,false);
 assert.ok(!calls.some(c=>c.url.includes('/availability')));
});
