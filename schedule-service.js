
const pool=require('./db'),{scope}=require('./team-permissions'),{normalize,evaluate,fingerprint,today,date,validId}=require('./schedule-engine');
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
async function location(c,user,config){
 const access=scope(user,'pl');
 const [rows]=await c.execute(`SELECT l.id,l.nome,l.cidade,l.estado FROM profissionais_locais pl JOIN perfis_profissionais p ON p.id=pl.profissional_id JOIN usuarios u ON u.id=p.usuario_id JOIN locais_atendimento l ON l.id=pl.local_id
 WHERE pl.profissional_id=? AND pl.local_id=? AND p.ativo=1 AND u.ativo=1 AND l.ativo=1 AND u.senha_hash<>'CONTA_DEMONSTRACAO_SEM_LOGIN' AND ${access.sql}`,[config.profissional_id,config.local_id,...access.values]);
 if(!rows.length)throw fail('Vínculo não publicado ou fora do seu acesso.',403);
 return rows[0];
}
async function evaluateDb(c,config,now){
 const [existing]=await c.execute(`SELECT d.id,d.status,DATE_FORMAT(d.inicio_em,'%Y-%m-%d %H:%i:%s') AS inicio,DATE_FORMAT(d.fim_em,'%Y-%m-%d %H:%i:%s') AS fim,l.nome AS local FROM disponibilidades d LEFT JOIN locais_atendimento l ON l.id=d.local_id WHERE d.profissional_id=? AND d.inicio_em<? AND d.fim_em>? ORDER BY d.inicio_em`,[config.profissional_id,config.fim+' 23:59:59',config.inicio+' 00:00:00']);
 return evaluate(config,existing,now);
}
function summary(result){return{created:result.created,excluded:result.excluded,expired:result.expired,deferred:result.deferred,end:result.end,days:result.days,conflictCount:result.conflicts.length,conflicts:result.conflicts.slice(0,200)};}
async function insertSlots(c,ruleId,user,config,result){
 for(let i=0;i<result.available.length;i+=250){
 const batch=result.available.slice(i,i+250),values=batch.map(s=>[config.profissional_id,config.local_id,s.inicio,s.fim,config.valor]);
 await c.query('INSERT INTO disponibilidades(profissional_id,local_id,inicio_em,fim_em,valor) VALUES ?',[values]);
 // Não presume IDs consecutivos: recupera os horários pelo vínculo e datas exatas.
 const [created]=await c.query('SELECT id FROM disponibilidades WHERE profissional_id=? AND local_id=? AND inicio_em IN (?)',[config.profissional_id,config.local_id,batch.map(s=>s.inicio)]);
 await c.query('INSERT INTO programacao_horarios(programacao_id,disponibilidade_id) VALUES ?',[created.map(s=>[ruleId,s.id])]);
 await c.query('INSERT INTO agenda_eventos(usuario_id,disponibilidade_id,acao) VALUES ?',[created.map(s=>[user.id,s.id,'publicar_periodo'])]);
 }
}
async function transaction(work,connection){let c=connection;try{c=c||await pool.getConnection();await c.beginTransaction();const result=await work(c);await c.commit();return result;}catch(e){if(c)await c.rollback();throw e;}finally{if(!connection)c?.release();}}
async function preview(user,body){
 const config=normalize(body),place=await location(pool,user,config),result=await evaluateDb(pool,config,new Date());
 return{...summary(result),key:fingerprint(config,result,place),place};
}
async function publish(user,body){
 const config=normalize(body.config);
 if(!/^[a-f0-9]{64}$/.test(body.key||''))throw fail('Gere uma prévia antes de publicar.',400);
 return transaction(async c=>{
 await c.execute('SELECT id FROM perfis_profissionais WHERE id=? FOR UPDATE',[config.profissional_id]);
 const place=await location(c,user,config);
 const [prior]=await c.execute('SELECT id,usuario_id FROM programacoes_agenda WHERE chave=?',[body.key]);
 if(prior.length){if(String(prior[0].usuario_id)!==String(user.id))throw fail('Esta programação já foi publicada. Consulte a lista.');return{id:prior[0].id,alreadyPublished:true};}
 const result=await evaluateDb(c,config,new Date());
 if(fingerprint(config,result,place)!==body.key)throw fail('A agenda mudou desde a prévia. Gere uma nova prévia antes de publicar.');
 const status=config.modo==='movel'&&config.fim>result.end?'ativa':'concluida';
 const [rule]=await c.execute('INSERT INTO programacoes_agenda(usuario_id,profissional_id,local_id,configuracao,status,chave,ultima_execucao) VALUES (?,?,?,?,?,?,NOW())',[user.id,config.profissional_id,config.local_id,JSON.stringify(config),status,body.key]);
 await insertSlots(c,rule.insertId,user,config,result);
 return{id:rule.insertId,...summary(result)};
 });
}
async function authorizedRule(c,user,id){
 if(!validId(id))throw fail('Programação inválida.',400);
 const access=scope(user,'r');
 const [rows]=await c.execute(`SELECT r.* FROM programacoes_agenda r WHERE r.id=? AND ${access.sql} FOR UPDATE`,[id,...access.values]);
 if(!rows.length)throw fail('Programação não encontrada.',404);
 return rows[0];
}
function configOf(rule){return typeof rule.configuracao==='string'?JSON.parse(rule.configuracao):rule.configuracao;}
async function changeState(user,id,status){
 if(!['ativa','pausada'].includes(status))throw fail('Estado inválido.',400);
 return transaction(async c=>{
 const rule=await authorizedRule(c,user,id),config=configOf(rule);
 if(status==='ativa'){
 if(config.modo!=='movel'||config.fim<today())throw fail('Somente uma janela móvel ainda vigente pode ser retomada.');
 await location(c,user,config);
 }
 await c.execute('UPDATE programacoes_agenda SET status=?,usuario_id=?,ultimo_erro=NULL WHERE id=?',[status,user.id,id]);
 return{ok:true};
 });
}
async function withdraw(user,id,body){
 date(body.inicio);date(body.fim);if(body.fim<body.inicio)throw fail('Período inválido.',400);
 return transaction(async c=>{
 const rule=await authorizedRule(c,user,id),config=configOf(rule);
 await c.execute('SELECT id FROM perfis_profissionais WHERE id=? FOR UPDATE',[rule.profissional_id]);
 const [slots]=await c.execute(`SELECT d.id,d.status,EXISTS(SELECT 1 FROM agendamentos a WHERE a.disponibilidade_id=d.id AND a.status IN ('agendado','confirmado','concluido')) AS reservado FROM programacao_horarios ph JOIN disponibilidades d ON d.id=ph.disponibilidade_id WHERE ph.programacao_id=? AND d.inicio_em>=? AND d.inicio_em<=? AND d.inicio_em>NOW() FOR UPDATE`,[id,body.inicio+' 00:00:00',body.fim+' 23:59:59']);
 const free=slots.filter(s=>s.status==='disponivel'&&!s.reservado);
 for(let i=0;i<free.length;i+=250){const batch=free.slice(i,i+250);await c.query("UPDATE disponibilidades SET status='bloqueado' WHERE id IN (?)",[batch.map(s=>s.id)]);await c.query('INSERT INTO agenda_eventos(usuario_id,disponibilidade_id,acao) VALUES ?',[batch.map(s=>[user.id,s.id,'retirar_periodo'])]);}
 config.excecoes.push({inicio:body.inicio,fim:body.fim,motivo:'Retirada pela equipe'});
 if(config.excecoes.length>100)throw fail('Limite de 100 exceções atingido. Pause a programação.');
 await c.execute('UPDATE programacoes_agenda SET configuracao=? WHERE id=?',[JSON.stringify(config),id]);
 return{removed:free.length,preserved:slots.filter(s=>s.reservado||s.status==='reservado').length};
 });
}
async function processRule(id,now=new Date(),connection){
 return transaction(async c=>{
 const [rows]=await c.execute("SELECT * FROM programacoes_agenda WHERE id=? AND status='ativa' FOR UPDATE",[id]);
 if(!rows.length)return;
 const rule=rows[0],config=configOf(rule);
 const [users]=await c.execute('SELECT id,tipo AS role FROM usuarios WHERE id=? AND ativo=1',[rule.usuario_id]);
 const user=users[0];
 if(!user||!['equipe','administrador'].includes(user.role)){await c.execute("UPDATE programacoes_agenda SET status='pausada',ultimo_erro='Conta responsável sem autorização.' WHERE id=?",[id]);return;}
 await c.execute('SELECT id FROM perfis_profissionais WHERE id=? FOR UPDATE',[rule.profissional_id]);
 try{await location(c,user,config);}catch(e){if(e.status===403){await c.execute("UPDATE programacoes_agenda SET status='pausada',ultimo_erro=? WHERE id=?",[e.message,id]);return;}throw e;}
 const result=await evaluateDb(c,config,now);
 await insertSlots(c,id,user,config,result);
 await c.execute("UPDATE programacoes_agenda SET status=?,ultima_execucao=NOW(),ultimo_erro=NULL WHERE id=?",[config.fim<=result.end?'concluida':'ativa',id]);
 return summary(result);
 },connection);
}
async function runRolling(now=new Date(),shouldStop=()=>false){
 const lock=await pool.getConnection();let acquired=false;
 try{
 const [[result]]=await lock.execute('SELECT GET_LOCK(?,0) AS acquired',['avelu:rolling:'+process.env.DB_NAME]);
 acquired=result.acquired===1;if(!acquired)return;
 require('./operational-log').write('schedule.started');
 const [rows]=await lock.query("SELECT id FROM programacoes_agenda WHERE status='ativa' ORDER BY ultima_execucao,id LIMIT 500");
 for(const row of rows){if(shouldStop())break;try{await processRule(row.id,now,lock);}catch(e){require('./runtime-health').failure();require('./operational-log').write('schedule.failed');await lock.execute('UPDATE programacoes_agenda SET ultima_execucao=NOW(),ultimo_erro=? WHERE id=?',['Não foi possível atualizar. Nova tentativa automática; verifique o servidor.',row.id]);}}
 require('./operational-log').write('schedule.completed',{count:rows.length});
 }finally{if(acquired)await lock.execute('SELECT RELEASE_LOCK(?)',['avelu:rolling:'+process.env.DB_NAME]).catch(()=>{});lock.release();}
}
function startWorker(){let stopping=false;const stop=require('./background-task').start(()=>runRolling(new Date(),()=>stopping),15*60000,{onError:()=>{require('./runtime-health').failure();require('./operational-log').write('schedule.failed');}});return()=>{stopping=true;return stop();};}
module.exports={preview,publish,changeState,withdraw,runRolling,processRule,startWorker,summary,configOf,location};
