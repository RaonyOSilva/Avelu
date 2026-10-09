const pool = require('./db');
async function catalog() {
  const [specialties] = await pool.query(`SELECT e.id,e.nome,e.slug,COALESCE(c.grupo,'Outras') AS grupo FROM especialidades e
    LEFT JOIN categorias_especialidades c ON c.especialidade_id=e.id WHERE e.ativo=1 ORDER BY grupo,e.nome`);
  const [areas] = await pool.query('SELECT id,especialidade_id,nome FROM areas_especialidades WHERE ativo=1 ORDER BY nome');
  return specialties.map(item => ({ ...item, areas: areas.filter(area => area.especialidade_id === item.id) }));
}
function bad(message) { const error = new Error(message); error.status = 400; throw error; }
function parseIds(values) {
  if (!Array.isArray(values) || values.length > 1000 || values.some(value => !/^[1-9]\d{0,14}$/.test(String(value)))) bad('Selecione especialidades e áreas válidas.');
  return [...new Set(values.map(String))];
}
async function selection(connection, body) {
  const specialties = parseIds(body.especialidades ?? []);
  const areaIds = parseIds(body.areas ?? []);
  let areas = [];
  if (specialties.length) {
    const [rows] = await connection.query('SELECT id FROM especialidades WHERE ativo=1 AND id IN (?)', [specialties]);
    if (rows.length !== specialties.length) bad('Uma especialidade selecionada não existe ou está inativa.');
  }
  if (areaIds.length) {
    [areas] = await connection.query('SELECT a.id,a.especialidade_id FROM areas_especialidades a JOIN especialidades e ON e.id=a.especialidade_id WHERE a.ativo=1 AND e.ativo=1 AND a.id IN (?)', [areaIds]);
    if (areas.length !== areaIds.length || areas.some(area => !specialties.includes(String(area.especialidade_id)))) bad('Cada área deve pertencer a uma especialidade selecionada.');
  }
  return { specialties, areas };
}
// Os nomes SQL vêm exclusivamente deste mapa, nunca do pedido HTTP.
const tables = { professional: ['profissionais_especialidades','profissionais_areas','profissional_id'], place: ['locais_especialidades','locais_areas','local_id'] };
async function saveSelection(connection, kind, id, chosen) {
  const [specialties, areas, owner] = tables[kind];
  await connection.execute(`DELETE FROM ${specialties} WHERE ${owner}=?`, [id]);
  for (const specialty of chosen.specialties) await connection.execute(`INSERT INTO ${specialties} (${owner},especialidade_id) VALUES (?,?)`, [id, specialty]);
  for (const area of chosen.areas) await connection.execute(`INSERT INTO ${areas} (${owner},area_id,especialidade_id) VALUES (?,?,?)`, [id, area.id, area.especialidade_id]);
}
async function attachSelection(rows, kind, publicOnly = false) {
  if (!rows.length) return rows;
  const [specialties, areas, owner] = tables[kind];
  const ids = rows.map(row => row.id);
  const [links] = await pool.query(`SELECT l.${owner} AS owner_id,e.id,e.nome FROM ${specialties} l JOIN especialidades e ON e.id=l.especialidade_id WHERE l.${owner} IN (?) ${publicOnly ? 'AND e.ativo=1' : ''} ORDER BY e.nome`, [ids]);
  const [details] = await pool.query(`SELECT l.${owner} AS owner_id,a.id,a.nome,a.especialidade_id FROM ${areas} l JOIN areas_especialidades a ON a.id=l.area_id JOIN especialidades e ON e.id=a.especialidade_id WHERE l.${owner} IN (?) ${publicOnly ? 'AND a.ativo=1 AND e.ativo=1' : ''} ORDER BY a.nome`, [ids]);
  return rows.map(row => ({ ...row, especialidades: links.filter(link=>link.owner_id===row.id).map(link=>link.id), areas: details.filter(link=>link.owner_id===row.id).map(link=>link.id), atendimentos: links.filter(link=>link.owner_id===row.id).map(link=>({ id:link.id,nome:link.nome,areas:details.filter(area=>area.owner_id===row.id && area.especialidade_id===link.id).map(area=>({id:area.id,nome:area.nome})) })) }));
}
module.exports = { catalog, selection, saveSelection, attachSelection };
