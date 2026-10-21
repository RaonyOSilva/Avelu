// Standalone MySQL sandbox. Never uses .env or the installed MySQL service.
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{randomBytes}=require('node:crypto');
const net=require('node:net');
async function run(command,args,env){
 return new Promise((resolve,reject)=>{const child=spawn(command,args,{env,windowsHide:true,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Processo de validação falhou.')));});
}
async function main(){
 if(!process.argv.includes('--confirm-isolated'))throw Error('Use --confirm-isolated e o caminho absoluto de mysqld.');
 const executable=process.argv.find(a=>a.startsWith('--mysqld='))?.slice(9);
 if(!executable||!path.isAbsolute(executable))throw Error('Caminho absoluto do executável requerido.');
 const clientPath=name=>{
  const override=process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
  if(override&&!path.isAbsolute(override))throw Error('Client override must be an absolute path.');
  return override||path.join(path.dirname(executable),name+(process.platform==='win32'?'.exe':''));
 };
 const mysqlPath=clientPath('mysql'),dumpPath=clientPath('mysqldump');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'avelu-c2-'));
 const data=path.join(dir,'data');await fs.mkdir(data);
 console.log('Sandbox descartável: '+dir);
 await run(executable,['--no-defaults','--initialize-insecure','--datadir='+data,'--log-error='+path.join(dir,'initialize.log')],process.env);
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const server=spawn(executable,['--no-defaults','--datadir='+data,'--port='+port,'--bind-address=127.0.0.1','--mysqlx=0','--skip-log-bin','--log-error='+path.join(dir,'mysql.log')],{windowsHide:true,stdio:'ignore'});
 let startupError;server.on('error',error=>startupError=error);
 const stopped=new Promise(resolve=>server.once('exit',resolve));
 let root;
 try{
  const mysql=require('mysql2/promise');
  for(let i=0;i<100;i++){
   if(startupError||server.exitCode!==null)throw Error('Instância descartável não iniciou.');
   try{root=await mysql.createConnection({host:'127.0.0.1',port,user:'root',password:'',connectTimeout:500});break;}catch{await new Promise(r=>setTimeout(r,200));}
  }
  if(!root)throw Error('Prazo de inicialização excedido.');
  const [[identity]]=await root.query('SELECT @@datadir AS dir,VERSION() AS version');
  const canonical=p=>{const resolved=path.resolve(p).replace(/[\\/]+$/,'');return process.platform==='win32'?resolved.toLowerCase():resolved;};
  if(canonical(identity.dir)!==canonical(data))throw Error('Diretório diferente: conexão recusada antes de qualquer escrita.');
  console.log('Isolamento verificado por @@datadir. MySQL '+identity.version+'; porta exclusiva '+port+'.');
  const db='avelu_test_c2_'+randomBytes(4).toString('hex'),password=randomBytes(24).toString('hex'),user=db+'_app';
  await root.query('CREATE DATABASE `'+db+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  const env={...process.env,NODE_ENV:'test',APP_ENV:'test',DB_NETWORK:'local',DB_TLS_MODE:'disabled',DB_TLS_CA:'',DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_USER:user,DB_PASSWORD:password,DB_NAME:db,DB_DISPOSABLE:'true',DB_TEST_CONFIRM:db,RAILWAY_ENVIRONMENT_ID:'',APP_ORIGIN:'',RESEND_API_KEY:'',MAIL_FROM:''};
  const config=require('../config').loadConfig(env);
  await root.query('USE `'+db+'`');
  const schemaUser=db+'_schema',schemaPassword=randomBytes(24).toString('hex');
  await root.query('CREATE USER ?@? IDENTIFIED BY ?',[schemaUser,'127.0.0.1',schemaPassword]);
  await root.query('GRANT CREATE, REFERENCES, SELECT, INSERT, UPDATE ON `'+db+'`.* TO ?@?',[schemaUser,'127.0.0.1']);
  const {initialize}=require('../database/initialize');
  await run(process.execPath,['scripts/initialize-empty.js','--confirm-empty='+db],{...env,DB_INIT_USER:schemaUser,DB_INIT_PASSWORD:schemaPassword});
  console.log('Baseline completa criada com credencial de estrutura separada da aplicação.');
  let refused=false;try{await initialize(root,config);}catch(e){refused=/não vazio/.test(e.message);}if(!refused)throw Error('Segunda execução deveria ser recusada.');
  await root.query('CREATE USER ?@? IDENTIFIED BY ?',[user,'127.0.0.1',password]);
  const [tables]=await root.query('SHOW TABLES');
  for(const row of tables){const table=Object.values(row)[0];const privileges=table.startsWith('avelu_')?'SELECT':'SELECT, INSERT, UPDATE, DELETE';await root.query('GRANT '+privileges+' ON `'+db+'`.`'+table+'` TO ?@?',[user,'127.0.0.1']);}
  const appPool=require('../database-pool').createDatabasePool(config);
  try{
   for(const sql of ['CREATE TABLE forbidden_test(id INT)','UPDATE avelu_environment SET ambiente=ambiente WHERE id=1']){
    let denied=false;try{await appPool.query(sql);}catch(error){denied=error.code==='ER_TABLEACCESS_DENIED_ERROR';}
    if(!denied)throw Error('A conta da aplicação recebeu privilégios indevidos.');
   }
  }finally{await appPool.end();}
  console.log('Privilégios mínimos verificados: DDL e alteração da identidade recusados.');
  await run(process.execPath,['--test','tests/mysql-roundtrip.test.js'],env);
  await run(process.execPath,['scripts/seed-fixtures.js','--confirm-fixtures='+db],{...env,FIXTURE_PASSWORD:randomBytes(18).toString('hex')});
  const [[counts]]=await root.query('SELECT (SELECT COUNT(*) FROM usuarios) AS users,(SELECT COUNT(*) FROM agendamentos) AS appointments,(SELECT COUNT(*) FROM sessoes) AS sessions');
  if(counts.users!==3||counts.appointments!==2||counts.sessions!==0)throw Error('Contagens inesperadas na carga fictícia.');
  const fixturePool=require('../database-pool').createDatabasePool(config);let c;
  try{
   c=await fixturePool.getConnection();let refused=false;
   try{await require('../database/fixtures').seed(c,config,randomBytes(18).toString('hex'));}catch(error){refused=/já existem dados/.test(error.message);}
   if(!refused)throw Error('Carga fictícia repetida deveria ser recusada.');
   const [[after]]=await c.query('SELECT COUNT(*) AS total FROM usuarios');if(after.total!==3)throw Error('Recusa modificou dados de teste.');
  }finally{c?.release();await fixturePool.end();}
  console.log('Carga fictícia repetida recusada, sem alterar a contagem.');
  console.log('Validado: 3 contas fictícias, 2 agendamentos, 0 sessões. Segunda inicialização recusada.');
  if(process.argv.includes('--phase-c3')||(process.argv.includes('--phase-c4')||process.argv.includes('--phase-d'))){
   const migrationEnv={...env,DB_INIT_USER:schemaUser,DB_INIT_PASSWORD:schemaPassword};
   await run(process.execPath,['scripts/migrate-invitations.js','--confirm-database='+db],migrationEnv);
   await run(process.execPath,['scripts/migrate-invitations.js','--confirm-database='+db],migrationEnv);
   const [[preserved]]=await root.query('SELECT (SELECT COUNT(*) FROM usuarios) AS users,(SELECT COUNT(*) FROM agendamentos) AS appointments');
   if(preserved.users!==3||preserved.appointments!==2)throw Error('Migração modificou dados fictícios anteriores.');
   await root.query('GRANT SELECT,INSERT,UPDATE,DELETE ON `'+db+'`.convites TO ?@?',[user,'127.0.0.1']);
   const adminEmail='admin-c3@example.invalid',adminPassword=randomBytes(24).toString('hex');
   await run(process.execPath,['scripts/bootstrap-admin.js','--confirm-database='+db],{...env,BOOTSTRAP_ADMIN_EMAIL:adminEmail,BOOTSTRAP_ADMIN_PASSWORD:adminPassword});
   const bootPool=require('../database-pool').createDatabasePool(config);
   try{let refused=false;try{await require('./bootstrap-admin').bootstrap(bootPool,config,{BOOTSTRAP_ADMIN_EMAIL:adminEmail,BOOTSTRAP_ADMIN_PASSWORD:adminPassword},['--confirm-database='+db]);}catch(error){refused=/Já existe administrador/.test(error.message);}if(!refused)throw Error('Bootstrap repetido deveria ser recusado.');}finally{await bootPool.end();}
   await run(process.execPath,['--test','tests/invitations.test.js','tests/access-policy.test.js','tests/registration-compat.test.js'],{...env,C3_ADMIN_EMAIL:adminEmail,C3_ADMIN_PASSWORD:adminPassword});
   console.log('C3: migração idempotente, bootstrap separado e convites validados exclusivamente no banco descartável.');
   if(process.argv.includes('--phase-c4')||process.argv.includes('--phase-d')){
    const restoreDb='avelu_test_restore_'+randomBytes(6).toString('hex');
    await root.query('CREATE DATABASE '+restoreDb+' CHARACTER SET utf8mb4');
    const restoreUser='restore_'+randomBytes(6).toString('hex'),restorePassword=randomBytes(24).toString('hex');
    await root.query('CREATE USER ?@? IDENTIFIED BY ?',[restoreUser,'127.0.0.1',restorePassword]);
    await root.query('GRANT ALL ON '+restoreDb+'.* TO ?@?',[restoreUser,'127.0.0.1']);
    const backupDir=path.join(dir,'backups'),backupUser=db+'_backup',backupPassword=randomBytes(24).toString('hex');
    await root.query('CREATE USER ?@? IDENTIFIED BY ?',[backupUser,'127.0.0.1',backupPassword]);
    await root.query('GRANT SELECT,SHOW VIEW,TRIGGER,EVENT ON '+db+'.* TO ?@?',[backupUser,'127.0.0.1']);
    await root.query('GRANT SHOW_ROUTINE ON *.* TO ?@?',[backupUser,'127.0.0.1']);
    await run(process.execPath,['--test','tests/operational.test.js'],{...env,BACKUP_DIR:backupDir,BACKUP_KEY:randomBytes(32).toString('hex'),BACKUP_REMOTE_URL:'',BACKUP_REMOTE_TOKEN:'',BACKUP_DB_USER:backupUser,BACKUP_DB_PASSWORD:backupPassword,MYSQLDUMP_PATH:dumpPath,MYSQL_PATH:mysqlPath,RESTORE_DB_NAME:restoreDb,RESTORE_DB_USER:restoreUser,RESTORE_DB_PASSWORD:restorePassword,RESTORE_EXPECTED_DATADIR:data});
   }

  }

  if(process.argv.includes('--phase-d')){
   const failures=[];
   for(const suite of ['admin','auth-booking','experience','operations','scheduling','team']){
    const name='avelu_test_reg_'+randomBytes(4).toString('hex'),actor=name+'_app',secret=randomBytes(24).toString('hex');
    await root.query('CREATE DATABASE '+name+' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    const testEnv={...env,DB_NAME:name,DB_TEST_CONFIRM:name,DB_USER:actor,DB_PASSWORD:secret,HOMOLOGATION_MODE:'false',INVITE_ONLY:'false'};
    const testConfig=require('../config').loadConfig(testEnv);
    // Prepared statements retain their schema: never reuse a connection across databases.
    const isolated=await mysql.createConnection({host:'127.0.0.1',port,user:'root',password:'',database:name});
    try{
     const [[identity]]=await isolated.query('SELECT @@datadir AS dir');
     if(canonical(identity.dir)!==canonical(data))throw Error('Regression isolation check failed.');
     await initialize(isolated,testConfig);
     await require('../database/fixtures').seed(isolated,testConfig,randomBytes(24).toString('hex'));
     if(suite==='admin')await require('./setup-specialties').setupSpecialties(isolated);
    }finally{await isolated.end();}
    await root.query('CREATE USER ?@? IDENTIFIED BY ?',[actor,'127.0.0.1',secret]);
    // Legacy suites prepare schema; this credential exists only on this new test database.
    await root.query('GRANT ALL ON '+name+'.* TO ?@?',[actor,'127.0.0.1']);
    console.log('Regressao isolada: '+suite);
    try{await run(process.execPath,['--test','tests/'+suite+'.test.js'],testEnv);}catch{failures.push(suite);}
   }
   if(failures.length)throw Error('Suites reprovadas: '+failures.join(', '));
  }
 }finally{
  if(root)await root.end();
  if(server.exitCode===null){server.kill();await stopped;}
  // Leave logs and fictional sandbox data for inspection; never remove external paths.
  console.log('Instância descartável encerrada. Artefatos locais de teste: '+dir);
 }
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
