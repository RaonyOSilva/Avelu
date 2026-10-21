const {randomBytes,scryptSync}=require('node:crypto');
async function bootstrap(pool,config,env,args){
 if(!['staging','test'].includes(config.database.environment)||!args.includes('--confirm-database='+config.db.database))throw Error('Bootstrap exige homologação/teste e confirmação do banco.');
 if(!require('../invitation-service').validEmail(env.BOOTSTRAP_ADMIN_EMAIL)||typeof env.BOOTSTRAP_ADMIN_PASSWORD!=='string'||env.BOOTSTRAP_ADMIN_PASSWORD.length<16||env.BOOTSTRAP_ADMIN_PASSWORD.length>128)throw Error('E-mail válido e senha de 16 a 128 caracteres obrigatórios.');
 const c=await pool.getConnection();let locked=false;
 try{
  const [[lock]]=await c.execute('SELECT GET_LOCK(?,0) AS acquired',['avelu-bootstrap:'+config.db.database]);locked=lock.acquired===1;if(!locked)throw Error('Bootstrap em andamento.');
  await c.beginTransaction();
  const [[r]]=await c.query("SELECT COUNT(*) AS total FROM usuarios WHERE tipo='administrador'");
  if(Number(r.total))throw Error('Já existe administrador. Bootstrap recusado.');
  const salt=randomBytes(16).toString('hex'),hash='scrypt$'+salt+'$'+scryptSync(env.BOOTSTRAP_ADMIN_PASSWORD,salt,64,{N:16384,r:8,p:1}).toString('hex');
  const [u]=await c.execute("INSERT INTO usuarios(tipo,nome_completo,email,senha_hash) VALUES ('administrador',?,?,?)",['Administrador fictício',env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase(),hash]);
  await c.commit();return u.insertId;
 }catch(error){await c.rollback();throw error;}finally{if(locked)await c.execute('SELECT RELEASE_LOCK(?)',['avelu-bootstrap:'+config.db.database]);c.release();}
}
async function main(){const config=require('../config').loadConfig(),pool=require('../database-pool').createDatabasePool(config);try{await bootstrap(pool,config,process.env,process.argv);console.log('Administrador inicial criado. Remova as variáveis BOOTSTRAP_ADMIN_* do ambiente.');}finally{await pool.end();}}
module.exports={bootstrap};
if(require.main===module)main().catch(()=>{console.error('Bootstrap recusado. Confira ambiente, confirmação, credenciais e ausência de administrador.');process.exitCode=1;});
