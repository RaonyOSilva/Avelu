require('dotenv').config();
async function setupOperations(c){
 for(const [table,column,type] of [
 ['usuarios','trocar_senha','TINYINT(1) NOT NULL DEFAULT 0'],
 ['agendamentos','fluxo',"ENUM('previsto','aguardando','em_atendimento','faltou') NOT NULL DEFAULT 'previsto'"],
 ['agendamentos','chegada_em','DATETIME NULL'],['agendamentos','iniciado_em','DATETIME NULL'],
 ['agendamentos','cadastro_paciente_id','BIGINT UNSIGNED NULL'],
 ['locais_atendimento','orientacoes','TEXT NULL'],['locais_atendimento','convenios','VARCHAR(1000) NULL'],
 ['locais_atendimento','particular','TINYINT(1) NOT NULL DEFAULT 1']]){
 const [r]=await c.execute('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',[table,column]);
 if(!r.length)await c.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
 }
 await c.query(`CREATE TABLE IF NOT EXISTS pacientes_recepcao(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,usuario_id BIGINT UNSIGNED NULL UNIQUE,nome VARCHAR(150) NOT NULL,telefone VARCHAR(30) NOT NULL,email VARCHAR(190) NULL,nascimento DATE NULL,criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL)`);
 await c.query(`CREATE TABLE IF NOT EXISTS pacientes_unidades(paciente_id BIGINT UNSIGNED NOT NULL,local_id BIGINT UNSIGNED NOT NULL,PRIMARY KEY(paciente_id,local_id),FOREIGN KEY(paciente_id) REFERENCES pacientes_recepcao(id) ON DELETE CASCADE,FOREIGN KEY(local_id) REFERENCES locais_atendimento(id) ON DELETE CASCADE)`);
 await c.query(`CREATE TABLE IF NOT EXISTS vinculos_paciente(token_hash CHAR(64) PRIMARY KEY,usuario_id BIGINT UNSIGNED NOT NULL,expira_em DATETIME NOT NULL,FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE)`);
 await c.query(`CREATE TABLE IF NOT EXISTS comunicacoes(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,agendamento_id BIGINT UNSIGNED NOT NULL,usuario_id BIGINT UNSIGNED NOT NULL,acao ENUM('aberta','envio_informado') NOT NULL,criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(agendamento_id) REFERENCES agendamentos(id) ON DELETE CASCADE,FOREIGN KEY(usuario_id) REFERENCES usuarios(id))`);
 await c.query(`CREATE TABLE IF NOT EXISTS administracao_eventos(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,usuario_id BIGINT UNSIGNED NULL,alvo_id BIGINT UNSIGNED NULL,acao VARCHAR(80) NOT NULL,criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
}
module.exports={setupOperations};
if(require.main===module){const p=require('../db');setupOperations(p).then(()=>console.log('Operação integrada preparada.')).catch(e=>{console.error(e.code||e.message);process.exitCode=1;}).finally(()=>p.end());}
