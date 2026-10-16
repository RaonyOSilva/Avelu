const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
async function render(user,{offline=false,ok=true}={}){
 const links=['professional','team'].map(access=>({dataset:{access},hidden:true}));
 const account={href:'entrar.html',textContent:'Entrar'};
 const signup={removed:false,remove(){this.removed=true;}};
 const document={querySelector:()=>null,querySelectorAll:selector=>selector==='[data-access]'?links:selector==='a[href="entrar.html"]'?[account]:[signup]};
 vm.runInNewContext(code,{document,navigator:{},fetch:async()=>{if(offline)throw Error('offline');return {ok,json:async()=>({user})};}});
 await new Promise(resolve=>setImmediate(resolve));
 return {visible:links.map(link=>!link.hidden),account,signup};
}
for(const [name,user,visible,destination] of [
 ['visitante',null,[false,false],'entrar.html'],
 ['cliente',{role:'paciente'},[false,false],'agendamentos.html'],
 ['secretaria',{role:'equipe',canManage:true},[false,false],'entrar.html'],
 ['profissional',{role:'profissional',isProfessional:true},[false,false],'entrar.html'],
 ['profissional com equipe',{role:'profissional',isProfessional:true,canManage:true},[false,false],'entrar.html'],
 ['administrador',{role:'administrador',canManage:true},[false,false],'entrar.html'],
 ['administrador profissional',{role:'administrador',isProfessional:true,canManage:true},[false,false],'entrar.html']
]){
 test('menus respeitam acesso: '+name,async()=>{
 const result=await render(user);
 assert.deepEqual(result.visible,visible);
 assert.equal(result.account.href,destination);
 assert.equal(result.signup.removed,user?.role==='paciente');
 });
}
test('falha de sessão mantém entradas restritas ocultas',async()=>{
 for(const options of [{offline:true},{ok:false}])assert.deepEqual((await render(null,options)).visible,[false,false]);
});
test('HTML oculta links restritos antes de resolver sessão',()=>{
 const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
 for(const page of ['profissional.html','atendimento.html'])assert.ok(!html.includes('href="'+page+'"'));
});
