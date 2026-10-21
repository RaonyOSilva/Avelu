const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {loadConfig}=require('../config');
const {installShutdown}=require('../server-lifecycle');
const hosted={NODE_ENV:'production',APP_ENV:'staging',HOMOLOGATION_MODE:'true',DB_NETWORK:'railway-private',RAILWAY_ENVIRONMENT_ID:'isolated-test',DB_HOST:'mysql.railway.internal',DB_USER:'avelu_staging_app',DB_PASSWORD:'example-test-only',DB_NAME:'avelu_staging',APP_ORIGIN:'https://example.com',TRUST_PROXY:'false'};

test('local defaults remain available without reading .env',()=>{
 const c=loadConfig({});assert.equal(c.port,3000);assert.equal(c.db.host,'localhost');assert.equal(c.trustProxy,false);
});
test('hosted configuration requires explicit credentials and origin',()=>{
 for(const name of ['DB_HOST','DB_USER','DB_PASSWORD','DB_NAME','APP_ORIGIN','TRUST_PROXY']){
  const env={...hosted};delete env[name];assert.throws(()=>loadConfig(env),new RegExp(name));
 }
 assert.throws(()=>loadConfig({...hosted,DB_USER:'root'}),/DB_USER/);
});
test('staging and Railway cannot silently use development defaults',()=>{
 for(const env of [{APP_ENV:'staging'},{APP_ENV:'homologacao'},{RAILWAY_ENVIRONMENT_ID:'test'}])assert.throws(()=>loadConfig(env),/NODE_ENV/);
 assert.throws(()=>loadConfig({APP_ENV:'prodution'}),/APP_ENV/);
});
test('hosted port and bind address',()=>{
 const c=loadConfig({...hosted,PORT:'43210'});assert.equal(c.port,43210);assert.equal(c.host,'0.0.0.0');
 for(const PORT of ['abc','0','65536','2.5'])assert.throws(()=>loadConfig({...hosted,PORT}),/PORT/);
 assert.throws(()=>loadConfig({...hosted,HOST:'127.0.0.1'}),/HOST/);
});
test('origin rejects HTTP, paths, credentials and does not leak their values',()=>{
 for(const APP_ORIGIN of ['http://example.com','https://example.com/path','https://secret:password@example.com']){
  assert.throws(()=>loadConfig({...hosted,APP_ORIGIN}),error=>error.message.includes('APP_ORIGIN')&&!error.message.includes(APP_ORIGIN));
 }
});
test('proxy trust is disabled locally and limited to explicit addresses when hosted',()=>{
 assert.equal(loadConfig({TRUST_PROXY:'true'}).trustProxy,false);
 assert.deepEqual(loadConfig({...hosted,TRUST_PROXY:'10.20.0.0/24,::1'}).trustProxy,['10.20.0.0/24','::1']);
 for(const TRUST_PROXY of ['true','1','0.0.0.0/0','::/0','10.0.0.1/33','loopback'])assert.throws(()=>loadConfig({...hosted,TRUST_PROXY}),/TRUST_PROXY/);
});
test('forwarded HTTPS is honored only from the configured proxy',async()=>{
 const express=require('express');const http=require('node:http');
 for(const trust of [false,['127.0.0.1'],['192.0.2.1']]){
  const app=express();app.set('trust proxy',trust);app.get('/',(req,res)=>res.json({secure:req.secure}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try{
   const body=await new Promise((resolve,reject)=>http.get({host:'127.0.0.1',port:server.address().port,headers:{'X-Forwarded-Proto':'https'}},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>resolve(JSON.parse(data)));}).on('error',reject));
   assert.equal(body.secure,Array.isArray(trust)&&trust[0]==='127.0.0.1');
  }finally{await new Promise(resolve=>server.close(resolve));}
 }
});
test('shutdown drains HTTP before pool and is idempotent for signals',async()=>{
 const events=[];const proc=new EventEmitter();proc.exit=code=>events.push(`exit:${code}`);
 const shutdown=installShutdown({processRef:proc,server:{close:cb=>{events.push('http');setImmediate(cb);}},pool:{end:async()=>events.push('pool')},stopTasks:[()=>events.push('tasks')]});
 const pending=shutdown();proc.emit('SIGTERM');await pending;
 assert.deepEqual(events,['tasks','http','pool','exit:0']);assert.equal(proc.listenerCount('SIGINT'),1);
});
test('shutdown reports failures without exposing details',async()=>{
 let exit;const logs=[];const proc=new EventEmitter();proc.exit=code=>exit=code;
 await installShutdown({processRef:proc,server:{close:cb=>cb()},pool:{end:async()=>{throw Error('private detail');}},log:{error:m=>logs.push(m)}})();
 assert.equal(exit,1);assert.ok(logs.every(m=>!m.includes('private detail')));
});
test('shutdown has a bounded deadline',async()=>{
 const proc=new EventEmitter();let forced=false;
 const exited=new Promise(resolve=>proc.exit=resolve);
 installShutdown({processRef:proc,timeoutMs:20,server:{close:()=>{},closeAllConnections:()=>forced=true},pool:{end:async()=>{}},log:{error:()=>{}}})();
 const keepAlive=setTimeout(()=>{},1000);
 try{assert.equal(await exited,1);assert.equal(forced,true);}finally{clearTimeout(keepAlive);}
});
test('Node pin is consistent with lockfile',()=>{
 assert.equal(require('../package.json').engines.node,require('../package-lock.json').packages[''].engines.node);
});
