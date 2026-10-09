require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const pool = require('../db');
(async () => {
  try {
    const sql = await fs.readFile(path.join(__dirname, '../database/locais.sql'), 'utf8');
    for (const statement of sql.split(';').filter(value => value.trim())) await pool.query(statement);
    const connection = await pool.getConnection();
    try { await require('./setup-specialties').setupSpecialties(connection); await require('./setup-profiles').setupProfiles(connection); }
    finally { connection.release(); }
    console.log('Tabelas de locais e vínculos preparadas.');
  } finally { await pool.end(); }
})().catch(error => { console.error('Falha ao preparar administração:', error.code); process.exitCode = 1; });
