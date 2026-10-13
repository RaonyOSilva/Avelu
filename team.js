const pool = require('./db');
const { currentUser, verifyPassword, passwordHash, authLimit } = require('./auth');
const { canManage, scope } = require('./team-permissions');
const validId = value => /^[1-9]\d{0,14}$/.test(String(value));
const address = r => [r.endereco,r.numero,r.complemento,r.bairro,r.cidade+'/'+r.estado].filter(Boolean).join(', ');
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const sqlDate = date => new Date(+date - 10800000).toISOString().slice(0,19).replace('T',' ');
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw fail('Informe uma data e horário válidos.',400);
  const result = new Date(value + ':00-03:00');
  if (!Number.isFinite(+result) || sqlDate(result).slice(0,16).replace(' ','T') !== value) throw fail('Data inválida.',400);
  return result;
}
async function audit(c, user, slot, action, appointment = null) {
  await c.execute('INSERT INTO agenda_eventos (usuario_id,disponibilidade_id,agendamento_id,acao) VALUES (?,?,?,?)',[user.id,slot,appointment,action]);
}
async function transaction(res, next, work) {
  let c;
  try { c = await pool.getConnection(); await c.beginTransaction(); const result = await work(c); await c.commit(); res.json(result || { ok:true }); }
  catch (error) {
    if (c) await c.rollback();
    if (error.status) return res.status(error.status).json({ error:error.message });
    if (['ER_DUP_ENTRY','ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) return res.status(409).json({ error:'A agenda foi atualizada. Recarregue e tente novamente.' });
    next(error);
  } finally { c?.release(); }
}
async function requireTeam(req,res,next) {
  try {
    req.user = await currentUser(req);
    if (!req.user) return res.status(401).json({ error:'Entre para acessar a área de atendimento.' });
    if (/^\/api\/professional(?:\/|\?|$)/i.test(req.originalUrl)) {
      const [profiles] = await pool.execute('SELECT id FROM perfis_profissionais WHERE usuario_id=? AND ativo=1',[req.user.id]);
      if (!profiles.length) return res.status(403).json({error:'Esta conta não possui um perfil profissional ativo. Entre com sua conta de profissional.'});
      req.user.ownProfessionalId=profiles[0].id;
      if(req.method==='POST' && !/^\/(?:password|appointments\/\d+\/state)\/?$/i.test(req.path)) return res.status(403).json({error:'A organização dos horários é feita pela equipe de atendimento.'});
    }
    if (!req.user.ownProfessionalId && !await canManage(req.user)) return res.status(403).json({ error:'Seu acesso à agenda precisa ser liberado pelo administrador da Avelu.' });
    next();
  } catch (error) { next(error); }
}

module.exports = function mountTeam(app) {
  app.use(['/api/team','/api/professional'], requireTeam);
  app.post(['/api/team/password','/api/professional/password'], authLimit, async (req,res,next) => {
    const b=req.body||{};
    if(typeof b.currentPassword!=='string'||b.currentPassword.length>128||typeof b.password!=='string'||b.password.length<8||b.password.length>128)return res.status(400).json({error:'Informe sua senha atual e uma nova senha de 8 a 128 caracteres.'});
    await transaction(res,next,async c=>{
      const [rows]=await c.execute('SELECT senha_hash FROM usuarios WHERE id=? FOR UPDATE',[req.user.id]);
      if(!rows.length||!await verifyPassword(b.currentPassword,rows[0].senha_hash))throw fail('Senha atual incorreta.',400);
      await c.execute('UPDATE usuarios SET senha_hash=? WHERE id=?',[await passwordHash(b.password),req.user.id]);
      await c.execute('DELETE FROM sessoes WHERE usuario_id=?',[req.user.id]);
      await c.execute('DELETE FROM recuperacoes_senha WHERE usuario_id=?',[req.user.id]);
    });
  });
  app.get(['/api/team/context','/api/professional/context'], async (req,res,next) => {
    const access = scope(req.user,'pl');
    try {
      const [pairs] = await pool.execute(`SELECT pl.profissional_id,pl.local_id,u.nome_completo AS profissional,l.nome AS local,
        p.ativo AND u.ativo AND l.ativo AND u.senha_hash<>'CONTA_DEMONSTRACAO_SEM_LOGIN' AS publicado
        FROM profissionais_locais pl JOIN perfis_profissionais p ON p.id=pl.profissional_id
        JOIN usuarios u ON u.id=p.usuario_id JOIN locais_atendimento l ON l.id=pl.local_id
        WHERE ${access.sql} ORDER BY u.nome_completo,l.nome`,access.values);
      // A autorização do local existe mesmo antes de cadastrar sua equipe.
      const [places] = await pool.execute(`SELECT l.id,l.nome AS name,l.ativo FROM locais_atendimento l
        WHERE ${req.user.ownProfessionalId ? 'EXISTS (SELECT 1 FROM profissionais_locais pl WHERE pl.local_id=l.id AND pl.profissional_id=?)' : req.user.role === 'administrador' ? '1=1' : `EXISTS (SELECT 1 FROM gestao_acessos g WHERE g.usuario_id=? AND
          (g.local_id=l.id OR EXISTS (SELECT 1 FROM profissionais_locais pl WHERE pl.local_id=l.id AND pl.profissional_id=g.profissional_id)))`}
        ORDER BY l.nome`,req.user.ownProfessionalId ? [req.user.ownProfessionalId] : req.user.role === 'administrador' ? [] : [req.user.id]);
      res.json({ user:{name:req.user.name,role:req.user.role},pairs,places });
    } catch (error) { next(error); }
  });
  app.get(['/api/team/agenda','/api/professional/agenda'], async (req,res,next) => {
    try {
      const start = date(String(req.query.dia || '')+'T00:00');
      const end = new Date(+start+86400000);
      const professional = req.query.profissional || '', local = req.query.local || '';
      if ((professional&&!validId(professional)) || (local&&!validId(local))) throw fail('Filtros inválidos.',400);
      const access = scope(req.user);
      const [rows] = await pool.execute(`SELECT d.id,d.profissional_id,d.local_id,
        DATE_FORMAT(d.inicio_em,'%Y-%m-%dT%H:%i:%s-03:00') AS inicio_em,
        DATE_FORMAT(d.fim_em,'%Y-%m-%dT%H:%i:%s-03:00') AS fim_em,d.status,d.valor,
        u.nome_completo AS profissional,l.nome AS local,p.ativo AND u.ativo AND l.ativo AS publicado,
        a.id AS agendamento_id,a.status AS agendamento_status,a.origem,
        COALESCE(a.nome_paciente,pu.nome_completo) AS paciente,
        COALESCE(a.telefone_paciente,pu.telefone) AS telefone,
        COALESCE(a.email_paciente,pu.email) AS email
        FROM disponibilidades d JOIN perfis_profissionais p ON p.id=d.profissional_id
        JOIN usuarios u ON u.id=p.usuario_id LEFT JOIN locais_atendimento l ON l.id=d.local_id
        LEFT JOIN agendamentos a ON a.disponibilidade_id=d.id AND a.status IN ('agendado','confirmado','concluido')
        LEFT JOIN usuarios pu ON pu.id=a.paciente_id
        WHERE ${access.sql} AND d.inicio_em>=? AND d.inicio_em<?
          AND (?='' OR d.profissional_id=?) AND (?='' OR d.local_id=?) ORDER BY d.inicio_em,u.nome_completo LIMIT 1001`,
      [...access.values,sqlDate(start),sqlDate(end),professional,professional,local,local]);
      const [cancelled] = await pool.execute(`SELECT a.id,a.nome_paciente,a.motivo_cancelamento,
        COALESCE(a.nome_paciente,pu.nome_completo) AS paciente,u.nome_completo AS profissional,l.nome AS local,
        DATE_FORMAT(d.inicio_em,'%Y-%m-%dT%H:%i:%s-03:00') AS inicio_em
        FROM agendamentos a JOIN disponibilidades d ON d.id=a.disponibilidade_id
        JOIN perfis_profissionais p ON p.id=d.profissional_id JOIN usuarios u ON u.id=p.usuario_id
        LEFT JOIN locais_atendimento l ON l.id=d.local_id LEFT JOIN usuarios pu ON pu.id=a.paciente_id
        WHERE ${access.sql} AND a.status='cancelado' AND d.inicio_em>=? AND d.inicio_em<?
          AND (?='' OR d.profissional_id=?) AND (?='' OR d.local_id=?) ORDER BY d.inicio_em LIMIT 1001`,
      [...access.values,sqlDate(start),sqlDate(end),professional,professional,local,local]);
      res.json({ slots:rows.slice(0,1000),cancelled:cancelled.slice(0,1000),truncated:rows.length>1000||cancelled.length>1000 });
    } catch (error) { if(error.status)return res.status(error.status).json({error:error.message});next(error); }
  });
  app.post(['/api/team/availability','/api/professional/availability'], async (req,res,next) => {
    const b=req.body||{};
    let start,end,duration,price;
    try {
      if(!validId(b.profissional_id)||!validId(b.local_id))throw fail('Selecione profissional e local.',400);
      start=date(b.inicio);end=date(b.fim);duration=Number(b.duracao);
      price=b.valor===''||b.valor==null?null:Number(b.valor);
      if(start<=new Date()||end<=start||end-start>43200000||!Number.isInteger(duration)||duration<5||duration>240||(end-start)%(duration*60000)!==0||(end-start)/(duration*60000)>96)throw fail('Use um intervalo futuro de até 12 horas, dividido em consultas de 5 a 240 minutos, sem sobras.',400);
      if(price!==null&&(!Number.isFinite(price)||price<0||price>999999.99))throw fail('Informe um valor válido.',400);
    } catch(error){return res.status(error.status||400).json({error:error.message});}
    await transaction(res,next,async c=>{
      // O mesmo bloqueio usado pela agenda administrativa serializa publicações concorrentes.
      await c.execute('SELECT id FROM perfis_profissionais WHERE id=? FOR UPDATE',[b.profissional_id]);
      const access=scope(req.user,'pl');
      const [pairs]=await c.execute(`SELECT pl.local_id FROM profissionais_locais pl JOIN perfis_profissionais p ON p.id=pl.profissional_id
        JOIN usuarios u ON u.id=p.usuario_id JOIN locais_atendimento l ON l.id=pl.local_id
        WHERE pl.profissional_id=? AND pl.local_id=? AND p.ativo=1 AND u.ativo=1 AND l.ativo=1
        AND u.senha_hash<>'CONTA_DEMONSTRACAO_SEM_LOGIN' AND ${access.sql}`,[b.profissional_id,b.local_id,...access.values]);
      if(!pairs.length)throw fail('Você não tem acesso a este vínculo publicado.',403);
      const [overlap]=await c.execute("SELECT id FROM disponibilidades WHERE profissional_id=? AND inicio_em<? AND fim_em>? AND status<>'bloqueado'",[b.profissional_id,sqlDate(end),sqlDate(start)]);
      if(overlap.length)throw fail('Este profissional já possui horários nesse intervalo, inclusive em outros locais.');
      let created=0;
      for(let time=+start;time<+end;time+=duration*60000){
        const [slot]=await c.execute('INSERT INTO disponibilidades (profissional_id,local_id,inicio_em,fim_em,valor) VALUES (?,?,?,?,?)',[b.profissional_id,b.local_id,sqlDate(new Date(time)),sqlDate(new Date(time+duration*60000)),price]);
        await audit(c,req.user,slot.insertId,'publicar');created++;
      }
      return {created};
    });
  });
  app.post(['/api/team/availability/:id/state','/api/professional/availability/:id/state'],async(req,res,next)=>{
    if(!validId(req.params.id)||!['bloqueado','disponivel'].includes(req.body?.status))return res.status(400).json({error:'Selecione uma ação válida.'});
    await transaction(res,next,async c=>{
      const access=scope(req.user);
      const [initial]=await c.execute(`SELECT d.profissional_id FROM disponibilidades d WHERE d.id=? AND ${access.sql}`,[req.params.id,...access.values]);
      if(!initial.length)throw fail('Horário não encontrado.',404);
      await c.execute('SELECT id FROM perfis_profissionais WHERE id=? FOR UPDATE',[initial[0].profissional_id]);
      const [rows]=await c.execute(`SELECT d.* FROM disponibilidades d WHERE d.id=? AND ${access.sql} AND d.inicio_em>NOW() FOR UPDATE`,[req.params.id,...access.values]);
      const slot=rows[0];if(!slot)throw fail('Este horário já passou ou não está disponível para alteração.');
      if(slot.status==='reservado')throw fail('Cancele o agendamento antes de bloquear o horário.');
      if(req.body.status==='disponivel'){
        const [overlap]=await c.execute("SELECT id FROM disponibilidades WHERE profissional_id=? AND id<>? AND status<>'bloqueado' AND inicio_em<? AND fim_em>?",[slot.profissional_id,slot.id,slot.fim_em,slot.inicio_em]);
        if(overlap.length)throw fail('Outro horário ocupa esse intervalo.');
        const [pairs]=await c.execute(`SELECT pl.local_id FROM profissionais_locais pl JOIN perfis_profissionais p ON p.id=pl.profissional_id JOIN usuarios u ON u.id=p.usuario_id JOIN locais_atendimento l ON l.id=pl.local_id WHERE pl.profissional_id=? AND pl.local_id=? AND p.ativo=1 AND u.ativo=1 AND l.ativo=1 AND u.senha_hash<>'CONTA_DEMONSTRACAO_SEM_LOGIN'`,[slot.profissional_id,slot.local_id]);
        if(!pairs.length)throw fail('Publique e vincule o profissional e o local antes de reabrir.');
      }
      await c.execute('UPDATE disponibilidades SET status=? WHERE id=?',[req.body.status,slot.id]);
      await audit(c,req.user,slot.id,req.body.status==='bloqueado'?'bloquear':'reabrir');
    });
  });
  app.post(['/api/team/appointments','/api/professional/appointments'],async(req,res,next)=>{
    const b=req.body||{},phone=typeof b.telefone==='string'?b.telefone.replace(/\D/g,''):'';
    if(!validId(b.slotId)||typeof b.nome!=='string'||b.nome.trim().length<2||b.nome.trim().length>150||typeof b.telefone!=='string'||b.telefone.length>30||!/^\+?[\d\s().-]+$/.test(b.telefone)||!/^\d{10,15}$/.test(phone)||(b.email!==undefined&&b.email!==''&& (typeof b.email!=='string'||b.email.length>190||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()))))return res.status(400).json({error:'Informe nome, telefone com DDD e, se preenchido, e-mail válido.'});
    await transaction(res,next,async c=>{
      const access=scope(req.user);
      const [rows]=await c.execute(`SELECT d.*,l.nome AS local_nome,l.endereco,l.numero,l.complemento,l.bairro,l.cidade,l.estado
        FROM disponibilidades d JOIN perfis_profissionais p ON p.id=d.profissional_id JOIN usuarios u ON u.id=p.usuario_id
        JOIN locais_atendimento l ON l.id=d.local_id JOIN profissionais_locais pl ON pl.local_id=d.local_id AND pl.profissional_id=d.profissional_id
        WHERE d.id=? AND ${access.sql} AND d.status='disponivel' AND d.inicio_em>NOW() AND p.ativo=1 AND u.ativo=1 AND l.ativo=1
        AND u.senha_hash<>'CONTA_DEMONSTRACAO_SEM_LOGIN' FOR UPDATE`,[b.slotId,...access.values]);
      const slot=rows[0];if(!slot)throw fail('Horário indisponível ou fora do seu acesso.');
      const [result]=await c.execute(`INSERT INTO agendamentos (paciente_id,profissional_id,disponibilidade_id,local_nome,local_endereco,valor,origem,nome_paciente,telefone_paciente,email_paciente)
        VALUES (NULL,?,?,?,?,?,'manual',?,?,?)`,[slot.profissional_id,slot.id,slot.local_nome,address(slot),slot.valor,b.nome.trim(),phone,b.email?.trim().toLowerCase()||null]);
      await c.execute("UPDATE disponibilidades SET status='reservado' WHERE id=?",[slot.id]);
      await audit(c,req.user,slot.id,'agendar_manual',result.insertId);
      return {id:result.insertId};
    });
  });
  app.post(['/api/team/appointments/:id/state','/api/professional/appointments/:id/state'],async(req,res,next)=>{
    const b=req.body||{};
    if(req.user.ownProfessionalId && !['cancelado','concluido'].includes(b.status))return res.status(403).json({error:'A confirmação da agenda é feita pela equipe de atendimento.'});
    if(!validId(req.params.id)||!['confirmado','cancelado','concluido'].includes(b.status)||(b.status==='cancelado'&&(typeof b.motivo!=='string'||!b.motivo.trim()||b.motivo.length>500||typeof b.liberar!=='boolean')))return res.status(400).json({error:'Informe uma ação válida e o motivo do cancelamento.'});
    await transaction(res,next,async c=>{
      const access=scope(req.user);
      const [rows]=await c.execute(`SELECT a.id,a.status,a.disponibilidade_id,d.inicio_em,DATE_FORMAT(d.inicio_em,'%Y-%m-%d') AS dia FROM agendamentos a JOIN disponibilidades d ON d.id=a.disponibilidade_id WHERE a.id=? AND ${access.sql} FOR UPDATE`,[req.params.id,...access.values]);
      const appointment=rows[0];if(!appointment)throw fail('Agendamento não encontrado.',404);
      if(req.user.ownProfessionalId && (appointment.status!=='confirmado'||b.liberar===true))throw fail('Somente atendimentos confirmados podem ser realizados ou cancelados. A reabertura de horários cabe à equipe.');
      if(!['agendado','confirmado'].includes(appointment.status))throw fail('Este agendamento já foi encerrado.');
      if(b.status==='concluido'&&req.user.ownProfessionalId&&appointment.dia!==new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))throw fail('O atendimento pode ser realizado somente na data agendada.');
      if(b.status==='concluido'&&!req.user.ownProfessionalId&&new Date(appointment.inicio_em)>new Date())throw fail('O atendimento ainda não começou.');
      if(b.status==='confirmado'&&appointment.status!=='agendado')throw fail('O atendimento já está confirmado.');
      await c.execute('UPDATE agendamentos SET status=?,motivo_cancelamento=? WHERE id=?',[b.status,b.status==='cancelado'?b.motivo.trim():null,appointment.id]);
      if(b.status==='cancelado')await c.execute('UPDATE disponibilidades SET status=? WHERE id=?',[b.liberar?'disponivel':'bloqueado',appointment.disponibilidade_id]);
      await audit(c,req.user,appointment.disponibilidade_id,b.status,appointment.id);
    });
  });
};
