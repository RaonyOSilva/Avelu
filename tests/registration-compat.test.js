require('./require-test-database');
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{once}=require('node:events');
test('existing registration remains patient-only when homologation is disabled',{timeout:20000},async()=>{
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,NODE_ENV:'test',APP_ENV:'test',PORT:'0',APP_ORIGIN:'',HOMOLOGATION_MODE:'false',INVITE_ONLY:'false'},stdio:['ignore','pipe','pipe']});
 try{
  const base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Start timeout')),10000);child.once('error',reject);child.once('exit',()=>{clearTimeout(timer);reject(Error('Server exited'));});child.stdout.on('data',b=>{const m=String(b).match(/http:\/\/localhost:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});});
  const env=await (await fetch(base+'/api/environment')).json();assert.deepEqual(env,{homologation:false,inviteOnly:false});
  const home=await fetch(base+'/');assert.equal(home.headers.get('x-robots-tag'),null);assert.ok(!(await home.text()).includes('AVELU — HOMOLOGAÇÃO'));
  const r=await fetch(base+'/api/auth/register',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:'compat-'+require('node:crypto').randomUUID()+'@example.invalid',name:'Teste compatibilidade',password:'Teste compatibilidade 123',role:'administrador'})});
  assert.equal(r.status,201);assert.equal((await r.json()).user.role,'paciente');
 }finally{const exited=once(child,'exit');child.kill();await exited;}
});
