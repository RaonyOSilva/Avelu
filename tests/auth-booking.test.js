require('dotenv').config();
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const path = require('node:path');
const pool = require('../db');

test('cadastro, sessão e agendamento com MySQL', { timeout: 30000 }, async t => {
  const suffix = randomUUID();
  const email = `test-${suffix}@example.invalid`;
  const otherEmail = `other-${suffix}@example.invalid`;
  const professionalEmail = `professional-${suffix}@example.invalid`;
  let child;
  let profileId;
  let slotId;
  let placeId;
  let firstCookie;
  let secondCookie;
  let base;
  const request = async (route, body, cookie, origin) => {
    const response = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: origin || base }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie'), headers: response.headers };
  };
  try {
    child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '0', NODE_ENV: 'test', APP_ORIGIN: '', RESEND_API_KEY: '', MAIL_FROM: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Servidor de teste não iniciou.')), 10000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Servidor encerrou: ${code}`)); });
      child.stdout.on('data', buffer => { const match = buffer.toString().match(/http:\/\/localhost:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
    });
    const [professional] = await pool.execute("INSERT INTO usuarios (tipo, nome_completo, email, senha_hash) VALUES ('profissional', 'Profissional de teste', ?, 'TESTE_SEM_LOGIN')", [professionalEmail]);
    const [profile] = await pool.execute("INSERT INTO perfis_profissionais (usuario_id, titulo_profissional) VALUES (?, 'Teste automatizado')", [professional.insertId]);
    profileId = profile.insertId;
    const [place]=await pool.execute("INSERT INTO locais_atendimento (nome,tipo,endereco,cidade,estado,ativo) VALUES ('Local teste jornada','clinica','Rua teste','Governador Valadares','MG',1)");placeId=place.insertId;
    await pool.execute('INSERT INTO profissionais_locais (profissional_id,local_id) VALUES (?,?)',[profileId,placeId]);
    const [slot] = await pool.execute("INSERT INTO disponibilidades (profissional_id, local_id, inicio_em, fim_em) VALUES (?, ?, NOW() + INTERVAL 2 DAY, NOW() + INTERVAL 2 DAY + INTERVAL 30 MINUTE)", [profileId,placeId]);
    slotId = slot.insertId;

    await t.test('busca e horários públicos; reserva exige login', async () => {
      assert.equal((await request('/api/professionals')).status, 200);
      const availability = await request(`/api/professionals/${profileId}/availability`);
      assert.equal(availability.status, 200);
      assert.equal(availability.data.slots[0].id, slotId);
      assert.equal((await request('/api/appointments', { slotId })).status, 401);
    });
    await t.test('validação e proteção de origem', async () => {
      assert.equal((await request('/api/auth/register', { name: 'A', email, password: 'short' })).status, 400);
      assert.equal((await request('/api/auth/register', { name: 'Teste', email, password: 'Senha de teste 123' }, null, 'https://outside.invalid')).status, 403);
    });
    await t.test('cadastro salva hash e cria sessão privada', async () => {
      const invalid = await request('/api/auth/register', { name: 'Paciente Teste', email, password: 'Senha de teste 123', phone: '123abc' });
      assert.equal(invalid.status, 400);
      const result = await request('/api/auth/register', { name: 'Paciente Teste', email, password: 'Senha de teste 123', phone: '(33) 99999-1234', role: 'administrador' });
      assert.equal(result.status, 201);
      assert.equal(result.data.user.role, 'paciente');
      assert.match(result.cookie, /HttpOnly/);
      assert.match(result.cookie, /SameSite=Lax/);
      firstCookie = result.cookie.split(';')[0];
      const [users] = await pool.execute('SELECT senha_hash, telefone FROM usuarios WHERE email = ?', [email]);
      assert.equal(users[0].telefone, '33999991234');
      assert.match(users[0].senha_hash, /^scrypt\$/);
      assert.notEqual(users[0].senha_hash, 'Senha de teste 123');
      const me = await request('/api/auth/me', undefined, firstCookie);
      assert.equal(me.data.user.email, email);
      assert.equal(me.headers.get('cache-control'), 'no-store');
      assert.equal(me.data.user.senha_hash, undefined);
    });
    await t.test('e-mail duplicado e credenciais incorretas', async () => {
      assert.equal((await request('/api/auth/register', { name: 'Teste', email: email.toUpperCase(), password: 'Senha de teste 123' })).status, 409);
      assert.equal((await request('/api/auth/login', { email, password: 'Incorreta' })).status, 401);
      const login = await request('/api/auth/login', { email, password: 'Senha de teste 123' }, firstCookie);
      assert.equal(login.status, 200);
      assert.equal((await request('/api/auth/me', undefined, firstCookie)).data.user, null);
      firstCookie = login.cookie.split(';')[0];
    });
    await t.test('reserva concorrente permite apenas um agendamento', async () => {
      const second = await request('/api/auth/register', { name: 'Outro Paciente', email: otherEmail, password: 'Outra senha 123' });
      assert.equal(second.status, 201);
      const [users] = await pool.execute('SELECT telefone FROM usuarios WHERE email = ?', [otherEmail]);
      assert.equal(users[0].telefone, null);
      secondCookie = second.cookie.split(';')[0];
      const results = await Promise.all([request('/api/appointments', { slotId }, firstCookie), request('/api/appointments', { slotId }, secondCookie)]);
      assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
      const lists = await Promise.all([request('/api/appointments', undefined, firstCookie), request('/api/appointments', undefined, secondCookie)]);
      assert.deepEqual(lists.map(result => result.data.length).sort(), [0, 1]);
      const availability = await request(`/api/professionals/${profileId}/availability`);
      assert.equal(availability.data.slots.length, 0);
    });
    await t.test('cancelamento protege titular, libera vaga e permite nova reserva',async()=>{
      const lists=await Promise.all([request('/api/appointments',undefined,firstCookie),request('/api/appointments',undefined,secondCookie)]);
      const winner=lists[0].data.length?firstCookie:secondCookie,other=winner===firstCookie?secondCookie:firstCookie;
      const appointment=lists.find(r=>r.data.length).data[0];
      assert.equal(appointment.local_nome,'Local teste jornada');assert.match(appointment.local_endereco,/Rua teste/);
      assert.equal((await request('/api/appointments/'+appointment.id+'/cancel',{},other)).status,404);
      assert.equal((await request('/api/appointments/'+appointment.id+'/cancel',{},winner)).status,200);
      assert.equal((await request('/api/appointments/'+appointment.id+'/cancel',{},winner)).status,200);
      const booked=await request('/api/appointments',{slotId},other);assert.equal(booked.status,201);
      const [newSlot]=await pool.execute('INSERT INTO disponibilidades (profissional_id,local_id,inicio_em,fim_em,valor) VALUES (?,?,NOW()+INTERVAL 3 DAY,NOW()+INTERVAL 3 DAY+INTERVAL 30 MINUTE,180)',[profileId,placeId]);
      assert.equal((await request('/api/appointments',{slotId:newSlot.insertId,rescheduleId:booked.data.id},winner)).status,404);
      assert.equal((await request('/api/appointments',{slotId,rescheduleId:booked.data.id},other)).status,409);
      const unchanged=await request('/api/appointments',undefined,other);assert.equal(unchanged.data.find(a=>a.id===booked.data.id).status,'agendado');
      const changed=await request('/api/appointments',{slotId:newSlot.insertId,rescheduleId:booked.data.id},other);assert.equal(changed.status,200);
      const updated=await request('/api/appointments',undefined,other);assert.equal(Number(updated.data.find(a=>a.id===booked.data.id).valor),180);
      assert.ok((await request('/api/professionals/'+profileId+'/availability')).data.slots.some(s=>s.id===slotId));
      await pool.execute('UPDATE locais_atendimento SET endereco=? WHERE id=?',['Endereço alterado',placeId]);
      assert.match((await request('/api/appointments',undefined,other)).data.find(a=>a.id===booked.data.id).local_endereco,/Rua teste/);
    });
    await t.test('conta atualiza somente dados do usuário autenticado',async()=>{
      assert.equal((await request('/api/account')).status,401);
      assert.equal((await request('/api/account',{name:'Paciente atualizado',phone:'(33) 99999-1234',role:'administrador'},firstCookie)).status,200);
      const account=await request('/api/account',undefined,firstCookie);assert.equal(account.data.name,'Paciente atualizado');assert.equal(account.data.email,email);
      assert.equal((await request('/api/auth/me',undefined,firstCookie)).data.user.role,'paciente');
    });
    await t.test('sessão expirada e logout bloqueiam acesso', async () => {
      const hash = createHash('sha256').update(secondCookie.split('=')[1]).digest('hex');
      await pool.execute('UPDATE sessoes SET expira_em = NOW() - INTERVAL 1 MINUTE WHERE token_hash = ?', [hash]);
      assert.equal((await request('/api/appointments', undefined, secondCookie)).status, 401);
      assert.equal((await request('/api/auth/logout', {}, firstCookie)).status, 200);
      assert.equal((await request('/api/appointments', undefined, firstCookie)).status, 401);
    });
    await t.test('arquivos privados não são servidos; páginas públicas acessíveis', async () => {
      for (const file of ['server.js', 'auth.js', 'db.js', '.env', 'database/schema-pt.sql', 'package.json']) assert.equal((await fetch(`${base}/${file}`)).status, 404);
      for (const file of ['cadastro.html', 'entrar.html', 'agendar.html', 'agendamentos.html','buscar.html','buscar.js','buscar.css','perfil.html','perfil.js','perfil.css']) assert.equal((await fetch(`${base}/${file}`)).status, 200);
    });
    await t.test('recuperação valida expiração e uso único e revoga sessões',async()=>{
      assert.equal((await request('/api/auth/forgot',{email})).status,503);
      const [rows]=await pool.execute('SELECT id FROM usuarios WHERE email=?',[email]);
      const token=createHash('sha256').update(randomUUID()).digest('hex');
      const hash=createHash('sha256').update(token).digest('hex');
      await pool.execute('INSERT INTO recuperacoes_senha (token_hash,usuario_id,expira_em) VALUES (?,?,NOW()-INTERVAL 1 MINUTE)',[hash,rows[0].id]);
      assert.equal((await request('/api/auth/reset',{token,password:'Nova senha teste 456'})).status,400);
      await pool.execute('UPDATE recuperacoes_senha SET expira_em=NOW()+INTERVAL 10 MINUTE WHERE token_hash=?',[hash]);
      const login=await request('/api/auth/login',{email,password:'Senha de teste 123'});assert.equal(login.status,200);const cookie=login.cookie.split(';')[0];
      assert.equal((await request('/api/auth/reset',{token,password:'Nova senha teste 456'})).status,200);
      assert.equal((await request('/api/auth/me',undefined,cookie)).data.user,null);
      assert.equal((await request('/api/auth/reset',{token,password:'Outra senha teste 789'})).status,400);
      assert.equal((await request('/api/auth/login',{email,password:'Senha de teste 123'})).status,401);
      assert.equal((await request('/api/auth/login',{email,password:'Nova senha teste 456'})).status,200);
    });
    await t.test('excesso de tentativas é limitado', async () => {
      let last;
      for (let i = 0; i < 16; i++) last = await request('/api/auth/login', { email: `missing-${suffix}@example.invalid`, password: 'incorreta' });
      assert.equal(last.status, 429);
      assert.ok(Number(last.headers.get('retry-after')) > 0);
    });
  } finally {
    if (child) { const stopped = new Promise(resolve => child.once('exit', resolve)); child.kill(); await stopped; }
    if (profileId) await pool.execute('DELETE FROM agendamentos WHERE profissional_id = ?', [profileId]);
    if (profileId) await pool.execute('DELETE FROM perfis_profissionais WHERE id = ?', [profileId]);
    if(placeId)await pool.execute('DELETE FROM locais_atendimento WHERE id=?',[placeId]);
    await pool.execute('DELETE FROM usuarios WHERE email IN (?, ?, ?)', [email, otherEmail, professionalEmail]);
    await pool.end();
  }
});
