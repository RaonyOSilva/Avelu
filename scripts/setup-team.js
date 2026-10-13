require('dotenv').config();

async function setupTeam(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS gestao_acessos (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id BIGINT UNSIGNED NOT NULL,
    profissional_id BIGINT UNSIGNED NULL,
    local_id BIGINT UNSIGNED NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (profissional_id) REFERENCES perfis_profissionais(id) ON DELETE CASCADE,
    FOREIGN KEY (local_id) REFERENCES locais_atendimento(id) ON DELETE CASCADE,
    UNIQUE KEY uq_gestao_profissional (usuario_id, profissional_id),
    UNIQUE KEY uq_gestao_local (usuario_id, local_id),
    CONSTRAINT chk_gestao_escopo CHECK ((profissional_id IS NULL) <> (local_id IS NULL))
  ) ENGINE=InnoDB`);
  const [patient] = await connection.query("SHOW COLUMNS FROM agendamentos LIKE 'paciente_id'");
  if (patient[0].Null === 'NO') await connection.query('ALTER TABLE agendamentos MODIFY paciente_id BIGINT UNSIGNED NULL');
  for (const [column, type] of [
    ['origem', "ENUM('site','manual') NOT NULL DEFAULT 'site'"],
    ['nome_paciente', 'VARCHAR(150) NULL'],
    ['telefone_paciente', 'VARCHAR(30) NULL'],
    ['email_paciente', 'VARCHAR(190) NULL'],
    ['motivo_cancelamento', 'VARCHAR(500) NULL']
  ]) {
    const [rows] = await connection.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', ['agendamentos', column]);
    if (!rows.length) await connection.query(`ALTER TABLE agendamentos ADD COLUMN ${column} ${type}`);
  }
  await connection.query(`CREATE TABLE IF NOT EXISTS agenda_eventos (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    disponibilidade_id BIGINT UNSIGNED NOT NULL,
    agendamento_id BIGINT UNSIGNED NULL,
    usuario_id BIGINT UNSIGNED NULL,
    acao VARCHAR(50) NOT NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (disponibilidade_id) REFERENCES disponibilidades(id) ON DELETE CASCADE,
    FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`);
}

module.exports = { setupTeam };
if (require.main === module) {
  const pool = require('../db');
  (async () => {
    const connection = await pool.getConnection();
    try { await setupTeam(connection); console.log('Área de atendimento preparada.'); }
    finally { connection.release(); await pool.end(); }
  })().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
}
