
require('dotenv').config();
async function setupScheduling(c){
 await c.query(`CREATE TABLE IF NOT EXISTS programacoes_agenda (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,usuario_id BIGINT UNSIGNED NOT NULL,
 profissional_id BIGINT UNSIGNED NOT NULL,local_id BIGINT UNSIGNED NOT NULL,
 configuracao JSON NOT NULL,status ENUM('ativa','pausada','concluida') NOT NULL,
 chave VARCHAR(64) NOT NULL UNIQUE,ultima_execucao DATETIME NULL,ultimo_erro VARCHAR(500) NULL,
 criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
 FOREIGN KEY(profissional_id) REFERENCES perfis_profissionais(id) ON DELETE CASCADE,
 FOREIGN KEY(local_id) REFERENCES locais_atendimento(id) ON DELETE CASCADE
 ) ENGINE=InnoDB`);
 await c.query(`CREATE TABLE IF NOT EXISTS programacao_horarios (
 programacao_id BIGINT UNSIGNED NOT NULL,disponibilidade_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(programacao_id,disponibilidade_id),UNIQUE(disponibilidade_id),
 FOREIGN KEY(programacao_id) REFERENCES programacoes_agenda(id) ON DELETE CASCADE,
 FOREIGN KEY(disponibilidade_id) REFERENCES disponibilidades(id) ON DELETE CASCADE
 ) ENGINE=InnoDB`);
}
module.exports={setupScheduling};
if(require.main===module){const pool=require('../db');setupScheduling(pool).then(()=>console.log('Programação por período preparada.')).catch(e=>{console.error(e.code||e.message);process.exitCode=1;}).finally(()=>pool.end());}
