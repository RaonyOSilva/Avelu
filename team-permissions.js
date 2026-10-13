const pool = require('./db');

async function canManage(user) {
  if (!user) return false;
  if (user.role === 'administrador') return true;
  const [rows] = await pool.execute('SELECT id FROM gestao_acessos WHERE usuario_id=? LIMIT 1', [user.id]);
  return rows.length > 0;
}

// O escopo do local nunca libera a agenda do mesmo profissional em outra unidade.
function scope(user, alias = 'd') {
  if(user.ownProfessionalId)return {sql:alias+'.profissional_id=?',values:[user.ownProfessionalId]};
  return user.role === 'administrador'
    ? { sql: '1=1', values: [] }
    : { sql: `EXISTS (SELECT 1 FROM gestao_acessos ga WHERE ga.usuario_id=? AND (ga.profissional_id=${alias}.profissional_id OR ga.local_id=${alias}.local_id))`, values: [user.id] };
}

module.exports = { canManage, scope };
