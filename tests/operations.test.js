require('./require-test-database');
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{randomBytes,createHash}=require('node:crypto'),pool=require('../db'),{passwordHash}=require('../auth');
test('operação integrada: fila, pacientes, descoberta e administração',{timeout:60000},async t=>{
 let server,base;const users=[],places=[],profiles=[],patients=[];const suffix=randomBytes(6).toString('hex');
 async function user(name,role='paciente'){const [r]=await pool.execute('INSERT INTO usuarios(tipo,nome_completo,email,senha_hash) VALUES(?,?,?,?)',[role,name,name+suffix+'@example.invalid',await passwordHash('Teste seguro 123')]);users.push(r.insertId);const token=randomBytes(32).toString('hex');await pool.execute('INSERT INTO sessoes(token_hash,usuario_id,expira_em) VALUES(?,?,NOW()+INTERVAL 1 DAY)',[createHash('sha256').update(token).digest('hex'),r.insertId]);return {id:r.insertId,cookie:'avelu_session='+token};}
 async function req(url,body,u,method){const r=await fetch(base+url,{method:method||(body?'POST':'GET'),headers:{Origin:base,'Content-Type':'application/json',...(u?{Cookie:u.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
 try{
 await require('../scripts/setup-operations').setupOperations(pool);
 server=spawn(process.execPath,['server.js'],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,PORT:'0',NODE_ENV:'test',APP_ORIGIN:''},stdio:['ignore','pipe','pipe']});
 base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Servidor não iniciou')),10000);server.once('error',reject);server.stdout.on('data',b=>{const url=b.toString().match(/http:\/\/localhost:\d+/);if(url){clearTimeout(timer);resolve(url[0]);}});});
 const admin=await user('admin','administrador'),staff=await user('equipe','equipe'),outsider=await user('outraequipe','equipe'),doctor=await user('medico','profissional'),otherDoctor=await user('outromedico','profissional'),patient=await user('paciente');
 for(const name of ['Local A','Local B']){const [r]=await pool.execute("INSERT INTO locais_atendimento(nome,tipo,endereco,cidade,estado,ativo) VALUES(?,'clinica','Rua 1','Cidade Teste','MG',1)",[name+suffix]);places.push(r.insertId);}
 for(const u of [doctor,otherDoctor]){const [r]=await pool.execute("INSERT INTO perfis_profissionais(usuario_id,titulo_profissional,ativo) VALUES(?,'Ortopedia',1)",[u.id]);profiles.push(r.insertId);await pool.execute('INSERT INTO profissionais_locais VALUES(?,?)',[r.insertId,places[profiles.length-1]]);}
 await pool.execute('INSERT INTO gestao_acessos(usuario_id,local_id) VALUES(?,?),(?,?)',[staff.id,places[0],outsider.id,places[1]]);
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const [s]=await pool.execute("INSERT INTO disponibilidades(profissional_id,local_id,inicio_em,fim_em,status) VALUES(?,?,?,?,'reservado')",[profiles[0],places[0],day+' 00:00:00',day+' 00:30:00']);
 const [a]=await pool.execute("INSERT INTO agendamentos(paciente_id,profissional_id,disponibilidade_id,status,local_nome,local_endereco) VALUES(?,?,?,'confirmado','Local A','Rua 1')",[patient.id,profiles[0],s.insertId]);
 await t.test('fila autorizada, falta separada e início somente pelo profissional',async()=>{
 assert.equal((await req('/api/team/queue/'+a.insertId,{fluxo:'aguardando'},outsider)).status,404);
 assert.equal((await req('/api/team/queue/'+a.insertId,{fluxo:'aguardando'},staff)).status,200);
 const agenda=await req('/api/professional/agenda?dia='+day,null,doctor);assert.equal(agenda.data.slots.find(s=>s.agendamento_id===a.insertId).fluxo,'aguardando');
 assert.equal((await req('/api/team/queue/'+a.insertId,{fluxo:'faltou'},staff)).status,200);
 assert.equal((await req('/api/professional/queue/'+a.insertId+'/start',{},doctor)).status,409);
 assert.equal((await req('/api/team/queue/'+a.insertId,{fluxo:'previsto'},staff)).status,200);
 assert.equal((await req('/api/team/queue/'+a.insertId,{fluxo:'em_atendimento'},staff)).status,403);
 assert.equal((await req('/api/professional/queue/'+a.insertId+'/start',{},otherDoctor)).status,404);
 assert.equal((await req('/api/professional/queue/'+a.insertId+'/start',{},doctor)).status,200);
 assert.equal((await req('/api/team/appointments/'+a.insertId+'/state',{status:'cancelado',motivo:'Teste',liberar:false},staff)).status,409);
 const history=await req('/api/appointments/'+a.insertId+'/history',null,patient);assert.ok(history.data.some(x=>x.acao==='em_atendimento'));
 assert.equal((await req('/api/appointments/'+a.insertId+'/history',null,outsider)).status,403);
 });
 await t.test('pacientes isolados por unidade e vínculo exige código da conta',async()=>{
 const body={nome:'Nome teste '+suffix,telefone:'33999991234',email:'paciente'+suffix+'@example.invalid',local_id:places[0]};
 const r=await req('/api/team/patients',body,staff);assert.equal(r.status,200);patients.push(r.data.id);
 assert.equal((await req('/api/team/patients/'+r.data.id,null,outsider)).status,404);
 assert.equal((await req('/api/team/patients',body,staff)).status,409);
 assert.equal((await req('/api/team/patients/'+r.data.id+'/link',{code:'0'.repeat(32)},staff)).status,400);
 const code=await req('/api/account/link-code',{},patient);assert.equal(code.status,200);
 assert.equal((await req('/api/team/patients/'+r.data.id+'/link',{code:code.data.code},staff)).status,200);
 assert.equal((await req('/api/team/patients/'+r.data.id,null,staff)).data.patient.usuario_id,patient.id);
 assert.equal((await req('/api/team/patients/'+r.data.id+'/link',{code:code.data.code},staff)).status,409);
 });
 await t.test('busca filtra antes de limitar e aceita disponibilidade e convênio',async()=>{
 await pool.execute("INSERT INTO disponibilidades(profissional_id,local_id,inicio_em,fim_em) VALUES(?,?,NOW()+INTERVAL 2 DAY,NOW()+INTERVAL 2 DAY+INTERVAL 30 MINUTE)",[profiles[0],places[0]]);
 const settings=await req('/api/admin/place-settings/'+places[0],{orientacoes:'Traga seu documento.',convenios:'Plano Teste',particular:true},admin);assert.equal(settings.status,200);
 const q='?tipo_busca=profissionais&cidade=Cidade%20Teste&uf=MG&pagamento=convenio&convenio=Plano%20Teste&disponibilidade=primeiro';
 const r=await req('/api/discovery'+q);assert.equal(r.status,200);assert.ok(r.data.some(p=>p.id===profiles[0]));assert.ok(!r.data.some(p=>p.id===profiles[1]));
 const l=await req('/api/discovery?tipo_busca=locais&cidade=Cidade%20Teste&uf=MG&disponibilidade=primeiro');assert.equal(l.status,200);assert.ok(l.data.some(p=>p.id===places[0]));
 assert.equal((await req('/api/discovery?disponibilidade=invalida')).status,400);
 const ap=await req('/api/appointments',null,patient);assert.equal(ap.data.find(x=>x.id===a.insertId).orientacoes,'Traga seu documento.');
 });
 await t.test('indicadores e contas só para admin; comunicação não comprova entrega',async()=>{
 assert.equal((await req('/api/admin/operations',null,staff)).status,403);
 assert.equal((await req('/api/admin/operations',null,admin)).status,200);assert.equal((await req('/api/admin/operations?periodo=passado',null,admin)).status,200);
 assert.equal((await req('/api/admin/audit',null,admin)).status,200);
 assert.equal((await req('/api/team/communications/'+a.insertId,{acao:'aberta'},outsider)).status,404);
 assert.equal((await req('/api/team/communications/'+a.insertId,{acao:'aberta'},staff)).status,200);
 assert.equal((await req('/api/team/communications/'+a.insertId,{acao:'entregue'},staff)).status,400);
 assert.equal((await req('/api/admin/users/'+outsider.id+'/state',{ativo:false},admin)).status,200);
 assert.equal((await req('/api/team/context',null,outsider)).status,401);
 assert.equal((await req('/api/admin/users/'+admin.id+'/state',{ativo:false},admin)).status,409);
 });
 await t.test('senha curta exige substituição e troca revoga sessões antigas',async()=>{
 const weak=await user('initial');await pool.execute('UPDATE usuarios SET senha_hash=? WHERE id=?',[await passwordHash('medico'),weak.id]);
 const login=await req('/api/auth/login',{email:'initial'+suffix+'@example.invalid',password:'medico'});assert.equal(login.status,200);assert.equal(login.data.user.passwordChangeRequired,true);
 const denied=await req('/api/appointments',null,weak);assert.equal(denied.status,403);assert.equal(denied.data.passwordChangeRequired,true);
 assert.equal((await req('/api/account/password',{currentPassword:'medico',password:'Nova senha segura 123'},weak)).status,200);
 assert.equal((await req('/api/appointments',null,weak)).status,401);
 assert.equal((await req('/api/auth/login',{email:'initial'+suffix+'@example.invalid',password:'Nova senha segura 123'})).status,200);
 });
 }finally{
 if(server)await new Promise(r=>{server.once('exit',r);server.kill();});
 for(const id of profiles){const [r]=await pool.execute('SELECT id FROM agendamentos WHERE profissional_id=?',[id]);for(const a of r)await pool.execute('DELETE FROM comunicacoes WHERE agendamento_id=?',[a.id]);await pool.execute('DELETE FROM agendamentos WHERE profissional_id=?',[id]);await pool.execute('DELETE FROM perfis_profissionais WHERE id=?',[id]);}
 for(const id of patients)await pool.execute('DELETE FROM pacientes_recepcao WHERE id=?',[id]);for(const id of places)await pool.execute('DELETE FROM locais_atendimento WHERE id=?',[id]);for(const id of users){await pool.execute('DELETE FROM administracao_eventos WHERE usuario_id=?',[id]);await pool.execute('DELETE FROM usuarios WHERE id=?',[id]);}await pool.end();
 }
});
