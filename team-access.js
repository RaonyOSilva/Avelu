const pool = require('./db');
const { requireAdmin, passwordHash } = require('./auth');
const validId = value => /^[1-9]\d{0,14}$/.test(String(value));

module.exports = function mountTeamAccess(app) {
  app.post('/api/admin/users/:id/role',requireAdmin,async(req,res,next)=>{
   const role=req.body?.role;
   if(!validId(req.params.id)||!['paciente','profissional','equipe'].includes(role))return res.status(400).json({error:'Tipo inválido.'});
   let c;try{c=await pool.getConnection();await c.beginTransaction();const [rows]=await c.execute('SELECT tipo FROM usuarios WHERE id=? FOR UPDATE',[req.params.id]);
    if(!rows.length||rows[0].tipo==='administrador'||String(req.params.id)===String(req.user.id)){await c.rollback();return res.status(403).json({error:'Esta conta não pode ser alterada por esta ação.'});}
    if(role==='profissional'){const [p]=await c.execute('SELECT id FROM perfis_profissionais WHERE usuario_id=? AND ativo=1',[req.params.id]);if(!p.length){await c.rollback();return res.status(400).json({error:'Cadastre um perfil profissional ativo para esta conta antes de alterar o tipo.'});}}
    await c.execute('UPDATE usuarios SET tipo=? WHERE id=?',[role,req.params.id]);
    await c.execute('DELETE FROM sessoes WHERE usuario_id=?',[req.params.id]);
    await c.execute('INSERT INTO administracao_eventos(usuario_id,alvo_id,acao) VALUES (?,?,?)',[req.user.id,req.params.id,'tipo_'+rows[0].tipo+'_para_'+role]);
    await c.commit();res.json({ok:true});
   }catch(e){if(c)await c.rollback();next(e);}finally{c?.release();}
  });
  app.get('/api/admin/team-access', requireAdmin, async (req, res, next) => {
    try {
      const [rows] = await pool.query(`SELECT g.id, u.nome_completo AS nome, u.email,
        g.profissional_id, g.local_id, COALESCE(pu.nome_completo,l.nome) AS escopo
        FROM gestao_acessos g JOIN usuarios u ON u.id=g.usuario_id
        LEFT JOIN perfis_profissionais p ON p.id=g.profissional_id
        LEFT JOIN usuarios pu ON pu.id=p.usuario_id
        LEFT JOIN locais_atendimento l ON l.id=g.local_id ORDER BY u.nome_completo,g.id`);
      res.json(rows);
    } catch (error) { next(error); }
  });
  app.post('/api/admin/team-access', requireAdmin, async (req, res, next) => {
    const b = req.body || {};
    if (!['local','profissional'].includes(b.tipo) || !validId(b.escopo_id) || typeof b.email !== 'string' || b.email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim())) return res.status(400).json({ error: 'Informe e-mail e vínculo válidos.' });
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const table = b.tipo === 'local' ? 'locais_atendimento' : 'perfis_profissionais';
      const [targets] = await connection.execute(`SELECT id FROM ${table} WHERE id=?`, [b.escopo_id]);
      if (!targets.length) { await connection.rollback(); return res.status(400).json({ error: 'Vínculo não encontrado.' }); }
      const [users] = await connection.execute('SELECT id,ativo,tipo,senha_hash FROM usuarios WHERE email=? FOR UPDATE', [b.email.trim().toLowerCase()]);
      let userId = users[0]?.id;
      if (users[0] && !users[0].ativo) { await connection.rollback(); return res.status(400).json({ error: 'Esta conta está desativada.' }); }
      if(users[0]?.tipo==='paciente'){await connection.rollback();return res.status(400).json({error:'Defina explicitamente o tipo Equipe em Usuarios e permissoes antes de liberar vinculos. Clientes nao recebem acesso a equipe.'});}
      const needsPassword = !users.length || users[0].senha_hash === 'CADASTRO_ADMINISTRATIVO_SEM_LOGIN';
      if (users[0]?.senha_hash === 'CONTA_DEMONSTRACAO_SEM_LOGIN') { await connection.rollback(); return res.status(400).json({ error: 'Cadastre um profissional real para liberar acesso.' }); }
      if (needsPassword && (typeof b.senha !== 'string' || b.senha.length < 8 || b.senha.length > 128 || (!users.length && (typeof b.nome !== 'string' || b.nome.trim().length < 2 || b.nome.trim().length > 150)))) {
        await connection.rollback(); return res.status(400).json({ error: 'Para uma conta nova ou sem acesso, informe nome e uma senha inicial de 8 a 128 caracteres.' });
      }
      if (!users.length) {
        const [created] = await connection.execute("INSERT INTO usuarios (tipo,nome_completo,email,senha_hash) VALUES ('equipe',?,?,?)", [b.nome.trim(),b.email.trim().toLowerCase(),await passwordHash(b.senha)]);
        userId = created.insertId;
      } else if (needsPassword) {
        await connection.execute('UPDATE usuarios SET senha_hash=? WHERE id=?', [await passwordHash(b.senha),userId]);
      }
      const column = b.tipo === 'local' ? 'local_id' : 'profissional_id';
      await connection.execute(`INSERT INTO gestao_acessos (usuario_id,${column}) VALUES (?,?) ON DUPLICATE KEY UPDATE usuario_id=VALUES(usuario_id)`, [userId,b.escopo_id]);
      await connection.execute('INSERT INTO administracao_eventos(usuario_id,alvo_id,acao) VALUES (?,?,?)',[req.user.id,userId,'liberar_'+b.tipo+'_'+b.escopo_id]);
      await connection.commit();
      res.status(201).json({ ok: true, newAccess: needsPassword });
    } catch (error) {
      if (connection) await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A conta foi atualizada. Confira os dados e tente novamente.' });
      next(error);
    } finally { connection?.release(); }
  });
  app.delete('/api/admin/team-access/:id', requireAdmin, async (req, res, next) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Acesso inválido.' });
    try { const [rows]=await pool.execute('SELECT usuario_id FROM gestao_acessos WHERE id=?',[req.params.id]);await pool.execute('DELETE FROM gestao_acessos WHERE id=?', [req.params.id]);if(rows.length)await pool.execute('INSERT INTO administracao_eventos(usuario_id,alvo_id,acao) VALUES (?,?,?)',[req.user.id,rows[0].usuario_id,'revogar_vinculo_'+req.params.id]);res.json({ ok: true }); }
    catch (error) { next(error); }
  });
};
