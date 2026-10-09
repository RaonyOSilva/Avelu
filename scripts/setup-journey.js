require('dotenv').config();
async function setupJourney(connection){
  for(const [table,column,type] of [
    ['disponibilidades','local_id','BIGINT UNSIGNED NULL'],
    ['disponibilidades','valor','DECIMAL(10,2) NULL'],
    ['agendamentos','local_nome','VARCHAR(150) NULL'],
    ['agendamentos','local_endereco','VARCHAR(700) NULL'],
    ['agendamentos','valor','DECIMAL(10,2) NULL']
  ]){
    const [rows]=await connection.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',[table,column]);
    if(!rows.length)await connection.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  const [constraints]=await connection.query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='disponibilidades' AND CONSTRAINT_NAME='fk_disponibilidade_local'");
  if(!constraints.length)await connection.query('ALTER TABLE disponibilidades ADD CONSTRAINT fk_disponibilidade_local FOREIGN KEY (local_id) REFERENCES locais_atendimento(id)');
  const [generated]=await connection.query("SHOW COLUMNS FROM agendamentos LIKE 'disponibilidade_ativa_id'");
  if(!generated.length)await connection.query("ALTER TABLE agendamentos ADD COLUMN disponibilidade_ativa_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status IN ('agendado','confirmado') THEN disponibilidade_id ELSE NULL END) STORED, ADD UNIQUE KEY uq_agendamento_ativo (disponibilidade_ativa_id)");
  // Mantém a FK e permite reutilizar um horário após o cancelamento.
  const [indexes]=await connection.query('SHOW INDEX FROM agendamentos');
  const old=indexes.filter(index=>index.Non_unique===0&&index.Column_name==='disponibilidade_id'&&index.Key_name!=='PRIMARY');
  if(old.length){
    if(!indexes.some(index=>index.Key_name==='idx_agendamento_disponibilidade'))await connection.query('ALTER TABLE agendamentos ADD INDEX idx_agendamento_disponibilidade (disponibilidade_id)');
    for(const index of old){
      if(indexes.filter(item=>item.Key_name===index.Key_name).length===1){
        const quoted=String(index.Key_name).replace(/`/g,'``');
        await connection.query('ALTER TABLE agendamentos DROP INDEX `'+quoted+'`');
      }
    }
  }
  await connection.query(`CREATE TABLE IF NOT EXISTS recuperacoes_senha (
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    usuario_id BIGINT UNSIGNED NOT NULL, expira_em DATETIME NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_recuperacao_usuario (usuario_id)
  ) ENGINE=InnoDB`);
}
module.exports={setupJourney};
if(require.main===module){
  const pool=require('../db');
  (async()=>{const connection=await pool.getConnection();try{await setupJourney(connection);console.log('Estrutura de agendamento e recuperação preparada.');}finally{connection.release();await pool.end();}})().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
}
