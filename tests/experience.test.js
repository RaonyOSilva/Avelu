
require('dotenv').config();
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{randomUUID,randomBytes,createHash}=require('node:crypto'),path=require('node:path'),pool=require('../db');
test('expérience: remarcação, espera, modelos e histórico com isolamento',{timeout:30000},async t=>{
 const users=[],profiles=[],places=[],bookings=[],suffix=randomUUID();let child,base;
 async function user(name,role='profissional'){const token=randomBytes(32).toString('hex');const [r]=await pool.execute('INSERT INTO usuarios(tipo,nome_completo,email,senha_hash) VALUES (?,?,?,?)',[role,name,name+'-'+suffix+'@example.invalid','SEM_LOGIN_TESTE']);users.push(r.insertId);await pool.execute('INSERT INTO sessoes(usuario_id,token_hash,expira_em) VALUES (?,?,NOW()+INTERVAL 1 DAY)',[r.insertId,createHash('sha256').update(token).digest('hex')]);return{id:r.insertId,cookie:'avelu_session='+token};}
 async function request(url,body,actor,method){const r=await fetch(base+url,{method:method||(body?'POST':'GET'),headers:{Origin:base,'Content-Type':'application/json',...(actor?{Cookie:actor.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json()};}
 async function slot(prof,local,start){const [r]=await pool.execute("INSERT INTO disponibilidades(profissional_id,local_id,inicio_em,fim_em) VALUES (?,?,?,DATE_ADD(?,INTERVAL 30 MINUTE))",[prof,local,start,start]);return r.insertId;}
 async function booking(prof,slotId,patient,status='confirmado'){const [r]=await pool.execute('INSERT INTO agendamentos(paciente_id,profissional_id,disponibilidade_id,status,local_nome) VALUES (?,?,?,?,?)',[patient,prof,slotId,status,'Unidade teste']);bookings.push(r.insertId);await pool.execute("UPDATE disponibilidades SET status='reservado' WHERE id=?",[slotId]);return r.insertId;}
 try{
 await require('../scripts/setup-experience').setupExperience(pool);
 child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'0',APP_ORIGIN:''},stdio:['ignore','pipe','pipe']});
 base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Servidor não iniciou')),10000);child.once('error',reject);child.stdout.on('data',b=>{const m=b.toString().match(/http:\/\/localhost:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});});
 const doctor=await user('doctor'),otherDoctor=await user('otherdoctor'),secretary=await user('secretary','paciente'),otherStaff=await user('otherstaff','paciente'),patient=await user('patient','paciente'),namesake=await user('namesake','paciente');
 for(const actor of [doctor,otherDoctor]){const [p]=await pool.execute("INSERT INTO perfis_profissionais(usuario_id,titulo_profissional) VALUES (?,'Clínico')",[actor.id]);profiles.push(p.insertId);}
 for(const name of ['Local A','Local B']){const [p]=await pool.execute("INSERT INTO locais_atendimento(nome,tipo,endereco,cidade,estado,ativo) VALUES (?,'clinica','Rua','Cidade','MG',1)",[name]);places.push(p.insertId);}
 for(const prof of profiles)for(const local of places)await pool.execute('INSERT INTO profissionais_locais(profissional_id,local_id) VALUES (?,?)',[prof,local]);
 await pool.execute('INSERT INTO gestao_acessos(usuario_id,local_id) VALUES (?,?),(?,?)',[secretary.id,places[0],otherStaff.id,places[1]]);
 const day=new Date(Date.now()+86400000*3).toISOString().slice(0,10),old=await slot(profiles[0],places[0],day+' 09:00:00'),target=await slot(profiles[0],places[0],day+' 10:00:00'),outside=await slot(profiles[0],places[1],day+' 11:00:00'),active=await booking(profiles[0],old,patient.id);
 await t.test('remarca mantém identificação e valida escopos e vaga',async()=>{
 assert.equal((await request('/api/team/appointments/'+active+'/reschedule',{slotId:target},otherStaff)).status,404);
 assert.equal((await request('/api/team/appointments/'+active+'/reschedule',{slotId:outside},secretary)).status,409);
 assert.equal((await request('/api/team/appointments/'+active+'/reschedule',{slotId:target},secretary)).status,200);
 const [rows]=await pool.execute('SELECT paciente_id,disponibilidade_id,status FROM agendamentos WHERE id=?',[active]);assert.equal(rows[0].paciente_id,patient.id);assert.equal(rows[0].disponibilidade_id,target);assert.equal(rows[0].status,'agendado');
 assert.equal((await pool.execute('SELECT status FROM disponibilidades WHERE id=?',[old]))[0][0].status,'disponivel');
 assert.equal((await request('/api/team/appointments/'+active+'/reschedule',{slotId:target},secretary)).status,409);
 const [events]=await pool.execute("SELECT acao FROM agenda_eventos WHERE agendamento_id=?",[active]);assert.equal(events.length,2);
 });
 await t.test('lista de espera respeita local e encerra apenas após reserva',async()=>{
 const body={profissional_id:profiles[0],local_id:places[0],nome:'Paciente Espera',telefone:'33999991234',preferencia:'Pela manhã'};
 assert.equal((await request('/api/team/waitlist',body,otherStaff)).status,403);
 const created=await request('/api/team/waitlist',body,secretary);assert.equal(created.status,200);
 const list=await request('/api/team/waitlist',null,secretary);assert.ok(list.data.items.some(w=>w.id===created.data.id));
 assert.equal((await request('/api/team/waitlist',null,otherStaff)).data.items.some(w=>w.id===created.data.id),false);
 assert.equal((await request('/api/team/waitlist/'+created.data.id+'/state',{status:'contatado'},otherStaff)).status,404);
 assert.equal((await request('/api/team/waitlist/'+created.data.id+'/state',{status:'contatado'},secretary)).status,200);
 assert.equal((await request('/api/team/appointments',{slotId:target,nome:body.nome,telefone:body.telefone,waitlistId:created.data.id},secretary)).status,409);
 const reserved=await request('/api/team/appointments',{slotId:old,nome:body.nome,telefone:body.telefone,waitlistId:created.data.id},secretary);assert.equal(reserved.status,200);bookings.push(reserved.data.id);
 assert.equal((await request('/api/team/waitlist',null,secretary)).data.items.some(w=>w.id===created.data.id),false);
 });
 await t.test('sete dias retornam também o dia seguinte',async()=>{
 const next=new Date(day+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);await slot(profiles[0],places[0],next.toISOString().slice(0,10)+' 12:00:00');
 const daily=(await request('/api/team/agenda?dia='+day,null,secretary)).data.slots;
 const weekly=(await request('/api/team/agenda?dia='+day+'&periodo=semana',null,secretary)).data.slots;assert.equal(weekly.length,daily.length+1);
 assert.ok(weekly.every(s=>s.local_id===places[0]));
 });
 await t.test('modelos são pessoais e não aparecem para equipe ou outro médico',async()=>{
 const model=await request('/api/templates',{titulo:'Orientações',tipo:'evolucao',conteudo:'Texto reutilizável'},doctor);assert.equal(model.status,201);
 assert.equal((await request('/api/templates',null,secretary)).status,403);
 assert.equal((await request('/api/templates',null,doctor)).data.length,1);
 assert.equal((await request('/api/templates',null,otherDoctor)).data.length,0);
 await request('/api/templates/'+model.data.id,null,otherDoctor,'DELETE');assert.equal((await request('/api/templates',null,doctor)).data.length,1);
 await request('/api/templates/'+model.data.id,null,doctor,'DELETE');assert.equal((await request('/api/templates',null,doctor)).data.length,0);
 });
 await t.test('histórico considera identidade e profissional, não nome ou contato',async()=>{
 await pool.execute("UPDATE agendamentos SET status='confirmado' WHERE id=?",[active]);
 const historical=[];
 for(const [prof,pat,time] of [[profiles[0],patient.id,'08:00:00'],[profiles[1],patient.id,'09:00:00'],[profiles[0],namesake.id,'10:00:00']]){
 const sl=await slot(prof,places[0],'2020-01-01 '+time),bk=await booking(prof,sl,pat,'concluido');historical.push(bk);
 await pool.execute("INSERT INTO registros_atendimentos(agendamento_id,evolucao,receita,finalizado_em) VALUES (?,'Registro antigo','Receita antiga',NOW())",[bk]);
 }
 const history=await request('/api/consultations/'+active,null,doctor);assert.equal(history.status,200);assert.deepEqual(history.data.history.map(h=>h.id),[historical[0]]);
 assert.equal((await request('/api/consultations/'+active,null,secretary)).status,404);
 await pool.execute("INSERT INTO registros_atendimentos(agendamento_id,evolucao,receita) VALUES (?,'Iniciado','')",[active]);
 assert.equal((await request('/api/team/appointments/'+active+'/reschedule',{slotId:outside},secretary)).status,409);
 });
 }finally{
 if(child){const stopped=new Promise(r=>child.once('exit',r));child.kill();await stopped;}
 for(const prof of profiles){await pool.execute('DELETE FROM agendamentos WHERE profissional_id=?',[prof]);await pool.execute('DELETE FROM perfis_profissionais WHERE id=?',[prof]);}
 for(const place of places)await pool.execute('DELETE FROM locais_atendimento WHERE id=?',[place]);
 for(const user of users)await pool.execute('DELETE FROM usuarios WHERE id=?',[user]);
 await pool.end();
 }
});
