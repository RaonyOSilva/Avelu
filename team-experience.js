
const pool=require('./db'),{scope}=require('./team-permissions');
const id=v=>/^[1-9]\d{0,14}$/.test(String(v));
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
async function transaction(res,next,work){let c;try{c=await pool.getConnection();await c.beginTransaction();const data=await work(c);await c.commit();res.json(data||{ok:true});}catch(e){if(c)await c.rollback();if(e.status)return res.status(e.status).json({error:e.message});if(['ER_DUP_ENTRY','ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(e.code))return res.status(409).json({error:'A agenda mudou. Atualize e tente novamente.'});next(e);}finally{c?.release();}}
module.exports=app=>{
 app.post('/api/team/appointments/:id/reschedule',async(req,res,next)=>{
 const b=req.body||{};if(!id(req.params.id)||!id(b.slotId))return res.status(400).json({error:'Selecione um horário disponível.'});
 await transaction(res,next,async c=>{
 const access=scope(req.user,'d');
 const [rows]=await c.execute(`SELECT a.*,d.local_id FROM agendamentos a JOIN disponibilidades d ON d.id=a.disponibilidade_id WHERE a.id=? AND ${access.sql} FOR UPDATE`,[req.params.id,...access.values]);
 const old=rows[0];if(!old)throw fail('Agendamento não encontrado.',404);
 if(!['agendado','confirmado'].includes(old.status))throw fail('Somente agendamentos ativos podem ser remarcados.');
 const [clinical]=await c.execute('SELECT agendamento_id FROM registros_atendimentos WHERE agendamento_id=?',[old.id]);
 if(clinical.length)throw fail('Este atendimento já possui registro clínico e não pode ser remarcado.');
 const [slots]=await c.execute(`SELECT d.*,l.nome,l.endereco,l.numero,l.complemento,l.bairro,l.cidade,l.estado FROM disponibilidades d
 JOIN profissionais_locais pl ON pl.profissional_id=d.profissional_id AND pl.local_id=d.local_id
 JOIN locais_atendimento l ON l.id=d.local_id AND l.ativo=1 JOIN perfis_profissionais p ON p.id=d.profissional_id AND p.ativo=1 JOIN usuarios u ON u.id=p.usuario_id AND u.ativo=1
 WHERE d.id=? AND ${access.sql} AND d.status='disponivel' AND d.inicio_em>NOW() FOR UPDATE`,[b.slotId,...access.values]);
 const target=slots[0];if(!target||String(target.profissional_id)!==String(old.profissional_id))throw fail('Escolha um horário livre do mesmo profissional, dentro do seu acesso.');
 const address=[target.endereco,target.numero,target.complemento,target.bairro,target.cidade+'/'+target.estado].filter(Boolean).join(', ');
 await c.execute("UPDATE agendamentos SET disponibilidade_id=?,local_nome=?,local_endereco=?,valor=?,status='agendado' WHERE id=?",[target.id,target.nome,address,target.valor,old.id]);
 await c.execute("UPDATE disponibilidades SET status='disponivel' WHERE id=?",[old.disponibilidade_id]);
 await c.execute("UPDATE disponibilidades SET status='reservado' WHERE id=?",[target.id]);
 for(const [slot,action] of [[old.disponibilidade_id,'remarcar_origem'],[target.id,'remarcar_destino']])await c.execute('INSERT INTO agenda_eventos(usuario_id,disponibilidade_id,agendamento_id,acao) VALUES (?,?,?,?)',[req.user.id,slot,old.id,action]);
 return {ok:true,status:'agendado'};
 });
 });
 app.get('/api/team/waitlist',async(req,res,next)=>{try{
 const access=scope(req.user,'w'),p=req.query.profissional||'',l=req.query.local||'';
 if((p&&!id(p))||(l&&!id(l)))throw fail('Filtros inválidos.',400);
 const [rows]=await pool.execute(`SELECT w.*,u.nome_completo AS profissional,l.nome AS local FROM lista_espera w JOIN perfis_profissionais p ON p.id=w.profissional_id JOIN usuarios u ON u.id=p.usuario_id JOIN locais_atendimento l ON l.id=w.local_id
 WHERE ${access.sql} AND w.status<>'encerrado' AND (?='' OR w.profissional_id=?) AND (?='' OR w.local_id=?) ORDER BY w.criado_em,w.id LIMIT 201`,[...access.values,p,p,l,l]);
 res.json({items:rows.slice(0,200),truncated:rows.length>200});
 }catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}});
 app.post('/api/team/waitlist',async(req,res,next)=>{
 const b=req.body||{},phone=typeof b.telefone==='string'?b.telefone.replace(/\D/g,''):'';
 if(!id(b.profissional_id)||!id(b.local_id)||typeof b.nome!=='string'||b.nome.trim().length<2||b.nome.length>150||!/^\d{10,15}$/.test(phone)||typeof b.preferencia!=='string'||b.preferencia.length>500)return res.status(400).json({error:'Informe nome, telefone com DDD, profissional, local e preferência de até 500 caracteres.'});
 await transaction(res,next,async c=>{const access=scope(req.user,'pl');
 const [pairs]=await c.execute(`SELECT pl.local_id FROM profissionais_locais pl JOIN perfis_profissionais p ON p.id=pl.profissional_id AND p.ativo=1 JOIN locais_atendimento l ON l.id=pl.local_id AND l.ativo=1 WHERE pl.profissional_id=? AND pl.local_id=? AND ${access.sql}`,[b.profissional_id,b.local_id,...access.values]);
 if(!pairs.length)throw fail('Vínculo fora do seu acesso.',403);
 const [r]=await c.execute('INSERT INTO lista_espera (profissional_id,local_id,nome,telefone,preferencia) VALUES (?,?,?,?,?)',[b.profissional_id,b.local_id,b.nome.trim(),phone,b.preferencia.trim()]);return{id:r.insertId};});
 });
 app.post('/api/team/waitlist/:id/state',async(req,res,next)=>{
 if(!id(req.params.id)||!['aguardando','contatado','encerrado'].includes(req.body?.status))return res.status(400).json({error:'Ação inválida.'});
 await transaction(res,next,async c=>{const access=scope(req.user,'w');const [rows]=await c.execute(`SELECT w.id FROM lista_espera w WHERE w.id=? AND ${access.sql} FOR UPDATE`,[req.params.id,...access.values]);if(!rows.length)throw fail('Registro não encontrado.',404);await c.execute('UPDATE lista_espera SET status=? WHERE id=?',[req.body.status,req.params.id]);});
 });
};
