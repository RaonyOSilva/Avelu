const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../buscar.js'),'utf8');
function harness({missingCity=false,blockedHistory=false,offline=false,restore=false}={}){
  class Element{
    constructor(){this.value='';this.children=[];this.options=this.children;this.listeners={};this.attributes={};}
    append(...items){this.children.push(...items);}
    replaceChildren(...items){this.children.splice(0,this.children.length,...items);}
    setAttribute(key,value){this.attributes[key]=value;}
    addEventListener(key,fn){this.listeners[key]=fn;}
  }
  const form=new Element();form.elements={q:new Element(),tipo:new Element()};
  if(!missingCity)form.elements.city=new Element();
  form.insertBefore=field=>{form.elements.city=field.children.find(item=>item.name==='city');};
  const elements=new Map([['#browse-form',form]]);
  const document={createElement:()=>new Element(),querySelectorAll:()=>[],querySelector:key=>{if(!elements.has(key))elements.set(key,new Element());return elements.get(key);}};
  const requests=[];
  let scrolled=null;const location={pathname:'/buscar.html',search:''};const stored={};const window={scrollY:250,scrollTo:(x,y)=>{scrolled=y;}};
  const context=vm.createContext({document,location,window,requestAnimationFrame:fn=>fn(),sessionStorage:{getItem:key=>stored[key]||null,setItem:(key,value)=>{stored[key]=value;}},URLSearchParams,AbortSignal,Intl,console,history:{replaceState(_state,_title,url){if(blockedHistory)throw new Error('SecurityError');location.search=url.slice(url.indexOf('?'));if(restore)stored['avelu-search']=JSON.stringify({url:location.pathname+location.search,scroll:320});}},fetch:async url=>{
    requests.push(url);if(offline)throw new Error('offline');
    const data=url.includes('/cities')?[{cidade:'Cidade teste',uf:'MG'}]:url.includes('/auth/')?{user:null}:[{id:1,nome:'Clínica teste',tipo:'clinica',cidade:'Cidade teste',estado:'MG',endereco:'Rua A',atendimentos:[]}];
    return {ok:true,headers:{get:()=> 'application/json'},json:async()=>data};
  }});
  return {context,form,elements,requests,stored,scrolled:()=>scrolled};
}
test('busca recupera campo cidade ausente no HTML antigo',async()=>{
  const h=harness({missingCity:true});vm.runInContext(code,h.context);await vm.runInContext('load()',h.context);
  assert.ok(h.form.elements.city);assert.ok(h.requests.some(url=>url.startsWith('/api/places?')));
  assert.match(h.elements.get('#results-status').textContent,/1 opção encontrada/);
  assert.equal(h.elements.get('#results').attributes['aria-busy'],'false');
});
test('restrição ao atualizar URL não bloqueia resultados',async()=>{
  const h=harness({blockedHistory:true});vm.runInContext(code,h.context);await vm.runInContext('load()',h.context);
  assert.match(h.elements.get('#results-status').textContent,/1 opção encontrada/);
});
test('API indisponível encerra carregamento e oferece nova tentativa',async()=>{
  const h=harness({offline:true});vm.runInContext(code,h.context);await vm.runInContext('load()',h.context);
  assert.equal(h.elements.get('#results-status').textContent,'Não foi possível carregar');
  assert.equal(h.elements.get('#results').attributes['aria-busy'],'false');
  assert.equal(h.elements.get('#results').children[0].children[2].textContent,'Tentar novamente');
});

test('voltar do perfil restaura filtros e posição da busca',async()=>{
 const h=harness({restore:true});vm.runInContext(code,h.context);await vm.runInContext('load()',h.context);
 assert.equal(h.scrolled(),320);assert.equal(h.form.elements.city.value,JSON.stringify(['Cidade teste','MG']));
 h.elements.get('#results').listeners.click({target:{closest:()=>true}});
 const saved=JSON.parse(h.stored['avelu-search']);assert.equal(saved.scroll,250);assert.match(saved.url,/cidade=Cidade\+teste/);
});
