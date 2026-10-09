const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../conta.js'),'utf8');
function harness(){
 class Element{constructor(){this.children=[];this.listeners={};this.hidden=false;this.textContent='';}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}setAttribute(){}addEventListener(type,fn){this.listeners[type]=fn;}querySelector(){return submit;}}
 const submit=new Element(),elements=new Map();const get=key=>{if(!elements.has(key))elements.set(key,new Element());return elements.get(key);};
 const form=get('#booking-form');form.selected='72';let destination;const requests=[];
 const context=vm.createContext({document:{body:{dataset:{page:'booking'}},querySelector:get,createElement:()=>new Element()},location:{origin:'http://localhost:3000',search:'?profissional=9&local=4&horario=72&remarcar=15',assign:value=>{destination=value;}},URL,URLSearchParams,AbortSignal,Intl,Date,FormData:class{constructor(f){this.form=f;}get(){return this.form.selected;}},fetch:async url=>{requests.push(url);return {ok:true,json:async()=>url.includes('/availability')?{professional:{id:9,name:'Profissional teste',specialty:'Ortopedia'},slots:[{id:72,inicio_em:'2030-01-02T12:00:00.000Z',local_nome:'Clínica A',local_endereco:'Rua A, 10',valor:'150.00'}]}:{user:null}};}});
 return {context,elements,form,requests,destination:()=>destination};
}
test('horário mostra endereço e valor e conserva contexto ao pedir login',async()=>{
 const h=harness();vm.runInContext(code,h.context);for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.ok(h.requests.includes('/api/professionals/9/availability?local=4'));assert.equal(h.form.hidden,false);
 const review=h.elements.get('#booking-review');assert.equal(review.hidden,false);const text=review.children.map(e=>e.textContent).join(' ');assert.match(text,/Clínica A/);assert.match(text,/Rua A, 10/);assert.match(text,/150,00/);assert.match(text,/mantido/);
 await h.form.listeners.submit({preventDefault(){}});const login=new URL(h.destination(),'http://localhost:3000');const target=new URL(login.searchParams.get('next'),'http://localhost:3000');assert.equal(target.searchParams.get('local'),'4');assert.equal(target.searchParams.get('horario'),'72');assert.equal(target.searchParams.get('remarcar'),'15');
});
