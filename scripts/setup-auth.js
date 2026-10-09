require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const pool = require('../db');

(async () => {
  try {
    await pool.query(await fs.readFile(path.join(__dirname, '../database/sessoes.sql'), 'utf8'));
    console.log('Tabela de sessões preparada no banco configurado.');
  } finally {
    await pool.end();
  }
})().catch(error => { console.error('Falha ao preparar sessões:', error.code); process.exitCode = 1; });
