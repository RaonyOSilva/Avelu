const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createHarness}=require('./fixtures/app-isolated');
const {resources}=require('../resource-manifest'),{evaluate}=require('../capability-control'),{loadFeatures}=require('../feature-config');
const concrete=p=>p.replace(/:[a-zA-Z][a-zA-Z0-9_]*/g,'123');
const roles=['anonymous','paciente','profissional','equipe','administrador'];

test('real server mounting: all 93 pairs, five fixture identities, methods/aliases/variants deny before handlers and SQL',async()=>{
 const h=await createHarness();
 try{
  const routes=resources.filter(r=>r.kind==='api');assert.equal(routes.length,93);
  for(const resource of routes)for(const role of roles){
   const url=concrete(resource.path);
   const variants=[[resource.method,url],[resource.method,url.toUpperCase()+'/?aba=usuarios'],['HEAD',url],['OPTIONS',url],['PATCH',url]];
   for(const [method,target] of variants){
    // Logout is itself part of the inventory; restore the independent fixture
    // session before each case so later denials also carry valid credentials.
    if(role!=='anonymous')h.sessions.set(require('node:crypto').createHash('sha256').update(h.cookies[role].split('=')[1]).digest('hex'),h.users.find(u=>u.role===role).id);
    const before={sql:h.events.sql.length,handlers:h.events.handlers.length};
    const response=await h.request(method,target,role);
    if(!evaluate(method,target,h.features).allowed){
     assert.equal(response.status,404,method+' '+target+' '+role);
     assert.equal(response.headers.allow,undefined);assert.equal(response.headers.location,undefined);assert.equal(response.headers['cache-control'],'no-store');
     assert.equal(h.events.sql.length,before.sql,'No SQL for closed '+target);assert.equal(h.events.handlers.length,before.handlers,'No route handler for '+target);
     if(method==='HEAD')assert.equal(response.body,'');else if(/^\/api(?:\/|$)/i.test(target))assert.deepEqual(JSON.parse(response.body),{error:'Recurso não encontrado.'});else assert.equal(response.body,'Página não encontrada.');
    }else assert.ok(response.status<500,'technical route '+target);
    assert.ok(response.headers['content-security-policy']);assert.equal(response.headers['x-content-type-options'],'nosniff');assert.ok(response.headers['x-request-id']);
   }
  }
 }finally{await h.close();}
});
test('mounted guard precedes early homologation, parser, pages/assets and fallbacks; worker never starts',async()=>{
 const h=await createHarness({},true);
 try{
  assert.equal(h.events.backup,1,'backup starts independently of B/C');
  assert.ok(h.events.timers.includes(60000),'authentication limiter cleanup retained');
  // Route modules may import the inert service; no timer factory may load/start.
  assert.ok(!h.events.loads.includes('background-task.js'));
  assert.ok(!h.events.timers.includes(15*60000));
  for(const url of ['/api/cities','/api/professionals/123/availability','/api/profiles/local/123','/api/unclassified','/health/unclassified','/.env','/server.js','/assets/new.png','/consulta.html','/CONSULTA.HTML/','/operacao.html?aba=usuarios','/profissional.html?aba=conta']){
   const sql=h.events.sql.length,handlers=h.events.handlers.length;assert.equal((await h.request('GET',url,'administrador')).status,404,url);
   assert.equal(h.events.sql.length,sql);assert.equal(h.events.handlers.length,handlers);
  }
  for(const resource of resources.filter(r=>r.kind==='file'&&r.group!=='A'))for(const method of ['GET','HEAD','OPTIONS'])assert.equal((await h.request(method,resource.path,'administrador')).status,404,resource.path);
  const invalid=await h.request('POST','/api/appointments','administrador','{');assert.equal(invalid.status,404,'guard precedes JSON parser');
  for(const url of ['/','/index.html','/sobre.html','/assets/icon.svg','/service-worker.js'])assert.equal((await h.request('GET',url)).status,200,url);
  assert.equal((await h.request('GET','/health/ready')).status,200);assert.ok(h.events.sql.every(sql=>sql==='SELECT 1'));
  assert.equal(h.events.backup,1);
 }finally{await h.close();}
});
test('real auth with memory DB: identities, admin authorization, Origin, logout and password revocation survive isolation',async()=>{
 const h=await createHarness({FEATURE_AUTH:'true',FEATURE_CATALOG_ADMIN:'true'});
 try{
  const auth=h.load(h.file('auth.js'));for(const user of h.users)user.senha_hash=await auth.passwordHash('Fictitious password 123');
  for(const role of roles.slice(1)){const me=await h.request('GET','/api/auth/me',role);assert.equal(JSON.parse(me.body).user.role,role);}
  assert.equal((await h.request('GET','/api/admin/places')).status,401);
  for(const role of ['paciente','profissional','equipe'])assert.equal((await h.request('GET','/api/admin/places',role)).status,403);
  for(const role of roles)assert.equal((await h.request('GET','/api/team/agenda',role)).status,404);
  assert.equal((await h.request('POST','/api/auth/login','anonymous',{email:'paciente@example.invalid',password:'Fictitious password 123'},{Origin:'https://other.invalid'})).status,403);
  const login=await h.request('POST','/api/auth/login','anonymous',{email:'paciente@example.invalid',password:'Fictitious password 123'});assert.equal(login.status,200);
  const cookie=login.headers['set-cookie'][0];assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);
  assert.equal((await h.request('POST','/api/auth/register','anonymous',{})).status,404);
  const administrator=h.users.find(u=>u.role==='administrador');administrator.passwordChangeRequired=true;
  assert.equal((await h.request('GET','/api/admin/places','administrador')).status,403,'mandatory password change preserved');administrator.passwordChangeRequired=false;
  assert.equal((await h.request('POST','/api/account/password','profissional',{currentPassword:'Wrong fictitious password',password:'Fictitious changed 456'})).status,400);
  const changed=await h.request('POST','/api/account/password','profissional',{currentPassword:'Fictitious password 123',password:'Fictitious changed 456'});assert.equal(changed.status,200);
  assert.equal(JSON.parse((await h.request('GET','/api/auth/me','profissional')).body).user,null);
  assert.equal((await h.request('POST','/api/auth/logout','paciente',{})).status,200);
  assert.equal(JSON.parse((await h.request('GET','/api/auth/me','paciente')).body).user,null);
  assert.ok(!h.events.sql.some(sql=>/disponibilidades|agendamentos|registros_atendimentos|pacientes_recepcao/.test(sql)));
 }finally{await h.close();}
});
test('service entry points close before DB access or timers, with mock dependencies',async()=>{
 let effects=0;const pool=new Proxy({}, {get(){effects++;throw Error('DB access forbidden');}});
 const {createScheduleService}=require('../schedule-service');
 const closed=createScheduleService({features:loadFeatures({}),pool,scope(){effects++;},startTask(){effects++;}});
 for(const name of ['preview','publish','changeState','withdraw','processRule','runRolling','location','startWorker']){
  assert.throws(()=>closed[name](),{code:'FEATURE_DISABLED'},name);
 }assert.equal(effects,0);
 const features=loadFeatures({FEATURE_AUTH:'true',FEATURE_SCHEDULING:'true',FEATURE_TEAM_OPERATIONS:'true',FEATURE_SCHEDULE_WORKER:'true'});
 let started=0,stopped=0;
 const enabled=createScheduleService({features,pool,scope(){},startTask(fn,ms){started++;assert.equal(ms,900000);return()=>{stopped++;};}});
 await enabled.startWorker()();assert.equal(started,1);assert.equal(stopped,1);assert.equal(effects,0);
 // Manual rolling additionally requires the worker capability, not just Scheduling.
 const manual=createScheduleService({features:loadFeatures({FEATURE_SCHEDULING:'true'}),pool});assert.throws(()=>manual.runRolling(),{code:'FEATURE_DISABLED'});
});
test('default exported service and CLI never import DB/service when disabled',async()=>{
 const root=path.join(__dirname,'..'),features=loadFeatures({});let forbidden=0;
 function isolated(file,extra={}){
  const module={exports:{}};
  const req=name=>{
   if(name.includes('db')||name.includes('team-permissions')||name.includes('background-task')){forbidden++;throw Error('Forbidden infrastructure import');}
   if(name.endsWith('/config'))return {loadConfig:()=>({features})};
   if(name==='../schedule-service'){forbidden++;throw Error('Service imported');}
   if(extra[name])return extra[name];
   return require(path.resolve(path.dirname(file),name));
  };req.main={};
  vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(file,'utf8')+'\n})',{console,process:{env:{NODE_ENV:'test'},exitCode:0}})(req,module,module.exports);
  return module.exports;
 }
 const service=isolated(path.join(root,'schedule-service.js'));
 for(const name of ['preview','publish','changeState','withdraw','processRule','runRolling','location','startWorker'])assert.throws(()=>service[name](),{code:'FEATURE_DISABLED'});
 const cli=isolated(path.join(root,'scripts/run-scheduling.js'));
 await assert.rejects(()=>cli.main(),{code:'FEATURE_DISABLED'});assert.equal(forbidden,0);
 assert.throws(()=>isolated(path.join(root,'scripts/sync-patients.js'),{dotenv:{config(){}}}),{code:'FEATURE_DISABLED'});
 assert.equal(forbidden,0,'patient sync must also fail before importing DB');
 let ran=0,closed=0;const open=loadFeatures({FEATURE_AUTH:'true',FEATURE_SCHEDULING:'true',FEATURE_TEAM_OPERATIONS:'true',FEATURE_SCHEDULE_WORKER:'true'});
 await cli.main({loadConfig:()=>({features:open}),run:async()=>{ran++;},close:async()=>{closed++;}});assert.equal(ran,1);assert.equal(closed,1);
 await assert.rejects(()=>cli.main({loadConfig:()=>({features:open}),run:async()=>{throw Error('Mock failure');},close:async()=>{closed++;}}),/Mock failure/);assert.equal(closed,2);
});
test('legacy integration flags are explicit and cannot activate before disposable database validation',()=>{
 const source=fs.readFileSync(path.join(__dirname,'require-test-database.js'),'utf8');
 const ordinary={NODE_ENV:'development'};
 const execute=env=>vm.runInNewContext(source,{process:{env},require:name=>{assert.equal(name,'../database-config');return require('../database-config');}});
 assert.throws(()=>execute(ordinary),/DB_DISPOSABLE/);assert.equal(ordinary.FEATURE_SCHEDULING,undefined);
 const env={NODE_ENV:'test',APP_ENV:'test',DB_NAME:'avelu_test_flags',DB_TEST_CONFIRM:'avelu_test_flags',DB_DISPOSABLE:'true',DB_HOST:'localhost',DB_PORT:'3306',DB_USER:'avelu_test_flags_app',DB_PASSWORD:'fictitious-only'};
 execute(env);assert.equal(env.FEATURE_SCHEDULING,'true');assert.equal(env.FEATURE_CLINICAL_RECORDS,'true');assert.doesNotThrow(()=>loadFeatures(env));
});
