const express = require('express');
const pool = require('./db');
const cityFilter = require('./city-filter');
const { requireAdmin } = require('./auth');
const { selection, saveSelection, attachSelection } = require('./specialties');
const router = express.Router();
router.use(requireAdmin);
const validId = value => /^[1-9]\d{0,14}$/.test(String(value));
function invalid(message) { const error = new Error(message); error.status = 400; throw error; }
function text(body, key, max, required = false) {
  const value = body[key] ?? '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) invalid(`Preencha corretamente o campo ${key}.`);
  return value.trim();
}
function phone(body) {
  const value = text(body, 'telefone', 30);
  const digits = value.replace(/\D/g, '');
  if (value && (!/^\+?[\d\s().-]+$/.test(value) || digits.length < 10 || digits.length > 15)) invalid('Informe um telefone válido com DDD.');
  return digits || null;
}
function email(body, required = false) {
  const value = text(body, 'email', 190, required).toLowerCase();
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) invalid('Informe um e-mail válido.');
  return value || null;
}
function publicContacts(body){
  const value=text(body,'whatsapp',30);
  let whatsapp=value.replace(/\D/g,'');
  if(value&&(!/^\+?[\d\s().-]+$/.test(value)||whatsapp.length<10||whatsapp.length>15))invalid('Informe um WhatsApp válido com DDD (e DDI para números internacionais).');
  if(whatsapp.length===10||whatsapp.length===11)whatsapp='55'+whatsapp;
  const emailPublico=email({email:body.email_publico});
  return [whatsapp||null,emailPublico];
}
function publicSite(body){
  const site=text(body,'site',500);
  if(site){let url;try{url=new URL(site);}catch{invalid('Informe um site HTTP ou HTTPS válido.');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)invalid('Informe um site HTTP ou HTTPS válido.');}
  return site||null;
}
function ids(body, field) {
  const values = body[field] ?? [];
  if (!Array.isArray(values) || values.length > 100 || values.some(value => !validId(value))) invalid('Selecione vínculos válidos.');
  return [...new Set(values.map(String))];
}
function active(body) {
  if (typeof body.ativo !== 'boolean') invalid('Informe se o cadastro deve ser publicado.');
  return body.ativo;
}
const states = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
function placeData(body) {
  const tipo = text(body, 'tipo', 30, true);
  if (!['clinica','consultorio','hospital','laboratorio','centro_medico','outro'].includes(tipo)) invalid('Selecione o tipo do local.');
  const estado = text(body, 'estado', 2, true).toUpperCase();
  if (!states.has(estado)) invalid('Selecione uma UF válida.');
  const cepText = text(body, 'cep', 9);
  if (cepText && !/^\d{5}-?\d{3}$/.test(cepText)) invalid('Informe um CEP com 8 dígitos.');
  const site = text(body, 'site', 500);
  if (site) {
    let url; try { url = new URL(site); } catch { invalid('Informe o site completo, começando com https://.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) invalid('Informe um site HTTP ou HTTPS válido.');
  }
  return [text(body, 'nome', 150, true), tipo, text(body, 'descricao', 5000), phone(body), email(body), site || null,
    cepText.replace(/\D/g, '') || null, text(body, 'endereco', 190, true), text(body, 'numero', 20), text(body, 'complemento', 100),
    text(body, 'bairro', 100), text(body, 'cidade', 100, true), estado, active(body)];
}
function handleError(error, response, next) {
  if (error.status) return response.status(error.status).json({ error: error.message });
  if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'Este e-mail já está vinculado a uma conta. Use outro e-mail ou edite o profissional existente.' });
  if (error.code === 'ER_NO_REFERENCED_ROW_2') return response.status(400).json({ error: 'Um dos vínculos selecionados não existe mais. Atualize a página.' });
  next(error);
}
router.param('id', (request, response, next, id) => validId(id) ? next() : response.status(400).json({ error: 'Cadastro inválido.' }));

router.get('/places', async (_request, response, next) => {
  try { const [rows] = await pool.query('SELECT * FROM locais_atendimento ORDER BY nome, id'); response.json(await attachSelection(rows, 'place')); } catch (error) { next(error); }
});
async function savePlace(request, response, next) {
  let connection;
  try {
    const values = placeData(request.body || {});
    const contacts=publicContacts(request.body||{});
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const chosen = await selection(connection, request.body || {});
    let id = request.params.id;
    if (id) {
      const [result] = await connection.execute('UPDATE locais_atendimento SET nome=?,tipo=?,descricao=?,telefone=?,email=?,site=?,cep=?,endereco=?,numero=?,complemento=?,bairro=?,cidade=?,estado=?,ativo=? WHERE id=?', [...values, id]);
      if (!result.affectedRows) { const error = new Error('Local não encontrado.'); error.status=404; throw error; }
    } else {
      const [result] = await connection.execute('INSERT INTO locais_atendimento (nome,tipo,descricao,telefone,email,site,cep,endereco,numero,complemento,bairro,cidade,estado,ativo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', values);
      id = result.insertId;
    }
    await connection.execute('UPDATE locais_atendimento SET whatsapp=?,email_publico=? WHERE id=?',[...contacts,id]);
    await saveSelection(connection, 'place', id, chosen);
    await connection.commit();
    response.status(request.params.id ? 200 : 201).json({ id: Number(id) });
  } catch (error) { if (connection) await connection.rollback(); handleError(error, response, next); }
  finally { connection?.release(); }
}
router.post('/places', savePlace);
router.put('/places/:id', savePlace);
router.get('/professionals', async (_request, response, next) => {
  try {
    const [rows] = await pool.query(`SELECT p.id, u.nome_completo AS nome, u.email, u.telefone, p.titulo_profissional AS titulo,
      p.numero_registro AS registro, p.biografia, p.ativo,(u.senha_hash='CONTA_DEMONSTRACAO_SEM_LOGIN') AS demonstracao,p.whatsapp,p.email_publico,p.site FROM perfis_profissionais p JOIN usuarios u ON u.id=p.usuario_id ORDER BY u.nome_completo, p.id`);
    const [links] = await pool.query('SELECT profissional_id, local_id FROM profissionais_locais');
    response.json(await attachSelection(rows.map(row => ({ ...row, locais: links.filter(link => link.profissional_id === row.id).map(link => link.local_id) })), 'professional'));
  } catch (error) { next(error); }
});
async function saveProfessional(request, response, next) {
  let connection;
  try {
    const body = request.body || {};
    const nome = text(body, 'nome', 150, true);
    const titulo = text(body, 'titulo', 150, true);
    const mail = email(body, true);
    const telefone = phone(body);
    const contacts=publicContacts(body);
    const site=publicSite(body);
    const registro = text(body, 'registro', 80);
    const biografia = text(body, 'biografia', 5000);
    const ativo = active(body);
    const locais = ids(body, 'locais');
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const chosen = await selection(connection, body);
    let id = request.params.id;
    if (id) {
      const [rows] = await connection.execute('SELECT usuario_id FROM perfis_profissionais WHERE id=? FOR UPDATE', [id]);
      if (!rows.length) { const error = new Error('Profissional não encontrado.'); error.status = 404; throw error; }
      await connection.execute('UPDATE usuarios SET nome_completo=?, email=?, telefone=? WHERE id=?', [nome, mail, telefone, rows[0].usuario_id]);
      await connection.execute('UPDATE perfis_profissionais SET titulo_profissional=?, numero_registro=?, biografia=?, ativo=? WHERE id=?', [titulo, registro, biografia, ativo, id]);
    } else {
      // Cadastro no diretório; não cria senha nem concede acesso ao profissional.
      const [user] = await connection.execute("INSERT INTO usuarios (tipo,nome_completo,email,telefone,senha_hash) VALUES ('profissional',?,?,?,'CADASTRO_ADMINISTRATIVO_SEM_LOGIN')", [nome, mail, telefone]);
      const [profile] = await connection.execute('INSERT INTO perfis_profissionais (usuario_id,titulo_profissional,numero_registro,biografia,ativo) VALUES (?,?,?,?,?)', [user.insertId, titulo, registro, biografia, ativo]);
      id = profile.insertId;
    }
    await connection.execute('UPDATE perfis_profissionais SET whatsapp=?,email_publico=?,site=? WHERE id=?',[...contacts,site,id]);
    await connection.execute('DELETE FROM profissionais_locais WHERE profissional_id=?', [id]);
    for (const local of locais) await connection.execute('INSERT INTO profissionais_locais (profissional_id,local_id) VALUES (?,?)', [id, local]);
    await saveSelection(connection, 'professional', id, chosen);
    await connection.commit();
    response.status(request.params.id ? 200 : 201).json({ id: Number(id) });
  } catch (error) { if (connection) await connection.rollback(); handleError(error, response, next); }
  finally { connection?.release(); }
}
router.post('/professionals', saveProfessional);
router.put('/professionals/:id', saveProfessional);

router.post('/specialties', async (request, response, next) => {
  let connection;
  try {
    const body = request.body || {};
    const nome = text(body, 'nome', 120, true);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    let result;
    if (body.especialidade_id) {
      if (!validId(body.especialidade_id)) invalid('Selecione uma especialidade válida.');
      const [rows] = await connection.execute('SELECT id FROM especialidades WHERE id=? AND ativo=1', [body.especialidade_id]);
      if (!rows.length) invalid('Especialidade não encontrada.');
      [result] = await connection.execute('INSERT INTO areas_especialidades (especialidade_id,nome) VALUES (?,?)', [body.especialidade_id,nome]);
    } else {
      const grupo = text(body, 'grupo', 100, true);
      const slug = require('./scripts/setup-specialties').slug(nome);
      if (!slug) invalid('Informe um nome válido.');
      [result] = await connection.execute('INSERT INTO especialidades (nome,slug) VALUES (?,?)', [nome,slug]);
      await connection.execute('INSERT INTO categorias_especialidades (especialidade_id,grupo) VALUES (?,?)', [result.insertId,grupo]);
    }
    await connection.commit(); response.status(201).json({ id:result.insertId });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.code==='ER_DUP_ENTRY') return response.status(409).json({error:'Esta opção já existe no catálogo.'});
    handleError(error,response,next);
  } finally { connection?.release(); }
});

module.exports = function mountAdmin(app) {
  app.use('/api/admin', router);
  app.get('/api/cities', async (_request,response,next) => {
    try {
      const [rows]=await pool.query("SELECT DISTINCT TRIM(cidade) AS cidade, estado AS uf FROM locais_atendimento WHERE ativo=1 AND TRIM(cidade)<>'' ORDER BY cidade,uf");
      response.json(rows);
    }catch(error){next(error);}
  });
  app.get('/api/places/:id', async (request,response,next) => {
    if(!validId(request.params.id))return response.status(400).json({error:'Local inválido.'});
    try{
      const [rows]=await pool.execute('SELECT id,nome,tipo,telefone,endereco,numero,complemento,bairro,cidade,estado FROM locais_atendimento WHERE id=? AND ativo=1',[request.params.id]);
      if(!rows.length)return response.status(404).json({error:'Este local não está disponível.'});
      response.json(rows[0]);
    }catch(error){next(error);}
  });
  app.get('/api/places', async (request, response, next) => {
    try {
      const term = String(request.query.q || '').trim().slice(0, 150);
      const city = cityFilter(request.query);
      if(!city)return response.status(400).json({error:'Informe uma cidade e UF válidas.'});
      const type = String(request.query.tipo || '');
      if (type && !['clinica','consultorio','hospital','laboratorio','centro_medico','outro'].includes(type)) return response.status(400).json({error:'Tipo de local inválido.'});
      const like = `%${term}%`;
      const [rows] = await pool.execute(`SELECT id,nome,tipo,descricao,telefone,site,endereco,numero,complemento,bairro,cidade,estado,cep
        FROM locais_atendimento l WHERE ativo=1 AND (?='' OR (TRIM(cidade)=? AND estado=?)) AND (?='' OR tipo=?) AND (?='' OR nome LIKE ? OR cidade LIKE ? OR descricao LIKE ?
        OR EXISTS (SELECT 1 FROM locais_especialidades le JOIN especialidades e ON e.id=le.especialidade_id WHERE le.local_id=l.id AND e.ativo=1 AND e.nome LIKE ?)
        OR EXISTS (SELECT 1 FROM locais_areas la JOIN areas_especialidades a ON a.id=la.area_id JOIN especialidades e ON e.id=a.especialidade_id WHERE la.local_id=l.id AND a.ativo=1 AND e.ativo=1 AND a.nome LIKE ?)) ORDER BY nome LIMIT 100`, [city.city, city.city, city.state, type, type, term, like, like, like, like, like]);
      response.json(await attachSelection(rows, 'place', true));
    } catch (error) { next(error); }
  });
};
