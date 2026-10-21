require('./require-test-database');
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{once}=require('node:events');
const pool=require('../db');
test('C3 invitation lifecycle and access with real disposable MySQL',{timeout:60000},async t=>{
 const mail=[],logs=[];const origin='https://tests.example.invalid';
 const child=spawn(process.execPath,['--require','./tests/fixtures/invitation-mail.js','server.js'],{env:{...process.env,PORT:'0',NODE_ENV:'test',APP_ENV:'test',HOMOLOGATION_MODE:'true',INVITE_ONLY:'true',APP_ORIGIN:origin,RESEND_API_KEY:'test-only',MAIL_FROM:'noreply@example.invalid',HOMOLOGATION_PROFESSIONAL_IDS:'',HOMOLOGATION_PLACE_IDS:''},stdio:['ignore','pipe','pipe','ipc']});
 child.on('message',m=>{if(m.type==='invitation-mail')mail.push(m.body);});child.stderr.on('data',b=>logs.push(String(b)));
 const base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server start timeout')),10000);child.once('error',reject);child.once('exit',()=>{clearTimeout(timer);reject(Error('Server exited'));});child.stdout.on('data',b=>{logs.push(String(b));const m=String(b).match(/http:\/\/localhost:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});});
 const request=async(path,body,cookie,requestOrigin=origin)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:requestOrigin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual'});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data,text,headers:r.headers,cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 let admin;const password='Fictitious password 123!';
 const registration=(email,token,extra={})=>({name:'Convidado fictício',email,password,invitationToken:token,...extra});
 async function invite(label,role='paciente'){
  const email=label+'@example.invalid';const r=await request('/api/admin/invitations',{email,role},admin);assert.equal(r.status,201);
  const sent=mail.find(m=>m.to[0]===email);assert.ok(sent);const token=sent.text.match(/#convite=([a-f0-9]{64})/)[1];assert.ok(!JSON.stringify(r.data).includes(token));return {email,token,id:r.data.id};
 }
 try{
  const login=await request('/api/auth/login',{email:process.env.C3_ADMIN_EMAIL,password:process.env.C3_ADMIN_PASSWORD});assert.equal(login.status,200);admin=login.cookie;
  await t.test('banner, robots, catalog and protected endpoints',async()=>{
   const home=await request('/');assert.ok(home.text.includes('AVELU — HOMOLOGAÇÃO | Ambiente de testes. Não utilize dados reais.'));assert.ok(home.headers.get('x-robots-tag').includes('noindex'));
   assert.ok((await request('/robots.txt')).text.includes('Disallow: /'));
   assert.deepEqual((await request('/api/professionals')).data,[]);
   assert.equal((await request('/api/profiles/profissional/1')).status,404);
   for(const url of ['/api/admin/invitations','/api/team/context','/api/professional/context','/api/appointments'])assert.equal((await request(url)).status,401);
  });
  await t.test('no invite and CSRF fail; administrator cannot invite administrator',async()=>{
   assert.equal((await request('/api/auth/register',registration('without@example.invalid'))).status,400);
   assert.equal((await request('/api/admin/invitations',{email:'bad@example.invalid',role:'paciente'},admin,'https://evil.invalid')).status,403);
   assert.equal((await request('/api/admin/invitations',{email:'admin2@example.invalid',role:'administrador'},admin)).status,400);
  });
  await t.test('valid invitation proves email, binds role, logs no token and can be used once',async()=>{
   const v=await invite('patient');
   assert.equal((await request('/api/auth/register',registration('different@example.invalid',v.token))).status,400);
   assert.equal((await request('/api/auth/register',registration(v.email,v.token,{role:'administrador'}))).status,400);
   const r=await request('/api/auth/register',registration(v.email,v.token));assert.equal(r.status,201);assert.equal(r.data.user.role,'paciente');
   assert.ok(r.headers.get('set-cookie').toLowerCase().includes('httponly'));assert.ok(r.headers.get('set-cookie').toLowerCase().includes('samesite=lax'));
   assert.deepEqual((await request('/api/appointments',undefined,r.cookie)).data,[]);
   assert.equal((await request('/api/admin/invitations',undefined,r.cookie)).status,403);
   assert.equal((await request('/api/team/context',undefined,r.cookie)).status,403);
   assert.equal((await request('/api/professional/context',undefined,r.cookie)).status,403);
   assert.equal((await request('/api/auth/register',registration(v.email,v.token))).status,400);
   assert.equal((await request('/api/auth/me',undefined,r.cookie)).data.user.email,v.email);
   assert.equal((await request('/api/auth/logout',{},r.cookie)).status,200);
   assert.equal((await request('/api/auth/me',undefined,r.cookie)).data.user,null);
   assert.equal((await request('/api/auth/login',{email:v.email,password})).status,200);
   assert.ok(!logs.join('').includes(v.token));assert.ok(!(await request('/api/admin/invitations',undefined,admin)).text.includes(v.token));
   const [[stored]]=await pool.execute('SELECT token_hash,utilizado_em FROM convites WHERE id=?',[v.id]);assert.notEqual(stored.token_hash,v.token);assert.ok(stored.utilizado_em);
  });
  await t.test('expired, revoked and concurrent/reused invitations',async()=>{
   const expired=await invite('expired');await pool.execute('UPDATE convites SET expira_em=NOW()-INTERVAL 1 MINUTE WHERE id=?',[expired.id]);assert.equal((await request('/api/auth/register',registration(expired.email,expired.token))).status,400);
   const revoked=await invite('revoked');assert.equal((await request('/api/admin/invitations/'+revoked.id+'/revoke',{},admin)).status,200);assert.equal((await request('/api/auth/register',registration(revoked.email,revoked.token))).status,400);
   const race=await invite('race');const results=await Promise.all([request('/api/auth/register',registration(race.email,race.token)),request('/api/auth/register',registration(race.email,race.token))]);assert.deepEqual(results.map(r=>r.status).sort(),[201,400]);
  });
  await t.test('professional and team roles remain confined and team starts without grants',async()=>{
   for(const role of ['profissional','equipe']){
    const v=await invite('invited-'+role,role);const r=await request('/api/auth/register',registration(v.email,v.token));assert.equal(r.status,201);assert.equal(r.data.user.role,role);
    assert.equal((await request('/api/admin/invitations',undefined,r.cookie)).status,403);assert.equal((await request('/api/appointments',undefined,r.cookie)).status,403);
    const forbidden=role==='profissional'?'/api/team/context':'/api/professional/context';assert.equal((await request(forbidden,undefined,r.cookie)).status,403);
    if(role==='profissional'){
     const [[foreign]]=await pool.query("SELECT id FROM agendamentos WHERE status='confirmado' LIMIT 1");assert.ok(foreign);
     assert.equal((await request('/api/consultations/'+foreign.id,undefined,r.cookie)).status,404);
     assert.deepEqual((await request('/api/professional/scheduled',undefined,r.cookie)).data.slots,[]);
    }
    if(role==='equipe'){const [[grants]]=await pool.execute('SELECT COUNT(*) AS total FROM gestao_acessos WHERE usuario_id=?',[r.data.user.id]);assert.equal(grants.total,0);}
   }
  });
  await t.test('delivery failure revokes token and pre-created professional can accept invitation',async()=>{
   assert.equal((await request('/api/admin/invitations',{email:'mail-failure@example.invalid',role:'paciente'},admin)).status,503);
   const [[failure]]=await pool.execute('SELECT revogado_em,enviado_em FROM convites WHERE email=?',['mail-failure@example.invalid']);assert.ok(failure.revogado_em);assert.equal(failure.enviado_em,null);
   const [u]=await pool.execute("INSERT INTO usuarios(tipo,nome_completo,email,senha_hash) VALUES ('profissional','Fictício','pre-created@example.invalid','CADASTRO_ADMINISTRATIVO_SEM_LOGIN')");
   const [p]=await pool.execute("INSERT INTO perfis_profissionais(usuario_id,titulo_profissional) VALUES (?,'Teste')",[u.insertId]);
   const v=await invite('pre-created','profissional');const r=await request('/api/auth/register',registration(v.email,v.token));assert.equal(r.status,201);assert.equal(r.data.user.id,u.insertId);
   const [[profile]]=await pool.execute('SELECT id FROM perfis_profissionais WHERE usuario_id=?',[u.insertId]);assert.equal(profile.id,p.insertId);
  });
  await t.test('abuse limit refuses repeated registration attempts',async()=>{
   let last;for(let i=0;i<17;i++)last=await request('/api/auth/register',registration('limited@example.invalid'));
   assert.equal(last.status,429);assert.ok(last.headers.get('retry-after'));
  });
 }finally{const exit=once(child,'exit');child.kill();await exit;await pool.end();}
});
