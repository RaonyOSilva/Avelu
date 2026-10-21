require('./require-test-database');
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{once}=require('node:events');
const path=require('node:path'),fs=require('node:fs/promises'),pool=require('../db');
test('C4 operations exclusively on disposable MySQL',{timeout:90000},async t=>{
 const service=require('../schedule-service'),{today,add}=require('../schedule-engine');
 try{
 const [[staff]]=await pool.query("SELECT id,tipo AS role FROM usuarios WHERE email='equipe@example.invalid'");
 const [[link]]=await pool.query('SELECT profissional_id,local_id FROM profissionais_locais LIMIT 1');
 const day=add(today(),10),config={...link,inicio:day,fim:add(day,15),dias:[0,1,2,3,4,5,6],turnos:[{inicio:'08:00',fim:'09:00'}],duracao:30,valor:100,modo:'movel',janela:2,calendario_revisado:true,feriados:[],excecoes:[]};
 const pre=await service.preview(staff,config),rule=await service.publish(staff,{config,key:pre.key});assert.equal(rule.created,0);
 const count=async id=>Number((await pool.execute('SELECT COUNT(*) AS n FROM programacao_horarios WHERE programacao_id=?',[id]))[0][0].n);
 await t.test('database lock coordinates workers; repeated/concurrent processing does not duplicate',async()=>{
  const c=await pool.getConnection(),key='avelu:rolling:'+process.env.DB_NAME;try{await c.execute('SELECT GET_LOCK(?,0)',[key]);await service.runRolling(new Date(day+'T00:00:00-03:00'));assert.equal(await count(rule.id),0);}finally{await c.execute('SELECT RELEASE_LOCK(?)',[key]);c.release();}
  await Promise.all([service.runRolling(new Date(day+'T00:00:00-03:00')),service.runRolling(new Date(day+'T00:00:00-03:00'))]);assert.equal(await count(rule.id),4);await service.runRolling(new Date(day+'T00:00:00-03:00'));assert.equal(await count(rule.id),4);
 });
 await t.test('responsible role and revoked grants pause existing schedules',async()=>{
  await pool.execute("UPDATE usuarios SET tipo='paciente' WHERE id=?",[staff.id]);await service.processRule(rule.id,new Date(add(day,3)+'T00:00:00-03:00'));assert.equal(await count(rule.id),4);
  assert.equal((await pool.execute('SELECT status FROM programacoes_agenda WHERE id=?',[rule.id]))[0][0].status,'pausada');
  await pool.execute("UPDATE usuarios SET tipo='equipe' WHERE id=?",[staff.id]);await pool.execute("UPDATE programacoes_agenda SET status='ativa' WHERE id=?",[rule.id]);await pool.execute('DELETE FROM gestao_acessos WHERE usuario_id=?',[staff.id]);
  await service.processRule(rule.id,new Date(add(day,3)+'T00:00:00-03:00'));assert.equal(await count(rule.id),4);assert.equal((await pool.execute('SELECT status FROM programacoes_agenda WHERE id=?',[rule.id]))[0][0].status,'pausada');await pool.execute('INSERT INTO gestao_acessos(usuario_id,local_id) VALUES (?,?)',[staff.id,link.local_id]);
 });
 await t.test('process interruption rolls back partial slots; restart safely retries',async()=>{
  const second={...config,inicio:add(day,20),fim:add(day,30)},preview=await service.preview(staff,second),saved=await service.publish(staff,{config:second,key:preview.key});const now=second.inicio+'T00:00:00-03:00';
  const child=spawn(process.execPath,['tests/fixtures/schedule-crash.js'],{env:{...process.env,TEST_RULE:String(saved.id),TEST_NOW:now},stdio:['ignore','ignore','ignore','ipc']});
  try{await Promise.race([once(child,'message'),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Crash fixture timeout')),10000);timer.unref();})]);}finally{const exited=once(child,'exit');child.kill();await exited;}
  assert.equal(await count(saved.id),0);await service.processRule(saved.id,new Date(now));assert.equal(await count(saved.id),4);await service.processRule(saved.id,new Date(now));assert.equal(await count(saved.id),4);
 });
 await t.test('encrypted dump restores only to verified empty disposable destination',async()=>{
  const backup=require('../backup-service');await backup.backup();assert.equal((await backup.verify()).integrity,true);const status=await backup.status();assert.equal(status.external,'not-configured');
  const env={...process.env,BACKUP_FILE:path.join(process.env.BACKUP_DIR,status.file)},args=['--confirm-restore='+env.RESTORE_DB_NAME];
  await assert.rejects(()=>require('../scripts/restore-backup').restore({...env,RESTORE_EXPECTED_DATADIR:path.join(env.RESTORE_EXPECTED_DATADIR,'wrong')},args));
  const result=await require('../scripts/restore-backup').restore(env,args);assert.equal(result.tables,30);
  const c=await require('mysql2/promise').createConnection({host:env.DB_HOST,port:Number(env.DB_PORT),user:env.RESTORE_DB_USER,password:env.RESTORE_DB_PASSWORD,database:env.RESTORE_DB_NAME});
  try{for(const table of ['usuarios','agendamentos','disponibilidades','programacoes_agenda','convites']){const [[a]]=await pool.query('SELECT COUNT(*) AS n FROM '+table),[[b]]=await c.query('SELECT COUNT(*) AS n FROM '+table);assert.equal(a.n,b.n,table);}}finally{await c.end();}
  await assert.rejects(()=>require('../scripts/restore-backup').restore(env,args),/vazio/);
 });
 await t.test('HTTP headers, health and sensitive files',async()=>{
  const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'0',APP_ORIGIN:''},stdio:['ignore','pipe','pipe']});let base;
  try{base=await new Promise((resolve,reject)=>{child.once('error',reject);child.stdout.on('data',b=>{const m=String(b).match(/http:\/\/localhost:\d+/);if(m)resolve(m[0]);});});
   const r=await fetch(base+'/');assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('cache-control'),'no-store');
   for(const file of ['.env','server.js','database/migrations/001-core.sql'])assert.equal((await fetch(base+'/'+file)).status,404);
   for(const endpoint of ['/health/live','/health/ready','/health/startup'])assert.equal((await fetch(base+endpoint)).status,200);
   assert.equal((await fetch(base+'/api/appointments')).status,401);
  }finally{const exited=once(child,'exit');child.kill();await exited;}
 });
 }finally{await pool.end();}
});
