const fs=require('node:fs/promises'),streams=require('node:fs'),path=require('node:path');
const {randomBytes,createHash}=require('node:crypto');
const {encrypt,decrypt}=require('./backup-crypto'),command=require('./mysql-command');
const log=require('./operational-log');let working;
function configuration(env=process.env){
 if(!/^[a-f0-9]{64}$/i.test(env.BACKUP_KEY||'')||!env.BACKUP_DIR)throw Error('Configure BACKUP_KEY e BACKUP_DIR.');
 const days=Number(env.BACKUP_RETENTION_DAYS||7),timeout=Number(env.BACKUP_TIMEOUT_MS||300000);
 if(!Number.isInteger(days)||days<1||days>365||!Number.isInteger(timeout)||timeout<1000||timeout>3600000)throw Error('Retencao/prazo de backup invalido.');
 const config=require('./config').loadConfig(env);
 if(config.hosted&&(!env.BACKUP_DB_USER||!env.BACKUP_DB_PASSWORD))throw Error('Backup hospedado exige credenciais dedicadas.');
 let remote;if(env.BACKUP_REMOTE_URL){remote=new URL(env.BACKUP_REMOTE_URL);if(remote.protocol!=='https:'||remote.username||remote.password||remote.hash)throw Error('Destino externo exige HTTPS.');}
 return {key:Buffer.from(env.BACKUP_KEY,'hex'),directory:path.resolve(env.BACKUP_DIR),days,timeout,remote:remote?.href,db:{...config.db,user:env.BACKUP_DB_USER||config.db.user,password:env.BACKUP_DB_PASSWORD||config.db.password}};
}
async function writeStatus(directory,value){const temp=path.join(directory,'status-'+randomBytes(8).toString('hex')+'.tmp');await fs.writeFile(temp,JSON.stringify(value),{mode:0o600});await fs.rename(temp,path.join(directory,'status.json'));}
async function upload(file,cfg,env=process.env,transport=fetch){
 if(!cfg.remote)return false;
 // Endpoint must store each X-Backup-Name as an immutable independent object.
 const hash=createHash('sha256');for await(const chunk of streams.createReadStream(file))hash.update(chunk);const digest=hash.digest('hex');
 const input=streams.createReadStream(file);
 try{const r=await transport(cfg.remote,{method:'PUT',redirect:'error',duplex:'half',body:input,signal:AbortSignal.timeout(cfg.timeout),headers:{'Content-Type':'application/octet-stream','Content-Length':String((await fs.stat(file)).size),'X-Backup-Name':path.basename(file),'X-Backup-SHA256':digest,...(env.BACKUP_REMOTE_TOKEN?{Authorization:'Bearer '+env.BACKUP_REMOTE_TOKEN}:{})}});if(!r.ok||r.headers.get('x-backup-sha256')!==digest)throw Error('Copia externa nao confirmou integridade.');await r.body?.cancel();return true;}finally{input.destroy();}
}
async function retention(cfg){
 const names=(await fs.readdir(cfg.directory)).filter(n=>/^avelu-[\dTZ-]+-[a-f0-9]{12}\.enc$/.test(n)).sort().reverse();
 for(const name of names.slice(1)){const file=path.join(cfg.directory,name),stat=await fs.stat(file);if(Date.now()-stat.mtimeMs>cfg.days*86400000)await fs.unlink(file);}
}
async function perform(){
 const cfg=configuration();let c,locked=false,credentials,partial,proc;
 try{
  c=await require('./db').getConnection();const [[lock]]=await c.execute('SELECT GET_LOCK(?,0) AS acquired',['avelu:backup:'+cfg.db.database]);locked=lock.acquired===1;if(!locked)return {skipped:true};
  log.write('backup.started');await fs.mkdir(cfg.directory,{recursive:true,mode:0o700});
  credentials=await command.credentials(cfg.db);
  const name='avelu-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(6).toString('hex')+'.enc';
  const final=path.join(cfg.directory,name);partial=final+'.partial';
  proc=command.start(process.env.MYSQLDUMP_PATH||'mysqldump',['--defaults-extra-file='+credentials.file,'--single-transaction','--routines','--triggers','--events','--quick','--skip-lock-tables','--skip-add-drop-table','--hex-blob','--no-tablespaces','--set-gtid-purged=OFF','--column-statistics=0',cfg.db.database],cfg.timeout);proc.child.stdin.end();
  await Promise.all([encrypt(proc.child.stdout,partial,cfg.key),proc.done]);await fs.rename(partial,final);
  await decrypt(final,null,cfg.key);
  const copied=await upload(final,cfg);
  const state={file:name,createdAt:new Date().toISOString(),bytes:(await fs.stat(final)).size,verifiedAt:new Date().toISOString(),external:copied?'copied':'not-configured'};
  await writeStatus(cfg.directory,state);await fs.unlink(path.join(cfg.directory,'failure.json')).catch(()=>{});if(copied)await retention(cfg);
  log.write('backup.completed',{bytes:state.bytes});return {file:name,external:state.external};
 }catch(e){await fs.writeFile(path.join(cfg.directory,'failure.json'),JSON.stringify({lastFailureAt:new Date().toISOString()}),{mode:0o600}).catch(()=>{});throw Error('Backup falhou; verifique a configuracao operacional.'+(/^MYSQL_CLIENT_[a-z0-9]+$/.test(e.code||'')?' '+e.code:''));}
 finally{proc?.child.kill();if(partial)await fs.unlink(partial).catch(()=>{});await credentials?.clean();if(locked)await c.execute('SELECT RELEASE_LOCK(?)',['avelu:backup:'+cfg.db.database]).catch(()=>{});c?.release();}
}
function backup(){if(working)return Promise.reject(Error('Backup em andamento.'));working=perform().catch(e=>{require('./runtime-health').failure();log.write('backup.failed');throw e;}).finally(()=>{working=null;});return working;}
async function status(){try{const dir=configuration().directory;let state=null;try{state=JSON.parse(await fs.readFile(path.join(dir,'status.json'),'utf8'));}catch{}try{state={...state,...JSON.parse(await fs.readFile(path.join(dir,'failure.json'),'utf8'))};}catch{}return state;}catch{return null;}}
async function verify(){const cfg=configuration(),s=await status();if(!s?.file||path.basename(s.file)!==s.file)throw Error('Nenhum backup disponivel.');await decrypt(path.join(cfg.directory,s.file),null,cfg.key);await writeStatus(cfg.directory,{...s,verifiedAt:new Date().toISOString()});return {integrity:true};}
function start(){if(!process.env.BACKUP_DIR||!process.env.BACKUP_KEY)return()=>working||Promise.resolve();const stop=require('./background-task').start(async()=>{const s=await status();if(!s?.createdAt||s.lastFailureAt||Date.now()-Date.parse(s.createdAt)>86400000)await backup();},3600000,{onError:()=>{}});return async()=>{await stop();if(working)await working;};}
module.exports={backup,verify,status,start,configuration,upload,retention};
