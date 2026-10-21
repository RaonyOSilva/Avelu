const {scryptSync,randomBytes}=require('node:crypto');
function assertFixtures(config,env,args){
 if(!['test','staging'].includes(config.database.environment)||!args.includes('--confirm-fixtures='+config.db.database))throw Error('Carga fictícia exige homologação/teste e confirmação explícita do banco.');
 if(!env.FIXTURE_PASSWORD||env.FIXTURE_PASSWORD.length<12)throw Error('Informe FIXTURE_PASSWORD temporária com pelo menos 12 caracteres.');
}
async function seed(c,config,password){
 const [[identity]]=await c.query('SELECT ambiente,banco FROM avelu_environment WHERE id=1');
 if(!identity||identity.ambiente!==config.database.environment||identity.banco!==config.db.database)throw Error('Identidade incompatível.');
 const plan=await require('./initialize').migrationPlan();
 const [applied]=await c.query('SELECT version,checksum,applied_at FROM avelu_migrations');
 if(applied.length!==plan.length||plan.some(p=>!applied.some(a=>a.version===p.name&&a.checksum===p.checksum&&a.applied_at)))throw Error('Baseline incompleta ou divergente.');
 const [[lock]]=await c.execute('SELECT GET_LOCK(?,0) AS acquired',['avelu-fixtures:'+config.db.database]);
 if(lock.acquired!==1)throw Error('Carga já em execução.');
 try{
  await c.beginTransaction();
  for(const table of plan.flatMap(p=>p.statements.map(s=>s.match(/^CREATE TABLE ([a-z_]+)/)[1]))){
   const [[r]]=await c.query('SELECT COUNT(*) AS total FROM `'+table+'`');
   if(Number(r.total)!==0)throw Error('Carga recusada: já existem dados de negócio.');
  }
  const ids={};
  for(const [role,label] of [['paciente','Paciente'],['profissional','Profissional'],['equipe','Equipe']]){
   const salt=randomBytes(16).toString('hex'),hash='scrypt$'+salt+'$'+scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('hex');
   const [r]=await c.execute('INSERT INTO usuarios(tipo,nome_completo,email,senha_hash) VALUES (?,?,?,?)',[role,label+' Fictício 01',role+'@example.invalid',hash]);ids[role]=r.insertId;
  }
  const [p]=await c.execute('INSERT INTO perfis_profissionais(usuario_id,titulo_profissional,numero_registro) VALUES (?,?,?)',[ids.profissional,'Profissional fictício — testes','FICTICIO-001']);
  const [l]=await c.execute("INSERT INTO locais_atendimento(nome,tipo,endereco,cidade,estado,ativo) VALUES (?,'clinica',?,?,?,1)",['Unidade Fictícia 01','Rua de Testes, 000 — endereço fictício','Cidade Fictícia','MG']);
  const [s]=await c.execute('INSERT INTO especialidades(nome,slug) VALUES (?,?)',['Especialidade Fictícia','especialidade-ficticia']);
  await c.execute('INSERT INTO profissionais_especialidades VALUES (?,?)',[p.insertId,s.insertId]);
  await c.execute('INSERT INTO locais_especialidades VALUES (?,?)',[l.insertId,s.insertId]);
  await c.execute('INSERT INTO profissionais_locais VALUES (?,?)',[p.insertId,l.insertId]);
  await c.execute('INSERT INTO gestao_acessos(usuario_id,local_id) VALUES (?,?)',[ids.equipe,l.insertId]);
  const day=require('../schedule-engine').add(require('../schedule-engine').today(),2);
  for(const [hour,status] of [['09','confirmado'],['10','agendado'],['11',null]]){
   const [slot]=await c.execute('INSERT INTO disponibilidades(profissional_id,local_id,inicio_em,fim_em,status) VALUES (?,?,?,?,?)',[p.insertId,l.insertId,day+' '+hour+':00:00',day+' '+hour+':30:00',status?'reservado':'disponivel']);
   if(status)await c.execute('INSERT INTO agendamentos(paciente_id,profissional_id,disponibilidade_id,status,local_nome,local_endereco) VALUES (?,?,?,?,?,?)',[ids.paciente,p.insertId,slot.insertId,status,'Unidade Fictícia 01','Rua de Testes, 000 — endereço fictício']);
  }
  await c.commit();
 }catch(error){await c.rollback();throw error;}finally{await c.execute('SELECT RELEASE_LOCK(?)',['avelu-fixtures:'+config.db.database]);}
}
module.exports={assertFixtures,seed};
