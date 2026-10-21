const { randomBytes, scrypt: scryptCallback, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const pool = require('./db');
const { canManage } = require('./team-permissions');
const scrypt = promisify(scryptCallback);
const cookieName = 'avelu_session';
const sessionDuration = 7 * 24 * 60 * 60 * 1000;
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' };
const hashToken = value => createHash('sha256').update(value).digest('hex');

function sessionToken(request) {
  const token = (request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(token || '') ? token : null;
}

async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  const valid = parts[0] === 'scrypt' && /^[a-f0-9]{32}$/.test(parts[1] || '') && /^[a-f0-9]{128}$/.test(parts[2] || '');
  const computed = await passwordHash(password, valid ? parts[1] : '0'.repeat(32));
  return valid && timingSafeEqual(Buffer.from(computed.split('$')[2], 'hex'), Buffer.from(parts[2], 'hex'));
}

async function createSession(request, response, userId) {
  const token = randomBytes(32).toString('hex');
  await pool.execute('INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, ?)', [hashToken(token), userId, new Date(Date.now() + sessionDuration)]);
  const previous = sessionToken(request);
  if (previous) await pool.execute('DELETE FROM sessoes WHERE token_hash = ?', [hashToken(previous)]);
  response.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionDuration });
}

async function hasProfessionalProfile(userId) {
  const [rows]=await pool.execute('SELECT id FROM perfis_profissionais WHERE usuario_id=? AND ativo=1 LIMIT 1',[userId]);
  return rows.length>0;
}

async function currentUser(request) {
  const token = sessionToken(request);
  if (!token) return null;
  const [rows] = await pool.execute(`SELECT u.id, u.nome_completo AS name, u.email, u.tipo AS role,u.trocar_senha AS passwordChangeRequired
    FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = ? AND s.expira_em > NOW() AND u.ativo = 1`, [hashToken(token)]);
  if (!rows.length) return null;
  return { ...rows[0], canManage: await canManage(rows[0]), isProfessional: rows[0].role==='profissional' && await hasProfessionalProfile(rows[0].id) };
}

async function requireUser(request, response, next) {
  try {
    request.user = await currentUser(request);
    if (!request.user) return response.status(401).json({ error: 'Entre na sua conta para agendar.' });
    if (request.user.role !== 'paciente') return response.status(403).json({ error: 'Use uma conta de paciente para agendar.' });
    next();
  } catch (error) { next(error); }
}

// Limite por IP nesta instância; tentativas também são limitadas por e-mail.
const attempts = new Map();
const cleanup = setInterval(() => {
  for (const [key, value] of attempts) if (value.until <= Date.now()) attempts.delete(key);
}, 60000);
cleanup.unref();
function authLimit(request, response, next) {
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
  const digest=value=>createHash('sha256').update(String(value)).digest('hex');
  const keys = [`ip:${digest(request.ip)}`, `email:${digest(email)}`];
  for (const key of keys) {
    let item = attempts.get(key);
    if(!item&&attempts.size>=10000){response.set('Retry-After','60');return response.status(429).json({error:'Muitas tentativas. Aguarde alguns minutos.'});}
    if (!item || item.until <= Date.now()) { item = { count: 0, until: Date.now() + 15 * 60000 }; attempts.set(key, item); }
    item.count++;
    if (item.count > (key.startsWith('ip:') ? 40 : 15)) {
      response.set('Retry-After', String(Math.ceil((item.until - Date.now()) / 1000)));
      return response.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    }
  }
  next();
}

function mountAuth(app, options={}) {
  const access=options.access||require('./config').loadConfig().access;
  const invitations=options.invitations||require('./invitation-service').createInvitations({pool,ttl:access.ttl,send:require('./invitation-service').mailSender(),passwordHash});
  app.post('/api/auth/register', authLimit, async (request, response, next) => {
    try {
      const { name, email, password, phone } = request.body || {};
      if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 150 ||
          typeof email !== 'string' || email.trim().length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
          typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return response.status(400).json({ error: 'Informe seu nome, um e-mail válido e uma senha de 8 a 128 caracteres.' });
      }
      const phoneText = typeof phone === 'string' ? phone.trim() : '';
      const normalizedPhone = phoneText.replace(/\D/g, '');
      if ((phone !== undefined && typeof phone !== 'string') ||
          (phoneText && (phoneText.length > 30 || !/^\+?[\d\s().-]+$/.test(phoneText) || normalizedPhone.length < 10 || normalizedPhone.length > 15))) {
        return response.status(400).json({ error: 'Informe um telefone válido com DDD, ou deixe o campo em branco.' });
      }
      const normalizedEmail = email.trim().toLowerCase();
      if(access.inviteOnly){
        const user=await invitations.consume({token:request.body?.invitationToken,email:normalizedEmail,name:name.trim(),password,phone:normalizedPhone,role:request.body?.role});
        await createSession(request,response,user.id);
        return response.status(201).json({user,redirect:require('./access-policy').loginDestination(user,request.body?.next)});
      }
      const [result] = await pool.execute("INSERT INTO usuarios (tipo, nome_completo, email, senha_hash, telefone) VALUES ('paciente', ?, ?, ?, ?)", [name.trim(), normalizedEmail, await passwordHash(password), normalizedPhone || null]);
      await createSession(request, response, result.insertId);
      response.status(201).json({ user: { id: result.insertId, name: name.trim(), email: normalizedEmail, role: 'paciente' } });
    } catch (error) {
      if(error.status)return response.status(error.status).json({error:error.message});
      if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'Este e-mail já está cadastrado. Entre na sua conta.' });
      next(error);
    }
  });
  app.post('/api/auth/login', authLimit, async (request, response, next) => {
    try {
      const { email, password } = request.body || {};
      if (typeof email !== 'string' || email.length > 190 || typeof password !== 'string' || password.length > 128) return response.status(400).json({ error: 'Informe e-mail e senha válidos.' });
      const [rows] = await pool.execute('SELECT id, nome_completo AS name, email, tipo AS role, senha_hash FROM usuarios WHERE email = ? AND ativo = 1', [email.trim().toLowerCase()]);
      const user = rows[0];
      if (!(await verifyPassword(password, user?.senha_hash)) || !user) return response.status(401).json({ error: 'E-mail ou senha incorretos.' });
      if(password.length<8){await pool.execute('UPDATE usuarios SET trocar_senha=1 WHERE id=?',[user.id]);user.passwordChangeRequired=true;}
      await createSession(request, response, user.id);
      delete user.senha_hash;
      user.canManage = await canManage(user);
      user.isProfessional = user.role==='profissional' && await hasProfessionalProfile(user.id);
      response.json({ user, redirect: require('./access-policy').loginDestination(user,request.body?.next) });
    } catch (error) { next(error); }
  });
  app.get('/api/auth/me', async (request, response, next) => {
    try { const user=await currentUser(request);response.json({ user: request.query.audience==='patient' && user?.role!=='paciente' ? null : user }); } catch (error) { next(error); }
  });
  app.post('/api/auth/logout', async (request, response, next) => {
    try {
      const token = sessionToken(request);
      if (token) await pool.execute('DELETE FROM sessoes WHERE token_hash = ?', [hashToken(token)]);
      response.clearCookie(cookieName, cookieOptions);
      response.json({ ok: true });
    } catch (error) { next(error); }
  });
}

async function requireAdmin(request, response, next) {
  try {
    request.user = await currentUser(request);
    if (!request.user) return response.status(401).json({ error: 'Entre para acessar a administração.' });
    if (request.user.role !== 'administrador') return response.status(403).json({ error: 'Esta área é exclusiva para administradores.' });
    next();
  } catch (error) { next(error); }
}

module.exports = { mountAuth, requireUser, requireAdmin, currentUser, passwordHash, verifyPassword, authLimit };
