require('dotenv').config();
const pool = require('../db');
(async () => {
  try {
    const email = process.argv[2]?.trim().toLowerCase();
    if (!email) throw new Error('Use: npm run admin:grant -- seu-email');
    const [result] = await pool.execute("UPDATE usuarios SET tipo = 'administrador' WHERE email = ? AND ativo = 1 AND tipo IN ('paciente','administrador')", [email]);
    if (!result.affectedRows) throw new Error('Conta não encontrada ou não elegível. Cadastre primeiro uma conta de paciente.');
    console.log('Acesso administrativo concedido. Entre em /admin.html.');
  } finally { await pool.end(); }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
