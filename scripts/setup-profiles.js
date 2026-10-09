require('dotenv').config();
async function setupProfiles(connection) {
  for (const [table, column, type] of [
    ['perfis_profissionais','whatsapp','VARCHAR(15)'],
    ['perfis_profissionais','email_publico','VARCHAR(190)'],
    ['perfis_profissionais','site','VARCHAR(500)'],
    ['locais_atendimento','whatsapp','VARCHAR(15)'],
    ['locais_atendimento','email_publico','VARCHAR(190)']
  ]) {
    const [rows]=await connection.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',[table,column]);
    if(!rows.length)await connection.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type} NULL`);
  }
}
module.exports={setupProfiles};
if(require.main===module){
  const pool=require('../db');
  (async()=>{const connection=await pool.getConnection();try{await setupProfiles(connection);console.log('Contatos públicos dos perfis preparados.');}finally{connection.release();await pool.end();}})().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
}
