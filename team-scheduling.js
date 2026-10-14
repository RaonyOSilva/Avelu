
const pool=require('./db'),service=require('./schedule-service'),{scope}=require('./team-permissions'),{calendar}=require('./schedule-calendar'),{validId}=require('./schedule-engine');
const handle=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){if(e.status)return res.status(e.status).json({error:e.message});if(['ER_DUP_ENTRY','ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(e.code))return res.status(409).json({error:'A agenda mudou. Refaça a prévia e tente novamente.'});next(e);}};
module.exports=app=>{
 app.get('/api/team/schedules/calendar',handle(async(req,res)=>{
 if(!validId(req.query.profissional)||!validId(req.query.local))return res.status(400).json({error:'Selecione um profissional e um local válidos.'});
 const place=await service.location(pool,req.user,{profissional_id:req.query.profissional,local_id:req.query.local});
 res.json(calendar(place,req.query.inicio,req.query.fim));
 }));
 app.get('/api/team/schedules',handle(async(req,res)=>{
 const access=scope(req.user,'r');
 const [rows]=await pool.execute(`SELECT r.id,r.status,r.configuracao,r.ultimo_erro,DATE_FORMAT(r.ultima_execucao,'%d/%m/%Y %H:%i') AS ultima_execucao,u.nome_completo AS profissional,l.nome AS local
 FROM programacoes_agenda r JOIN perfis_profissionais p ON p.id=r.profissional_id JOIN usuarios u ON u.id=p.usuario_id JOIN locais_atendimento l ON l.id=r.local_id
 WHERE ${access.sql} ORDER BY r.id DESC LIMIT 101`,access.values);
 res.json({items:rows.slice(0,100).map(r=>({...r,configuracao:service.configOf(r)})),truncated:rows.length>100});
 }));
 app.post('/api/team/schedules/preview',handle(async(req,res)=>res.json(await service.preview(req.user,req.body))));
 app.post('/api/team/schedules',handle(async(req,res)=>res.status(201).json(await service.publish(req.user,req.body||{}))));
 app.post('/api/team/schedules/:id/state',handle(async(req,res)=>{if(!validId(req.params.id))return res.status(400).json({error:'Programação inválida.'});res.json(await service.changeState(req.user,req.params.id,req.body?.status));}));
 app.post('/api/team/schedules/:id/withdraw',handle(async(req,res)=>res.json(await service.withdraw(req.user,req.params.id,req.body||{}))));
};
