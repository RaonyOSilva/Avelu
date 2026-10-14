
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('editor salva antes de imprimir e separa receita da evolução',async()=>{
 class E{
 constructor(){this.children=[];this.listeners={};this.value='';this.textContent='';}
 append(...e){this.children.push(...e)}replaceChildren(...e){this.children=e}insertBefore(e,b){this.children.splice(this.children.indexOf(b),0,e)}
 addEventListener(t,f){this.listeners[t]=f}showModal(){this.open=true}close(){this.open=false}focus(){}
 }
 const elements=new Map(),get=k=>{if(!elements.has(k))elements.set(k,new E());return elements.get(k)};
 let prints=0,fail=false,saved={evolucao:'',receita:'',versao:0,finalizado_em:null},status='confirmado';
 const requests=[],appointment={paciente:'Paciente Teste',profissional:'Profissional Teste',titulo_profissional:'Médico',numero_registro:'Registro de teste',inicio_em:'2020-01-01T08:00:00-03:00',local:'Clínica',status};
 const context=vm.createContext({document:{querySelector:get,createElement:()=>new E()},URLSearchParams,AbortSignal,Intl,Date,clearTimeout,setTimeout,location:{search:'?id=1',assign(){}},window:{addEventListener(){},print(){prints++;}},fetch:async(url,options)=>{
 requests.push({url,options});
 if(options.body){
 if(fail)return{ok:false,status:409,json:async()=>({error:'Conflito de versão'})};
 const b=JSON.parse(options.body);saved={...b,versao:saved.versao+1,finalizado_em:b.finalizar?'2020-01-01T09:00:00-03:00':null};status=b.finalizar?'concluido':'confirmado';
 }
 return{ok:true,status:200,json:async()=>options.body?{record:saved,status}:{appointment,record:saved}};
 }});
 // No navegador, window é o objeto global: funções globais não podem sobrescrever window.print.
 const nativePrint=context.window.print;
 context.addEventListener=context.window.addEventListener;
 context.print=nativePrint;
 context.window=context;
 vm.runInContext(fs.readFileSync('consulta.js','utf8'),context);
 assert.equal(context.print,nativePrint);
 const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r))};await settle();
 get('#evolution').value='Evolução confidencial\nSegunda linha';
 get('#prescription').value='<script>texto literal</script>\nOrientações da receita';
 await get('#print-prescription').listeners.click();
 const text=e=>e.textContent+' '+e.children.map(text).join(' ');
 assert.equal(prints,1);assert.equal(get('#print-document').children.length,1);
 assert.ok(!text(get('#print-document')).includes('Evolução confidencial'));
 assert.ok(text(get('#print-document')).includes('<script>texto literal</script>'));
 assert.equal(saved.evolucao,get('#evolution').value);
 await get('#print-all').listeners.click();assert.equal(prints,2);assert.equal(get('#print-document').children.length,2);
 assert.ok(text(get('#print-document')).includes('Evolução confidencial'));
 fail=true;await get('#print-all').listeners.click();assert.equal(prints,2);assert.match(get('#message').textContent,/Conflito/);
 fail=false;get('#finish').listeners.click();assert.equal(get('#finish-dialog').open,true);
 await get('#finish-confirm').listeners.click();assert.equal(status,'concluido');assert.equal(get('#evolution').readOnly,true);assert.equal(get('#save').hidden,true);
 const n=requests.length;await get('#print-all').listeners.click();assert.equal(requests.length,n);assert.equal(prints,3);
});

test('autosave preserva digitação durante gravação e interrompe tentativas em conflito',async()=>{
 class E{constructor(){this.children=[];this.listeners={};this.value='';this.textContent='';}append(...e){this.children.push(...e)}replaceChildren(...e){this.children=e}addEventListener(t,f){this.listeners[t]=f}}
 const elements=new Map(),get=k=>{if(!elements.has(k))elements.set(k,new E());return elements.get(k)},timers=new Map();
 let timerId=0,release,conflict=false;
 const context=vm.createContext({document:{querySelector:get,createElement:()=>new E()},URLSearchParams,AbortSignal,Intl,Date,location:{search:'?id=1',assign(){}},window:{addEventListener(){}},setTimeout:f=>{timers.set(++timerId,f);return timerId},clearTimeout:id=>timers.delete(id),fetch:async(url,options)=>{
 if(!options.body)return{ok:true,status:200,json:async()=>({appointment:{status:'confirmado',inicio_em:'2026-10-14T12:00:00-03:00'},record:{versao:0,evolucao:'',receita:''},history:[]})};
 const b=JSON.parse(options.body);await new Promise(r=>release=r);
 return{ok:!conflict,status:conflict?409:200,json:async()=>conflict?{error:'Outra aba alterou o registro.'}:{record:{...b,versao:b.versao+1},status:'confirmado'}};
 }});
 vm.runInContext(fs.readFileSync('consulta.js','utf8'),context);
 const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r))};await settle();
 get('#evolution').value='Primeira anotação';get('#record-form').listeners.input();
 assert.equal(timers.size,1);
 const initial=vm.runInContext('save(false,true)',context);await settle();
 assert.equal(get('#evolution').readOnly,false);
 get('#evolution').value='Texto novo durante o envio';get('#record-form').listeners.input();release();await initial;
 assert.equal(get('#evolution').value,'Texto novo durante o envio');assert.equal(vm.runInContext('dirty',context),true);assert.equal(vm.runInContext('record.versao',context),1);
 const second=vm.runInContext('save(false,true)',context);await settle();release();await second;
 assert.equal(vm.runInContext('dirty',context),false);
 get('#evolution').value='Preservar este texto';get('#record-form').listeners.input();conflict=true;
 const third=vm.runInContext('save(false,true)',context);await settle();release();await third;
 assert.equal(timers.size,0);assert.equal(get('#evolution').value,'Preservar este texto');assert.equal(vm.runInContext('dirty',context),true);
 assert.match(get('#save-status').textContent,/Não foi possível salvar/);
});
