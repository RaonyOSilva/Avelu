
require('dotenv').config();
async function setupConsultations(c){
 await c.query(`CREATE TABLE IF NOT EXISTS registros_atendimentos (
 agendamento_id BIGINT UNSIGNED PRIMARY KEY,
 evolucao MEDIUMTEXT NOT NULL,
 receita MEDIUMTEXT NOT NULL,
 versao INT UNSIGNED NOT NULL DEFAULT 1,
 finalizado_em DATETIME NULL,
 atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE CASCADE
 ) ENGINE=InnoDB`);
}
module.exports={setupConsultations};
if(require.main===module){const pool=require('../db');setupConsultations(pool).then(()=>console.log('Registros de atendimento preparados.')).catch(e=>{console.error(e.code||e.message);process.exitCode=1;}).finally(()=>pool.end());}
