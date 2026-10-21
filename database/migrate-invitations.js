const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
async function migrate(c,config){
 const sql=(await fs.readFile(path.join(__dirname,'migrations/003-invitations.sql'),'utf8')).replace(/\r\n/g,'\n');
 const checksum=createHash('sha256').update(sql).digest('hex');
 const [[identity]]=await c.query('SELECT ambiente,banco FROM avelu_environment WHERE id=1');
 if(!identity||identity.ambiente!==config.database.environment||identity.banco!==config.db.database||!['staging','test'].includes(identity.ambiente))throw Error('Migração C.3 exige banco identificado de homologação/teste.');
 const [[lock]]=await c.execute('SELECT GET_LOCK(?,0) AS acquired',['avelu-init:'+config.db.database]);
 if(lock.acquired!==1)throw Error('Migração em andamento.');
 try{
  const [rows]=await c.execute('SELECT checksum,applied_at FROM avelu_migrations WHERE version=?',['003-invitations.sql']);
  if(rows.length){if(rows[0].checksum===checksum&&rows[0].applied_at)return;throw Error('Migração divergente ou parcial. Inspeção manual necessária.');}
  const baseline=await require('./initialize').migrationPlan();
  const [applied]=await c.query('SELECT version,checksum,applied_at FROM avelu_migrations');
  if(baseline.some(p=>!applied.some(a=>a.version===p.name&&a.checksum===p.checksum&&a.applied_at)))throw Error('Baseline C.2 não validada.');
  const [[objects]]=await c.query("SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='convites'");
  if(Number(objects.total))throw Error('Tabela de convites já existente sem versão correspondente.');
  await c.execute('INSERT INTO avelu_migrations(version,checksum) VALUES (?,?)',['003-invitations.sql',checksum]);
  await c.query(sql);
  await c.execute('UPDATE avelu_migrations SET applied_at=CURRENT_TIMESTAMP WHERE version=?',['003-invitations.sql']);
 }finally{await c.execute('SELECT RELEASE_LOCK(?)',['avelu-init:'+config.db.database]);}
}
module.exports={migrate};
