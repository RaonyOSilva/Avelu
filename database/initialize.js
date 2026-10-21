const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const versions=['001-core.sql','002-modules.sql'];
async function migrationPlan(){
 return Promise.all(versions.map(async name=>{const sql=(await fs.readFile(path.join(__dirname,'migrations',name),'utf8')).replace(/\r\n/g,'\n');
  const statements=sql.split(';').map(s=>s.trim()).filter(Boolean);
  if(statements.some(s=>!/^CREATE TABLE [a-z_]+\s*\(/.test(s)))throw Error('Baseline deve conter apenas CREATE TABLE.');
  return {name,checksum:createHash('sha256').update(sql).digest('hex'),statements};
 }));
}
function assertInit(config,env,args){
 if(!args.includes('--confirm-empty='+config.db.database))throw Error('Confirme explicitamente o nome do banco vazio com --confirm-empty.');
 if(!/^avelu_(test|staging|production)(?:_[a-z0-9]+)+$/.test(config.db.database)&&!['avelu_staging','avelu_production'].includes(config.db.database))throw Error('Use um banco novo identificado pelo ambiente.');
 if(!['test','staging','production'].includes(config.database.environment))throw Error('Inicialização exclusiva para ambientes novos de teste, homologação ou produção.');
 if(!env.DB_INIT_USER||!env.DB_INIT_PASSWORD||env.DB_INIT_USER===config.db.user)throw Error('Credenciais de inicialização separadas são obrigatórias.');
}
function connectionOptions(config,user,password){
 const {waitForConnections,connectionLimit,queueLimit,...options}=config.db;
 return {...options,user,password};
}
async function initialize(c,config,plan=undefined){
 plan=plan||await migrationPlan();
 const lock='avelu-init:'+config.db.database;
 const [[locked]]=await c.execute('SELECT GET_LOCK(?,0) AS acquired',[lock]);
 if(locked.acquired!==1)throw Error('Já existe uma inicialização em andamento.');
 try{
  const [[server]]=await c.query('SELECT VERSION() AS version, DATABASE() AS db');
  const version=server.version.split('.').map(Number);
  if(!/^8\./.test(server.version)||/mariadb/i.test(server.version)||(version[1]===0&&version[2]<16)||server.db!==config.db.database)throw Error('Exigido MySQL 8 (8.0.16 ou superior) no banco selecionado.');
  const [[objects]]=await c.execute(`SELECT
   (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=?) +
   (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=?) +
   (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA=?) AS total`,[config.db.database,config.db.database,config.db.database]);
  if(Number(objects.total)!==0)throw Object.assign(Error('Banco não vazio: inicialização recusada, inclusive após execução parcial.'),{code:'AVELU_NONEMPTY_DATABASE'});
  await c.query("SET SESSION time_zone = '-03:00'");
  await c.query('CREATE TABLE avelu_migrations (version VARCHAR(100) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP NULL) ENGINE=InnoDB');
  for(const migration of plan){
   await c.execute('INSERT INTO avelu_migrations(version,checksum) VALUES (?,?)',[migration.name,migration.checksum]);
   for(const statement of migration.statements)await c.query(statement);
   await c.execute('UPDATE avelu_migrations SET applied_at=CURRENT_TIMESTAMP WHERE version=?',[migration.name]);
  }
  await c.query('CREATE TABLE avelu_environment (id TINYINT PRIMARY KEY, ambiente VARCHAR(20) NOT NULL, banco VARCHAR(64) NOT NULL) ENGINE=InnoDB');
  await c.execute('INSERT INTO avelu_environment(id,ambiente,banco) VALUES (1,?,?)',[config.database.environment,config.db.database]);
 }finally{await c.execute('SELECT RELEASE_LOCK(?)',[lock]);}
}
module.exports={migrationPlan,assertInit,connectionOptions,initialize};
