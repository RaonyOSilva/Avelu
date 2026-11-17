// Executes the real server and local modules in an isolated module graph.
// Replaces ONLY infrastructure: DB, process lifecycle, backup and listen target.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const http=require('node:http'),crypto=require('node:crypto'),realExpress=require('express');
const root=path.join(__dirname,'../..');
const {loadFeatures}=require('../../feature-config');
async function createHarness(featureEnv={},homologation=false){
 const events={sql:[],handlers:[],loads:[],timers:[],backup:0,logs:[]},cache=new Map();
 const users=['paciente','profissional','equipe','administrador'].map((role,i)=>({id:i+1,role,name:'Fictitious '+role,email:role+'@example.invalid',passwordChangeRequired:false}));
 const sessions=new Map(),cookies={anonymous:''};
 for(const user of users){const token=String(user.id).repeat(64);cookies[user.role]='avelu_session='+token;sessions.set(crypto.createHash('sha256').update(token).digest('hex'),user.id);}
 const find=id=>users.find(u=>u.id===id);
 async function execute(sql,args=[]){
  events.sql.push(sql);
  if(sql.includes('FROM sessoes s JOIN usuarios'))return [[find(sessions.get(args[0]))].filter(Boolean)];
  if(sql.startsWith('SELECT id, nome_completo'))return [[users.find(u=>u.email===args[0])].filter(Boolean)];
  if(sql.startsWith('SELECT senha_hash FROM usuarios'))return [[{senha_hash:find(args[0])?.senha_hash}]];
  if(sql.startsWith('SELECT id FROM gestao_acessos')||sql.startsWith('SELECT id FROM perfis_profissionais'))return [[{id:1}]];
  if(sql.startsWith('INSERT INTO sessoes')){sessions.set(args[0],args[1]);return [{}];}
  if(sql.startsWith('DELETE FROM sessoes WHERE token_hash')){sessions.delete(args[0]);return [{}];}
  if(sql.startsWith('DELETE FROM sessoes WHERE usuario_id')){for(const [key,id] of sessions)if(id===args[0])sessions.delete(key);return [{}];}
  if(sql.startsWith('DELETE FROM recuperacoes_senha'))return [{}];
  if(sql.startsWith('UPDATE usuarios SET senha_hash')){find(args[1]).senha_hash=args[0];return [{}];}
  throw Error('Unexpected SQL in isolated fixture');
 }
 const pool={execute,query:async input=>{const sql=typeof input==='string'?input:input.sql;if(sql!=='SELECT 1')throw Error('Unexpected query');events.sql.push(sql);return [[{ok:1}]];},
  getConnection:async()=>{events.sql.push('getConnection');return {execute,beginTransaction:async()=>events.sql.push('BEGIN'),commit:async()=>events.sql.push('COMMIT'),rollback:async()=>events.sql.push('ROLLBACK'),release(){}};},end:async()=>{}};
 const features=loadFeatures(featureEnv);
 const config={...require('../../config').loadConfig({}),features,port:3000,host:'127.0.0.1',hosted:true,access:{homologation,inviteOnly:homologation,ttl:48,professionals:['123'],places:['123']}};
 const processMock={env:{NODE_ENV:'production',APP_ORIGIN:'https://avelu.example.invalid'},on(){},exit(){throw Error('Unexpected process exit');}};
 let app,server;
 function instrument(target){
  for(const method of ['get','post','put','patch','delete','head','options']){
   const original=target[method];target[method]=function(route,...handlers){
    if(!handlers.length)return original.call(this,route);
    const wrap=h=>Array.isArray(h)?h.map(wrap):typeof h==='function'?function(req,res,next){events.handlers.push(method+' '+route);return h(req,res,next);}:h;
    return original.call(this,route,...handlers.map(wrap));
   };
  }return target;
 }
 const express=Object.assign(function(){app=instrument(realExpress());const listen=app.listen.bind(app);app.listen=()=>{server=listen(0,'127.0.0.1');return server;};return app;},realExpress);
 express.Router=(...args)=>instrument(realExpress.Router(...args));
 function load(file){
  file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
  events.loads.push(path.relative(root,file));const module={exports:{}};cache.set(file,module);
  const req=name=>{
   if(name==='express')return express;
   if(name==='dotenv')return {config(){}};
   if(!name.startsWith('.'))return require(name);
   const target=require.resolve(path.resolve(path.dirname(file),name));
   const base=path.basename(target);
   if(base==='db.js')return pool;
   if(base==='config.js')return {loadConfig:()=>config};
   // Share validated object identity with the native capability components.
   if(['feature-config.js','capability-control.js','resource-manifest.js'].includes(base))return require(target);
   if(base==='backup-service.js')return {start(){events.backup++;return()=>{};},status:async()=>null};
   if(base==='server-lifecycle.js')return {installShutdown(){}};
   return load(target);
  };
  req.main={};
  const globals={process:processMock,console:{log:v=>events.logs.push(v),error:v=>events.logs.push(v)},Buffer,URL,URLSearchParams,AbortSignal,fetch:()=>{throw Error('External transport forbidden');},setTimeout,clearTimeout,setImmediate,
   setInterval(fn,ms){events.timers.push(ms);return {unref(){}};},clearInterval(){}};
  const run=vm.compileFunction(fs.readFileSync(file,'utf8'),['require','module','exports','__filename','__dirname',...Object.keys(globals)],{filename:file});
  run(req,module,module.exports,file,path.dirname(file),...Object.values(globals));return module.exports;
 }
 load(path.join(root,'server.js'));
 if(!server.listening)await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 const request=(method,url,role='anonymous',body,extra={})=>new Promise((resolve,reject)=>{
  const headers={...(cookies[role]?{Cookie:cookies[role]}:{}),...extra};
  if(body!==undefined){headers['Content-Type']='application/json';if(!('Origin' in headers))headers.Origin=processMock.env.APP_ORIGIN;}
  const req=http.request({host:'127.0.0.1',port:server.address().port,path:url,method,headers},res=>{
   let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:text}));
  });req.on('error',reject);req.end(body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body));
 });
 return {events,features,config,users,cookies,sessions,request,load,file:name=>path.join(root,name),close:()=>new Promise(resolve=>server.close(resolve))};
}
module.exports={createHarness};
