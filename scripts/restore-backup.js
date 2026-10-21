// Restore drills only. No production/local restoration is enabled by this command.
const fs=require('node:fs/promises'),streams=require('node:fs'),path=require('node:path'),os=require('node:os');
const {pipeline}=require('node:stream/promises'),{createInterface}=require('node:readline');
async function restore(env,args){
 require('../database-config').assertDisposable(env);
 const name=env.RESTORE_DB_NAME;
 if(!/^avelu_test_restore_[a-z0-9_]+$/.test(name||'')||name===env.DB_NAME||!args.includes('--confirm-restore='+name)||!env.RESTORE_EXPECTED_DATADIR||!env.RESTORE_DB_USER||env.RESTORE_DB_USER==='root'||!env.RESTORE_DB_PASSWORD||!path.isAbsolute(env.BACKUP_FILE||'')||!/^[a-f0-9]{64}$/i.test(env.BACKUP_KEY||''))throw Error('Destino descartavel e confirmacoes obrigatorios.');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'avelu-restore-'));await fs.chmod(dir,0o700);const sql=path.join(dir,'verified.sql');let c,credentials,proc;
 try{
  // Authenticate the entire ciphertext before executing ANY SQL from the dump.
  await require('../backup-crypto').decrypt(env.BACKUP_FILE,sql,Buffer.from(env.BACKUP_KEY,'hex'));
  for await(const line of createInterface({input:streams.createReadStream(sql),crlfDelay:Infinity}))if(/^\s*(?:USE\s|(?:CREATE|DROP)\s+DATABASE\b|SOURCE\s|\\[.!])|\/\*!\d+\s+(?:USE|CREATE\s+DATABASE|DROP\s+DATABASE)\b/i.test(line))throw Error('Dump nao permite restauracao isolada.');
  const config=require('../config').loadConfig(env),db={...config.db,database:name,user:env.RESTORE_DB_USER,password:env.RESTORE_DB_PASSWORD};
  c=await require('mysql2/promise').createConnection(db);
  const [[identity]]=await c.query('SELECT @@datadir AS dir,DATABASE() AS db');
  const canonical=p=>{const resolved=path.resolve(p).replace(/[\\/]+$/,'');return process.platform==='win32'?resolved.toLowerCase():resolved;};
  if(identity.db!==name||canonical(identity.dir)!==canonical(env.RESTORE_EXPECTED_DATADIR))throw Error('Isolamento da restauracao recusado.');
  const [grants]=await c.query('SHOW GRANTS');
  for(const row of grants){const grant=String(Object.values(row)[0]);if(/WITH GRANT OPTION/i.test(grant)||!(/^GRANT USAGE ON \*\.\* TO /i.test(grant)||grant.includes(' ON `'+name+'`.* TO ')))throw Error('Conta de restauracao deve ser exclusiva do destino.');}
  const [[count]]=await c.query('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');if(Number(count.n))throw Error('Restauracao exige banco vazio.');
  credentials=await require('../mysql-command').credentials(db);
  proc=require('../mysql-command').start(env.MYSQL_PATH||'mysql',['--defaults-extra-file='+credentials.file,'--binary-mode=1',name]);proc.child.stdout.resume();
  await Promise.all([pipeline(streams.createReadStream(sql),proc.child.stdin),proc.done]);
  const [tables]=await c.query('SHOW TABLES');if(tables.length<5)throw Error('Estrutura restaurada incompleta.');
  return {tables:tables.length};
 }finally{proc?.child.kill();await c?.end();await credentials?.clean();await fs.unlink(sql).catch(()=>{});await fs.rmdir(dir).catch(()=>{});}
}
module.exports={restore};
if(require.main===module)restore(process.env,process.argv).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Restauracao recusada ou falhou. Verifique isolamento, integridade e configuracao.');process.exitCode=1;});
