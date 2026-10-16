const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.value='';this.textContent='';this.className='';this.attributes={};}
 append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}setAttribute(k,v){this.attributes[k]=v;}scrollIntoView(){}reportValidity(){return true;}reset(){}after(){}
 querySelector(selector){return this.children.find(x=>selector.startsWith('.')?x.className===selector.slice(1):x.tagName===selector.toUpperCase())||this.children.map(x=>x.querySelector?.(selector)).find(Boolean)||null;}
}
const all=e=>[e,...e.children.flatMap(all)];
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};

test('patient dashboard filters appointments and loads records only on demand',async()=>{
 const created=[];
 class E extends Element{constructor(tag){super(tag);created.push(this);}before(){}addEventListener(k,fn){this[k]=fn;}showModal(){this.open=true;}close(){this.open=false;}}
 const list=new E('div'),body=new E('body'),heading=new E('h1');
 const cards=new Map([1,2,3].map(id=>['agendamento-'+id,new E('article')]));
 const document={body,querySelector:s=>s==='#appointments'?list:s==='main h1'?heading:null,getElementById:id=>cards.get(id),createElement:t=>new E(t)};
 const requests=[],window={print(){}};
 vm.runInNewContext(fs.readFileSync('patient-tools.js','utf8'),{document,window,AbortSignal,Intl,Date,fetch:async url=>{requests.push(url);return {ok:true,json:async()=>({paciente:'Ana',profissional:'Doctor',inicio_em:'2025-01-01T10:00:00-03:00',evolucao:'<script>private</script>',receita:'',local_nome:'Clinic'})};}});
 window.organizePatientDashboard([{id:1,status:'confirmado',name:'Doctor',fim_em:'2099-01-01'},{id:2,status:'agendado',name:'Other',fim_em:'2099-01-01'},{id:3,status:'concluido',name:'Doctor',fim_em:'2025-01-01'}]);
 assert.equal(cards.get('agendamento-1').hidden,false);assert.equal(cards.get('agendamento-3').hidden,true);
 created.find(e=>e.className==='patient-stat'&&e.children[1].textContent==='Aguardando confirmação').onclick();
 assert.equal(cards.get('agendamento-1').hidden,true);assert.equal(cards.get('agendamento-2').hidden,false);
 created.find(e=>e.textContent==='Prontuário').onclick();assert.equal(cards.get('agendamento-3').hidden,false);
 assert.equal(requests.length,0);
 await cards.get('agendamento-3').children[0].onclick();
 assert.deepEqual(requests,['/api/appointments/3/record']);
 assert.ok(created.some(e=>e.textContent==='<script>private</script>'));
});
test('novos painéis mostram informações e ações sem transformar conteúdo em HTML',async()=>{
 const fixtures={
 '/api/team/context':{places:[{id:1,name:'Unidade A'}]},
 '/api/team/patients?q=':{items:[{id:1,nome:'Ana <script>',telefone:'33999991234',email:'ana@example.invalid',usuario_id:null}]},
 '/api/team/communications':[{id:1,paciente:'Ana',profissional:'Médico',inicio_em:'2035-01-02T10:00:00-03:00',agendamento_status:'confirmado',whatsapp:{url:'https://wa.me/5533999991234?text=Teste'}}],
 '/api/admin/operations?periodo=futuro':{counts:{livres:10,ocupados:2},bookings:[],units:[],empty:[],readiness:{monitor:{failures:0}}},
 '/api/admin/users?q=':[{id:1,nome:'Equipe',email:'equipe@example.invalid',tipo:'paciente',ativo:true}],
 '/api/admin/team-access':[{id:1,email:'equipe@example.invalid',escopo:'Unidade A'}],
 '/api/admin/audit':{agenda:[],users:[]},
 '/api/admin/place-settings':[{id:1,nome:'Unidade A',orientacoes:'Trazer documento',convenios:'Plano A',particular:1}]
 };
 for(const tab of ['pacientes','comunicacao','indicadores','usuarios','auditoria','unidades']){
 const els=new Map(),get=k=>{if(!els.has(k))els.set(k,new Element());return els.get(k);};
 const context=vm.createContext({document:{querySelector:get,createElement:t=>new Element(t)},location:{search:'?aba='+tab,pathname:'/operacao.html',assign(){}},URLSearchParams,AbortSignal,Date,confirm:()=>false,fetch:async url=>{assert.ok(url in fixtures,url);return {ok:true,status:200,json:async()=>fixtures[url]};}});
 vm.runInContext(fs.readFileSync('operations-ui.js','utf8'),context);await settle();assert.equal(get('#op-message').textContent,'',tab);assert.ok(get('#op-content').children.length>0,tab);
 if(tab==='pacientes')assert.ok(all(get('#op-content')).some(e=>e.textContent==='Ana <script>'));
 if(tab==='comunicacao'){const link=all(get('#op-content')).find(e=>e.tagName==='A');assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');}
 }
});
test('cartão do paciente oferece mapa codificado, orientações e calendário apenas para reservas ativas',()=>{
 const context=vm.createContext({document:{querySelector:()=>null,createElement:t=>new Element(t)},window:{},fetch(){throw Error('não deve consultar até abrir histórico');},URL,Date,Blob,setTimeout});vm.runInContext(fs.readFileSync('patient-tools.js','utf8'),context);
 const card=new Element();context.window.enhanceAppointment(card,{id:1,status:'confirmado',name:'Médico',local_endereco:'Rua A & B, 10',contato:'(33) 3333-4444',orientacoes:'Trazer documento',inicio_em:'2035-01-02T10:00:00-03:00',fim_em:'2035-01-02T10:30:00-03:00'});
 assert.ok(all(card).some(e=>e.textContent==='Adicionar ao calendário'));const map=all(card).find(e=>e.textContent==='Como chegar');assert.equal(new URL(map.href).searchParams.get('query'),'Rua A & B, 10');assert.ok(all(card).some(e=>e.textContent==='Trazer documento'));
 const cancelled=new Element();context.window.enhanceAppointment(cancelled,{id:1,status:'cancelado'});assert.ok(!all(cancelled).some(e=>e.textContent==='Adicionar ao calendário'));
});
