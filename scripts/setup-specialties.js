require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const catalog = require('../database/catalogo-especialidades');
const slug = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
async function setupSpecialties(connection) {
  const sql = await fs.readFile(path.join(__dirname, '../database/especialidades-detalhes.sql'), 'utf8');
  for (const statement of sql.split(';').filter(value => value.trim())) await connection.query(statement);
  await connection.beginTransaction();
  try {
    for (const item of catalog) {
      await connection.execute('INSERT INTO especialidades (nome,slug) VALUES (?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)', [item.nome, slug(item.nome)]);
      const [rows] = await connection.execute('SELECT id FROM especialidades WHERE slug=? OR nome=? LIMIT 1', [slug(item.nome), item.nome]);
      const id = rows[0].id;
      await connection.execute('INSERT INTO categorias_especialidades (especialidade_id,grupo) VALUES (?,?) ON DUPLICATE KEY UPDATE grupo=VALUES(grupo)', [id, item.grupo]);
      for (const area of item.areas) await connection.execute('INSERT INTO areas_especialidades (especialidade_id,nome) VALUES (?,?) ON DUPLICATE KEY UPDATE id=id', [id, area]);
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
}
module.exports = { setupSpecialties, slug };
if (require.main === module) {
  const pool = require('../db');
  (async () => {
    const connection = await pool.getConnection();
    try { await setupSpecialties(connection); console.log(`Catálogo preparado: ${catalog.length} especialidades/categorias e ${catalog.reduce((n,item)=>n+item.areas.length,0)} detalhamentos.`); }
    finally { connection.release(); await pool.end(); }
  })().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
}
