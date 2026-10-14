
require('dotenv').config();
async function setupExperience(c){
 await c.query(`CREATE TABLE IF NOT EXISTS modelos_clinicos (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,usuario_id BIGINT UNSIGNED NOT NULL,
 titulo VARCHAR(100) NOT NULL,tipo ENUM('evolucao','receita') NOT NULL,conteudo TEXT NOT NULL,
 FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
 ) ENGINE=InnoDB`);
 await c.query(`CREATE TABLE IF NOT EXISTS lista_espera (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,profissional_id BIGINT UNSIGNED NOT NULL,local_id BIGINT UNSIGNED NOT NULL,
 nome VARCHAR(150) NOT NULL,telefone VARCHAR(30) NOT NULL,preferencia VARCHAR(500) NOT NULL DEFAULT '',
 status ENUM('aguardando','contatado','encerrado') NOT NULL DEFAULT 'aguardando',
 criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(profissional_id) REFERENCES perfis_profissionais(id) ON DELETE CASCADE,
 FOREIGN KEY(local_id) REFERENCES locais_atendimento(id) ON DELETE CASCADE
 ) ENGINE=InnoDB`);
}
module.exports={setupExperience};
if(require.main===module){const pool=require('../db');setupExperience(pool).then(()=>console.log('Melhorias preparadas.')).catch(e=>{console.error(e.code||e.message);process.exitCode=1;}).finally(()=>pool.end());}
