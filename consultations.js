
const pool=require('./db');
const {currentUser}=require('./auth');
const validId=v=>/^[1-9]\d{0,14}$/.test(String(v));
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
async function appointment(c,id,userId,lock=false){
 const [rows]=await c.execute(`SELECT a.id,a.paciente_id,a.profissional_id,a.status,a.motivo,a.disponibilidade_id,
 COALESCE(a.nome_paciente,patient.nome_completo) AS paciente,
 COALESCE(a.email_paciente,patient.email) AS email,
 COALESCE(a.telefone_paciente,patient.telefone) AS telefone,
 a.local_nome AS local,a.local_endereco AS endereco,
 u.nome_completo AS profissional,p.numero_registro,p.titulo_profissional,
 DATE_FORMAT(d.inicio_em,'%Y-%m-%dT%H:%i:%s-03:00') AS inicio_em
 FROM agendamentos a JOIN perfis_profissionais p ON p.id=a.profissional_id
 JOIN usuarios u ON u.id=p.usuario_id JOIN disponibilidades d ON d.id=a.disponibilidade_id
 LEFT JOIN usuarios patient ON patient.id=a.paciente_id
 WHERE a.id=? AND p.usuario_id=? AND p.ativo=1 ${lock?'FOR UPDATE':''}`,[id,userId]);
 if(!rows.length)throw fail('Atendimento não encontrado para este profissional.',404);
 if(!['confirmado','concluido'].includes(rows[0].status))throw fail('O atendimento precisa estar confirmado pela equipe.');
 return rows[0];
}
async function record(c,id){
 const [rows]=await c.execute("SELECT evolucao,receita,versao,DATE_FORMAT(finalizado_em,'%Y-%m-%dT%H:%i:%s-03:00') AS finalizado_em FROM registros_atendimentos WHERE agendamento_id=?",[id]);
 return rows[0]||{evolucao:'',receita:'',versao:0,finalizado_em:null};
}
module.exports=app=>{
 app.use('/api/consultations',async(req,res,next)=>{
 try{req.user=await currentUser(req);if(!req.user)return res.status(401).json({error:'Entre com sua conta de profissional.'});next();}catch(e){next(e);}
 });
 app.get('/api/consultations/:id',async(req,res,next)=>{
 try{if(!validId(req.params.id))throw fail('Atendimento inválido.',400);
 const data=await appointment(pool,req.params.id,req.user.id);
 let history=[];
 if(data.paciente_id){
 [history]=await pool.execute(`SELECT a.id,a.local_nome,DATE_FORMAT(d.inicio_em,'%Y-%m-%dT%H:%i:%s-03:00') AS inicio_em,r.evolucao,r.receita
 FROM agendamentos a JOIN registros_atendimentos r ON r.agendamento_id=a.id JOIN disponibilidades d ON d.id=a.disponibilidade_id
 WHERE a.paciente_id=? AND a.profissional_id=? AND a.id<>? AND a.status='concluido' AND r.finalizado_em IS NOT NULL AND d.inicio_em<? ORDER BY d.inicio_em DESC LIMIT 50`,
 [data.paciente_id,data.profissional_id,data.id,data.inicio_em.slice(0,19).replace('T',' ')]);
 }
 res.json({appointment:data,record:await record(pool,req.params.id),history});
 }catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}
 });
 app.post('/api/consultations/:id',async(req,res,next)=>{
 const b=req.body||{};let c;
 try{
 if(!validId(req.params.id)||typeof b.evolucao!=='string'||typeof b.receita!=='string'||b.evolucao.length>30000||b.receita.length>30000||!Number.isInteger(b.versao)||b.versao<0||typeof b.finalizar!=='boolean')throw fail('Confira os textos (até 30 mil caracteres por campo).',400);
 if(b.finalizar&&!b.evolucao.trim())throw fail('Registre a evolução antes de finalizar.',400);
 c=await pool.getConnection();await c.beginTransaction();
 const data=await appointment(c,req.params.id,req.user.id,true);
 const saved=await record(c,req.params.id);
 if(saved.finalizado_em||data.status==='concluido')throw fail('Este atendimento foi finalizado e está disponível somente para consulta e impressão.');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if(data.inicio_em.slice(0,10)!==today)throw fail('O atendimento pode ser realizado somente na data agendada, em qualquer horário (horário de Brasília).');
 if(saved.versao!==b.versao)throw fail('Este registro foi alterado em outra aba. Preserve seu texto e recarregue antes de continuar.');
 await c.execute(`INSERT INTO registros_atendimentos (agendamento_id,evolucao,receita,versao,finalizado_em) VALUES (?,?,?,1,IF(?,NOW(),NULL))
 ON DUPLICATE KEY UPDATE evolucao=VALUES(evolucao),receita=VALUES(receita),versao=versao+1,finalizado_em=VALUES(finalizado_em)`,[data.id,b.evolucao,b.receita,b.finalizar]);
 if(b.finalizar)await c.execute("UPDATE agendamentos SET status='concluido' WHERE id=?",[data.id]);
 await c.execute('INSERT INTO agenda_eventos (usuario_id,disponibilidade_id,agendamento_id,acao) VALUES (?,?,?,?)',[req.user.id,data.disponibilidade_id,data.id,b.finalizar?'finalizar_registro':'salvar_registro']);
 const updated=await record(c,data.id);await c.commit();
 res.json({record:updated,status:b.finalizar?'concluido':'confirmado'});
 }catch(e){if(c)await c.rollback();if(e.status)return res.status(e.status).json({error:e.message});next(e);}finally{c?.release();}
 });
};
