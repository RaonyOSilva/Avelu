require('dotenv').config();
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{randomUUID,randomBytes,createHash}=require('node:crypto'),pool=require('../db');
test('login destination cannot cross account modules',()=>{
 const {loginDestination,home}=require('../access-policy');
 for(const role of ['paciente','profissional','equipe','administrador']){
  for(const target of ['/agendamentos.html','/profissional.html','/atendimento.html','/admin.html']){
   const result=loginDestination({role},target);
   assert.equal(result,target===home({role})||(role==='administrador'&&target==='/atendimento.html')?target:home({role}));
  }
  assert.equal(loginDestination({role},'https://example.com'),home({role}));
 }
});
test('strict module isolation despite legacy management grants',{timeout:30000},async()=>{
 const ids=[];let child,base,place;
 try{
  child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'0',NODE_ENV:'test',APP_ORIGIN:''},stdio:['ignore','pipe','pipe']});
  base=await new Promise((resolve,reject)=>{child.once('error',reject);child.stdout.on('data',b=>{const m=b.toString().match(/http:\/\/localhost:\d+/);if(m)resolve(m[0]);});});
  const accounts={};
  for(const role of ['paciente','profissional','equipe','administrador']){
   const [u]=await pool.execute('INSERT INTO usuarios(tipo,nome_completo,email,senha_hash) VALUES (?,?,?,?)',[role,'Access test',randomUUID()+'@example.invalid','TEST']);ids.push(u.insertId);
   const token=randomBytes(32).toString('hex');await pool.execute('INSERT INTO sessoes(usuario_id,token_hash,expira_em) VALUES (?,?,NOW()+INTERVAL 1 HOUR)',[u.insertId,createHash('sha256').update(token).digest('hex')]);accounts[role]={id:u.insertId,cookie:'avelu_session='+token};
  }
  const [p]=await pool.execute("INSERT INTO locais_atendimento(nome,tipo,endereco,cidade,estado) VALUES ('Access test','clinica','Test','Test','MG')");place=p.insertId;
  for(const role of ['paciente','profissional','equipe'])await pool.execute('INSERT INTO gestao_acessos(usuario_id,local_id) VALUES (?,?)',[accounts[role].id,place]);
  await pool.execute("INSERT INTO perfis_profissionais(usuario_id,titulo_profissional) VALUES (?,'Test')",[accounts.profissional.id]);
  const request=(role,url,body)=>fetch(base+url,{redirect:'manual',method:body?'POST':'GET',headers:{Cookie:accounts[role].cookie,Origin:base,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  for(const [role,allowed] of [['paciente','appointments'],['profissional','professional/account'],['equipe','team/context'],['administrador','admin/users']]){
   for(const api of ['appointments','professional/account','team/context','admin/users']){
    const r=await request(role,'/api/'+api);assert.equal(r.status,api===allowed||(role==='administrador'&&api==='team/context')?200:403,role+' '+api);
   }
  }
  const me=await (await request('paciente','/api/auth/me')).json();assert.equal(me.user.canManage,false);
  for(const page of ['atendimento.html','profissional.html','admin.html','consulta.html','programacao.html']){
   const r=await request('paciente','/'+page);assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/agendamentos.html');
  }
  assert.equal((await request('administrador','/api/admin/team-access',{email:await (async()=>{const [r]=await pool.execute('SELECT email FROM usuarios WHERE id=?',[accounts.paciente.id]);return r[0].email;})(),tipo:'local',escopo_id:place})).status,400);
  assert.equal((await request('paciente','/api/admin/users/'+accounts.paciente.id+'/role',{role:'equipe'})).status,403);
  assert.equal((await request('administrador','/api/admin/users/'+accounts.paciente.id+'/role',{role:'equipe'})).status,200);
  assert.equal((await request('paciente','/api/team/context')).status,401);
 }finally{
  if(child){const stopped=new Promise(r=>child.once('exit',r));child.kill();await stopped;}
  for(const id of ids){await pool.execute('DELETE FROM administracao_eventos WHERE usuario_id=? OR alvo_id=?',[id,id]);await pool.execute('DELETE FROM gestao_acessos WHERE usuario_id=?',[id]);await pool.execute('DELETE FROM perfis_profissionais WHERE usuario_id=?',[id]);await pool.execute('DELETE FROM usuarios WHERE id=?',[id]);}
  if(place)await pool.execute('DELETE FROM locais_atendimento WHERE id=?',[place]);await pool.end();
 }
});
