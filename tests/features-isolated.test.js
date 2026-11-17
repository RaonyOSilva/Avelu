const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {loadFeatures,names,dependencies}=require('../feature-config');
const {resources,tasks}=require('../resource-manifest');
const {classify,evaluate,createCapabilityGuard,assertTask,auditRegistrations,compilePath}=require('../capability-control');
const allEnv=Object.fromEntries(names.map(n=>[n,'true']));
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const concrete=p=>p.replace(/:[a-zA-Z][a-zA-Z0-9_]*/g,'123');
async function serve(app,work){
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const request=(method,url,headers={})=>new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port:server.address().port,method,path:url,headers},res=>{
   let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
  });req.on('error',reject);req.end();
 });
 try{await work(request);}finally{await new Promise(r=>server.close(r));}
}

test('all sixteen flags default closed, strict strings only, immutable and no value leaks',()=>{
 assert.equal(names.length,16);const flags=loadFeatures({});assert.ok(Object.values(flags).every(v=>v===false));
 assert.ok(Object.isFrozen(flags));
 for(const name of names)for(const value of ['',true,false,1,0,null,'TRUE','False',' true','false ','1','0','yes','private-value']){
  assert.throws(()=>loadFeatures({[name]:value}),e=>e.message.includes(name)&&!e.message.includes('private-value'));
 }
 assert.throws(()=>loadFeatures({FEATURE_SECRET_TYPO:'private-value'}),e=>!e.message.includes('private-value')&&!e.message.includes('SECRET_TYPO'));
 assert.doesNotThrow(()=>loadFeatures(Object.fromEntries(names.map(n=>[n,'false']))));
 assert.ok(Object.values(loadFeatures(allEnv)).every(v=>v===true));
});
test('every dependency is enforced; catalogue does not require scheduling',()=>{
 for(const [name,required] of Object.entries(dependencies))for(const dep of required){
  assert.throws(()=>loadFeatures({...allEnv,[dep]:'false'}),e=>e.message.includes(name)&&e.message.includes(dep));
 }
 const flags=loadFeatures({FEATURE_PUBLIC_CATALOG:'true'});assert.equal(flags.FEATURE_SCHEDULING,false);
 assert.ok(evaluate('GET','/api/professionals',flags).allowed);
 assert.throws(()=>loadFeatures({FEATURE_PATIENT_ACCOUNT:'true',FEATURE_AUTH:'true'}),/FEATURE_EMAIL_VERIFICATION/);
});
test('loadConfig validates features first without changing local or homologation defaults',()=>{
 const {loadConfig}=require('../config');assert.equal(loadConfig({}).features.FEATURE_CLINICAL_RECORDS,false);
 assert.throws(()=>loadConfig({FEATURE_SCHEDULE_WORKER:'true'}),/FEATURE_/);
 const cfg=loadConfig({NODE_ENV:'production',APP_ENV:'staging',HOMOLOGATION_MODE:'true',DB_NETWORK:'railway-private',RAILWAY_ENVIRONMENT_ID:'test-only',DB_HOST:'mysql.railway.internal',DB_USER:'avelu_staging_app',DB_PASSWORD:'fictitious',DB_NAME:'avelu_staging',APP_ORIGIN:'https://example.invalid',TRUST_PROXY:'false'});
 assert.equal(cfg.access.inviteOnly,true);assert.ok(Object.values(cfg.features).every(v=>v===false));
});
test('inventory exactly covers explicit Express registrations, including router prefixes and arrays',()=>{
 const found=[];
 for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.js'))){
  const source=read(file);
  const re=/\b(app|router)\.(get|post|put|patch|delete|head|options|all)\s*\(\s*(\[[^\]]*\]|'[^']*')/g;
  const calls=[...source.matchAll(/\b(?:app|router)\.(?:get|post|put|patch|delete|head|options|all)\s*\(/g)];
  const parsed=[...source.matchAll(re)];
  assert.equal(parsed.length,calls.length,file+': unparsed registration requires review');
  for(const m of parsed)for(const quoted of m[3].match(/'[^']*'/g)||[]){
   found.push({method:m[2].toUpperCase(),path:(m[1]==='router'?'/api/admin':'')+quoted.slice(1,-1)});
  }
  assert.doesNotMatch(source,/\b(?:app|router)\.route\s*\(/,file+': chained registration requires review');
  for(const mount of source.matchAll(/\b(?:app|router)\.use\s*\(\s*(\[[^\]]*\]|'[^']*')/g)){
   for(const quoted of mount[1].match(/'[^']*'/g)||[])assert.ok(['/api','/assets','/api/admin','/api/team','/api/professional','/api/consultations','/api/templates'].includes(quoted.slice(1,-1)),file+': new mount requires review');
  }
 }
 assert.equal(found.length,93);assert.deepEqual(auditRegistrations(found),[]);
 assert.deepEqual(new Set(found.map(r=>r.method+' '+r.path)),new Set(resources.filter(r=>r.kind==='api').map(r=>r.method+' '+r.path)));
 assert.equal(new Set(resources.map(r=>r.id)).size,resources.length);
 for(const r of [...resources,...tasks])for(const n of r.requires)assert.ok(names.includes(n));
});
test('all HTML, public allowlist files and assets are explicitly inventoried',()=>{
 const manifestFiles=resources.filter(r=>r.kind==='file').map(r=>r.path.slice(1));
 for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html')))assert.ok(manifestFiles.includes(file),file);
 const server=read('server.js');const block=server.match(/const publicFiles = new Set\(\[([^]*?)\]\)/)[1];
 const files=[...block.matchAll(/'([^']+)'/g),...server.matchAll(/publicFiles.add\('([^']+)'\)/g)].map(m=>m[1]);
 for(const file of files)assert.ok(manifestFiles.includes(file),file);
 for(const file of fs.readdirSync(path.join(root,'assets')))assert.ok(manifestFiles.includes('assets/'+file),file);
 for(const file of manifestFiles.filter(Boolean))assert.ok(fs.existsSync(path.join(root,file)),file);
});
test('unknown resources, methods and unsupported path syntax are pending/closed',()=>{
 const flags=loadFeatures(allEnv);
 for(const [method,url] of [['GET','/api/new-resource'],['PATCH','/api/templates/1'],['GET','/new.html'],['GET','/assets/new.png'],['GET','/server.js'],['GET','/.env'],['GET','https://example.invalid/api/templates']]){
  assert.equal(classify(method,url).status,'pending');assert.equal(evaluate(method,url,flags).allowed,false);
 }
 assert.deepEqual(auditRegistrations([{method:'GET',path:'/api/new'}]),[{method:'GET',path:'/api/new',status:'pending'}]);
 assert.throws(()=>compilePath('/api/{*any}','api'),/review/);
 assert.throws(()=>createCapabilityGuard({...loadFeatures({})}),/Validated/);
 assert.equal(evaluate('GET','/',{}).allowed,false);
});
test('matching handles parameters, case, query, trailing slash and malformed escapes safely',()=>{
 for(const url of ['/api/templates/123','/API/TEMPLATES/123/','/api/templates/a%2Fb?x=1'])assert.equal(classify('DELETE',url).status,'classified');
 for(const url of ['/api/templates//','/api/templates/1//','/api/%74emplates/1','/api/templates/%ZZ','/api/templates/%FF','//api/templates','/api/templates\\1'])assert.equal(classify('DELETE',url).status,'pending');
 assert.equal(classify('GET','/consulta.html/').status,'pending');
 assert.equal(classify('GET','/CONSULTA.HTML').status,'pending');
 assert.equal(classify('GET','/assets/%69con.svg').status,'classified');
 assert.equal(classify('GET','/assets/../.env').status,'pending');
});
test('matcher is differential-tested against real Express for every explicit API route',async()=>{
 const express=require('express'),app=express(),flags=loadFeatures(allEnv);
 for(const r of resources.filter(r=>r.kind==='api'))app[r.method.toLowerCase()](r.path,(req,res)=>res.sendStatus(204));
 app.use((req,res)=>res.sendStatus(404));
 await serve(app,async request=>{
  for(const r of resources.filter(r=>r.kind==='api')){
   const literal=concrete(r.path);
   for(const url of [literal,literal.toUpperCase()+'/',literal+'?x=123']){
    const response=await request(r.method,url);assert.equal(response.status,204,r.method+' '+url);
    assert.equal(evaluate(r.method,url,flags).allowed,true,r.method+' '+url);
   }
  }
  for(const url of ['/api/templates/a%2Fb','/api/templates//','/api/templates/123//','/api/%74emplates/123']){
   const response=await request('DELETE',url);assert.equal(evaluate('DELETE',url,flags).allowed,response.status===204,url);
  }
 });
});
test('all B/C routes deny before downstream effects with defaults, including HEAD/OPTIONS/other verbs and all roles',async()=>{
 const app=require('express')();let effects=0;
 app.use(createCapabilityGuard(loadFeatures({})));app.use((req,res)=>{effects++;res.sendStatus(204);});
 await serve(app,async request=>{
  for(const r of resources.filter(r=>r.kind==='api'&&['B','C'].includes(r.group))){
   for(const method of new Set([r.method,'HEAD','OPTIONS','PATCH'])){
    const response=await request(method,concrete(r.path),{'X-Test-Role':'administrador'});
    assert.equal(response.status,404);assert.equal(response.headers['cache-control'],'no-store');assert.equal(response.headers.allow,undefined);
    if(method==='HEAD')assert.equal(response.body,'');else assert.deepEqual(JSON.parse(response.body),{error:'Recurso não encontrado.'});
   }
  }
  for(const role of ['anonymous','paciente','profissional','equipe','administrador'])assert.equal((await request('GET','/api/consultations/1',{'X-Test-Role':role})).status,404);
 });assert.equal(effects,0);
});
test('file and unknown denial has no redirect, Allow, body in HEAD or public fallback',async()=>{
 const app=require('express')();app.use(createCapabilityGuard(loadFeatures({})));app.use((req,res)=>res.sendStatus(204));
 await serve(app,async request=>{
  for(const url of ['/consulta.html','/patient-tools.js','/operacao.html?aba=usuarios','/profissional.html?aba=conta','/assets/new.png','/api/new'])for(const method of ['GET','HEAD','OPTIONS']){
   const response=await request(method,url);assert.equal(response.status,404);assert.equal(response.headers.location,undefined);assert.equal(response.headers.allow,undefined);
   assert.equal(response.headers['cache-control'],'no-store');if(method==='HEAD')assert.equal(response.body,'');
  }
 });
});
test('allowed capabilities still require downstream authorization; role cannot enable flags',async()=>{
 const app=require('express')();app.use(createCapabilityGuard(loadFeatures({FEATURE_AUTH:'true',FEATURE_CATALOG_ADMIN:'true'})));
 app.use((req,res)=>res.status(401).json({error:'Authentication still required'}));
 await serve(app,async request=>{
  assert.equal((await request('GET','/api/admin/places')).status,401);
  assert.equal((await request('GET','/api/team/agenda',{'X-Test-Role':'administrador'})).status,404);
  assert.equal((await request('POST','/api/auth/logout')).status,401);
 });
});
test('direct tasks are closed without validated capabilities; technical tasks remain independent',()=>{
 for(const name of ['schedule-worker','schedule-service','patient-sync','new-job'])assert.throws(()=>assertTask(name,loadFeatures({})),{code:'FEATURE_DISABLED'});
 for(const name of ['backup','health','auth-limit-cleanup'])assert.doesNotThrow(()=>assertTask(name,loadFeatures({})));
 assert.doesNotThrow(()=>assertTask('schedule-worker',loadFeatures(allEnv)));
 assert.throws(()=>assertTask('backup',{}),{code:'FEATURE_DISABLED'});
});
test('capability guard is mounted before health, parser, catalog, auth and static responses',()=>{
 const source=read('server.js'),guard=source.indexOf("app.use(require('./capability-control').createCapabilityGuard(config.features))");
 assert.ok(guard>source.indexOf('app.use(helmet('));
 for(const token of ["require('./operational-health').mount",'app.use(express.json',"require('./homologation').catalogMiddleware","const policy=require('./access-policy')","app.use('/assets'",'mountAuth(app'])assert.ok(source.indexOf(token)>guard,token);
 assert.match(source,/config.features.FEATURE_SCHEDULE_WORKER\?require\('\.\/schedule-service'\).startWorker\(\)/);
 assert.ok(Object.isFrozen(resources));assert.ok(resources.every(r=>Object.isFrozen(r)&&Object.isFrozen(r.requires)));
});
