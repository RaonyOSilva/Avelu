const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{Readable}=require('node:stream');
test('structured logs discard secrets and arbitrary error messages',()=>{
 const lines=[];require('../operational-log').write('api.failed',{password:'secret',cookie:'secret',error:Error('clinical'),token:'secret',status:500,requestId:'123e4567-e89b-12d3-a456-426614174000'},s=>lines.push(s));
 const r=JSON.parse(lines[0]);assert.equal(r.status,500);assert.ok(r.bootId);assert.ok(!lines[0].includes('secret'));assert.ok(!lines[0].includes('clinical'));
});
test('worker is single-flight, drains on stop, and retries after transient failure',async()=>{
 let release,calls=0,errors=0;const stop=require('../background-task').start(async()=>{calls++;if(calls===1)throw Error('temporary');await new Promise(r=>release=r);},100000,{immediate:false,onError:()=>errors++});
 await stop.tick();assert.equal(errors,1);const first=stop.tick();await Promise.resolve();assert.equal(stop.tick(),first);let finished=false;const drain=stop().then(()=>finished=true);await Promise.resolve();assert.equal(finished,false);release();await drain;assert.equal(calls,2);await stop.tick();assert.equal(calls,2);
});
test('readiness failure is bounded, coalesced and does not fail liveness',async()=>{
 const express=require('express'),app=express();let calls=0,resolve;
 const stop=require('../operational-health').mount(app,{query:()=>{calls++;return new Promise(r=>resolve=r);}},{timeoutMs:20,cacheMs:0});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{assert.equal((await fetch(base+'/health/live')).status,200);const responses=await Promise.all([fetch(base+'/health/ready'),fetch(base+'/health/ready')]);assert.ok(responses.every(r=>r.status===503));assert.equal(calls,1);assert.equal((await fetch(base+'/health/startup')).status,200);resolve([[]]);await new Promise(r=>setImmediate(r));stop();assert.equal((await fetch(base+'/health/live')).status,503);}finally{await new Promise(r=>server.close(r));}
});
test('AES GCM streaming roundtrip rejects tampering, truncation and wrong key',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'avelu-crypto-')),key=Buffer.alloc(32,5),file=path.join(dir,'test.enc'),out=path.join(dir,'output.sql');
 const {encrypt,decrypt}=require('../backup-crypto');
 try{await encrypt(Readable.from(['CREATE TABLE fake(id INT);\n','INSERT INTO fake VALUES (1);']),file,key);await decrypt(file,out,key);assert.match(await fs.readFile(out,'utf8'),/VALUES \(1\)/);await fs.unlink(out);
 await assert.rejects(()=>decrypt(file,out,Buffer.alloc(32,6)));await assert.rejects(()=>fs.stat(out));
 const blob=await fs.readFile(file);blob[blob.length-1]^=1;await fs.writeFile(file,blob);await assert.rejects(()=>decrypt(file,out,key));await fs.writeFile(file,blob.subarray(0,15));await assert.rejects(()=>decrypt(file,out,key));
 }finally{await fs.unlink(file).catch(()=>{});await fs.unlink(out).catch(()=>{});await fs.rmdir(dir);}
});
test('CSP blocks scripts/frames and permits existing fonts and inline styling',()=>{
 const {options}=require('../http-security');const d=options(false).contentSecurityPolicy.directives;
 assert.deepEqual(d.scriptSrc,["'self'"]);assert.deepEqual(d.frameAncestors,["'none'"]);assert.ok(d.styleSrc.includes('https://fonts.googleapis.com'));assert.equal(d.upgradeInsecureRequests,null);assert.deepEqual(options(true).contentSecurityPolicy.directives.upgradeInsecureRequests,[]);
});
test('all existing HTML scripts are external and no event attributes require unsafe-inline',async()=>{
 for(const file of (await fs.readdir(path.join(__dirname,'..'))).filter(f=>f.endsWith('.html'))){const html=await fs.readFile(path.join(__dirname,'..',file),'utf8');assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html),file);assert.ok(!/\son(?:click|load|error|submit)\s*=/i.test(html),file);}
});
test('PWA only caches static assets; protected navigation and APIs remain network only',async()=>{
 const vm=require('node:vm'),handlers={},cached=[];const context={self:{location:{origin:'https://avelu.invalid',href:'https://avelu.invalid/service-worker.js'},addEventListener:(k,v)=>handlers[k]=v,skipWaiting(){},clients:{claim(){}}},URL,Response,fetch:async()=>{throw Error('offline');},caches:{open:async()=>({addAll:async files=>cached.push(...files)}),keys:async()=>[],match:()=>assert.fail('Sensitive cache read')}};
 vm.runInNewContext(await fs.readFile(path.join(__dirname,'../service-worker.js'),'utf8'),context);let installed;handlers.install({waitUntil:p=>installed=p});await installed;assert.ok(cached.every(f=>!f.endsWith('.html')&&f!=='./'));
 for(const pathname of ['/consulta.html','/agendamentos.html','/api/appointments']){let response;handlers.fetch({request:{url:'https://avelu.invalid'+pathname,method:'GET',mode:pathname.includes('.html')?'navigate':'cors'},respondWith:p=>response=p});assert.equal((await response).status,503);}
});
test('restore rejects ordinary development config before connecting',async()=>{
 await assert.rejects(()=>require('../scripts/restore-backup').restore({NODE_ENV:'development'},[]));
});
test('external copy streams encrypted bytes and demands an integrity receipt',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'avelu-copy-')),file=path.join(dir,'fake.enc');await fs.writeFile(file,'fictitious encrypted bytes');
 const {upload}=require('../backup-service');const cfg={remote:'https://storage.example.invalid/upload',timeout:1000};
 try{
  let seen;assert.equal(await upload(file,cfg,{},async(_url,request)=>{let bytes=0;for await(const chunk of request.body)bytes+=chunk.length;seen=bytes;return {ok:true,headers:new Headers({'x-backup-sha256':request.headers['X-Backup-SHA256']})};}),true);assert.equal(seen,(await fs.stat(file)).size);
  await assert.rejects(()=>upload(file,cfg,{},async()=>({ok:true,headers:new Headers()})));
 }finally{await fs.unlink(file);await fs.rmdir(dir);}
});
test('readiness recovers after a transient MySQL rejection without restarting',async()=>{
 const app=require('express')();let fail=true;require('../operational-health').mount(app,{query:async()=>{if(fail)throw Error('DB password and host private');return [[]];}},{cacheMs:0});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{const r=await fetch(base+'/health/ready');assert.equal(r.status,503);assert.ok(!(await r.text()).includes('private'));fail=false;assert.equal((await fetch(base+'/health/ready')).status,200);}finally{await new Promise(r=>server.close(r));}
});
test('shutdown waits for active work before closing database connections',async()=>{
 const {EventEmitter}=require('node:events');const proc=new EventEmitter();let release,ended=false;proc.exit=()=>{};
 const work=new Promise(r=>release=r);const shutdown=require('../server-lifecycle').installShutdown({processRef:proc,server:{close:cb=>cb()},stopTasks:[()=>work],pool:{end:async()=>ended=true}});
 const result=shutdown();await Promise.resolve();assert.equal(ended,false);release();await result;assert.equal(ended,true);
});
test('privacy guard clears logout caches, hides other tabs and reloads BFCache pages',async()=>{
 const vm=require('node:vm');const handlers={},deleted=[],messages=[];let hidden=0,redirect,reloaded=false,channel;
 const location={pathname:'/consulta.html',href:'https://avelu.invalid/consulta.html',origin:'https://avelu.invalid',replace:v=>redirect=v,reload:()=>reloaded=true};
 const caches={keys:async()=>['avelu-static-v12','another-app'],delete:async key=>deleted.push(key)};
 const window={fetch:async()=>({ok:true}),caches};
 vm.runInNewContext(await fs.readFile(path.join(__dirname,'../privacy-guard.js'),'utf8'),{window,location,URL,caches,encodeURIComponent,document:{body:{replaceChildren:()=>hidden++}},addEventListener:(k,v)=>handlers[k]=v,BroadcastChannel:class{constructor(){channel=this;}postMessage(v){messages.push(v);}}});
 await window.fetch('/api/auth/logout');await new Promise(r=>setImmediate(r));assert.deepEqual(deleted,['avelu-static-v12']);assert.deepEqual(messages,['logout']);
 channel.onmessage({data:'logout'});assert.ok(redirect.startsWith('/entrar.html?next='));assert.equal(hidden,1);handlers.pageshow({persisted:true});assert.equal(hidden,2);assert.equal(reloaded,true);
});
