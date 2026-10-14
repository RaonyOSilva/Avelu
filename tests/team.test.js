require('dotenv').config();
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const path=require('node:path');
const pool=require('../db');
const {passwordHash}=require('../auth');

test('área de atendimento: isolamento, agenda online e recepção',{timeout:40000},async t=>{
  const suffix=randomUUID(), users=[], places=[], profiles=[];
  let child,base,slotA,slotB,booking,createdEmail=`new-team-${suffix}@example.invalid`;
  const day=new Date(Date.now()+14*86400000).toISOString().slice(0,10);
  async function account(name,role='profissional'){
    const email=`${name}-${suffix}@example.invalid`;
    const [r]=await pool.execute('INSERT INTO usuarios (tipo,nome_completo,email,senha_hash) VALUES (?,?,?,?)',[role,name,email,await passwordHash('Senha teste 123')]);users.push(r.insertId);
    const token=randomBytes(32).toString('hex');await pool.execute('INSERT INTO sessoes (usuario_id,token_hash,expira_em) VALUES (?,?,NOW()+INTERVAL 1 DAY)',[r.insertId,createHash('sha256').update(token).digest('hex')]);
    return {id:r.insertId,email,cookie:'avelu_session='+token};
  }
  async function request(route,body,user,method){const response=await fetch(base+route,{method:method||(body?'POST':'GET'),headers:{Origin:base,'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
  try{
    child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'0',NODE_ENV:'test',APP_ORIGIN:''},stdio:['ignore','pipe','pipe']});
    base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Servidor não iniciou.')),10000);child.once('error',reject);child.stdout.on('data',b=>{const match=b.toString().match(/http:\/\/localhost:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});});
    const admin=await account('admin','administrador'),secretary=await account('recepcao','paciente'),other=await account('outra-recepcao'),doctor=await account('medico'),patient=await account('paciente','paciente');
    for(const name of ['Unidade A','Unidade B']){const [r]=await pool.execute("INSERT INTO locais_atendimento (nome,tipo,endereco,cidade,estado,ativo) VALUES (?,'clinica','Rua do teste','Governador Valadares','MG',1)",[name]);places.push(r.insertId);}
    const [p]=await pool.execute("INSERT INTO perfis_profissionais (usuario_id,titulo_profissional) VALUES (?,'Ortopedia')",[doctor.id]);profiles.push(p.insertId);
    for(const local of places)await pool.execute('INSERT INTO profissionais_locais (profissional_id,local_id) VALUES (?,?)',[p.insertId,local]);
    const accessA={email:secretary.email,tipo:'local',escopo_id:places[0]}, accessB={email:other.email,tipo:'local',escopo_id:places[1]};
    const block={profissional_id:p.insertId,local_id:places[0],inicio:day+'T08:00',fim:day+'T09:00',duracao:30,valor:150};
    await t.test('somente administração concede acesso; paciente não se promove',async()=>{
      assert.equal((await request('/api/team/context')).status,401);
      assert.equal((await request('/api/team/context',null,secretary)).status,403);
      assert.equal((await request('/api/admin/team-access',accessA,secretary)).status,403);
      assert.equal((await request('/api/admin/team-access',accessA,admin)).status,201);
      assert.equal((await request('/api/admin/team-access',accessB,admin)).status,201);
      assert.equal((await request('/api/admin/team-access',{email:doctor.email,tipo:'profissional',escopo_id:p.insertId},admin)).status,201);
      assert.equal((await request('/api/auth/me',null,secretary)).data.user.canManage,true);
      assert.equal((await request('/api/admin/professionals',null,secretary)).status,403);
      const context=await request('/api/team/context',null,secretary);assert.equal(context.data.pairs.length,1);assert.equal(context.data.pairs[0].local_id,places[0]);
      assert.equal((await request('/api/team/context',null,doctor)).data.pairs.length,2);
    });
    await t.test('local autorizado aparece mesmo sem profissionais, sem expor outras unidades',async()=>{
      await pool.execute('DELETE FROM profissionais_locais WHERE profissional_id=? AND local_id=?',[p.insertId,places[0]]);
      try {
        const context=await request('/api/team/context',null,secretary);
        assert.equal(context.status,200);assert.equal(context.data.pairs.length,0);
        assert.deepEqual(context.data.places.map(l=>l.id),[places[0]]);
        const adminContext=await request('/api/team/context',null,admin);
        assert.ok(adminContext.data.places.some(l=>l.id===places[0]));
        const doctorContext=await request('/api/team/context',null,doctor);
        assert.deepEqual(doctorContext.data.places.map(l=>l.id),[places[1]]);
      } finally { await pool.execute('INSERT INTO profissionais_locais (profissional_id,local_id) VALUES (?,?)',[p.insertId,places[0]]); }
    });
    await t.test('publicação em lote e conflito entre unidades são atômicos',async()=>{
      assert.equal((await request('/api/team/availability',{...block,local_id:places[1]},secretary)).status,403);
      const result=await request('/api/team/availability',block,secretary);assert.equal(result.status,200);assert.equal(result.data.created,2);
      const publicSlots=await request('/api/professionals/'+p.insertId+'/availability');assert.equal(publicSlots.data.slots.length,2);slotA=publicSlots.data.slots[0].id;
      assert.equal((await request('/api/team/availability',{...block,local_id:places[1],inicio:day+'T07:30'},other)).status,409);
      assert.equal((await request('/api/professionals/'+p.insertId+'/availability')).data.slots.length,2);
      assert.equal((await request('/api/team/availability',{...block,fim:day+'T08:15'},secretary)).status,400);
      assert.equal((await request('/api/team/availability',{...block,local_id:places[1],inicio:day+'T10:00',fim:day+'T10:30'},other)).status,200);
      const list=await request('/api/team/agenda?dia='+day,null,other);assert.equal(list.data.slots.length,1);slotB=list.data.slots[0].id;
      assert.equal((await request('/api/team/agenda?dia='+day+'&local='+places[1],null,secretary)).data.slots.length,0);
      assert.equal((await request('/api/team/availability/'+slotB+'/state',{status:'bloqueado'},secretary)).status,404);
    });

    await t.test('encaixe de hoje aceita início futuro e sobra sem ultrapassar o fim',async t=>{
      const now=new Date(),start=new Date(Math.ceil((+now+120000)/60000)*60000);
      const localTime=d=>new Date(+d-10800000).toISOString().slice(0,16);
      const end=new Date(+start+11*60000);
      if(localTime(start).slice(0,10)!==localTime(end).slice(0,10)||localTime(now).slice(0,10)!==localTime(start).slice(0,10)){t.skip('Sem intervalo suficiente antes da meia-noite');return;}
      const data={...block,inicio:localTime(start),fim:localTime(end),duracao:5};
      const created=await request('/api/team/availability',data,secretary);
      assert.equal(created.status,200);assert.equal(created.data.created,2);
      const agenda=(await request('/api/team/agenda?dia='+data.inicio.slice(0,10),null,secretary)).data.slots;
      assert.equal(agenda.length,2);assert.equal(+new Date(agenda[1].fim_em),+start+10*60000);
      assert.equal((await request('/api/team/availability',{...data,inicio:localTime(new Date(+now-60000))},secretary)).status,400);
    });
    await t.test('recepção e paciente concorrem pela mesma vaga sem duplicar',async()=>{
      const results=await Promise.all([request('/api/team/appointments',{slotId:slotA,nome:'Paciente manual',telefone:'(33) 99999-1234'},secretary),request('/api/appointments',{slotId:slotA},patient)]);
      assert.equal(results.filter(r=>r.status===200||r.status===201).length,1);assert.equal(results.filter(r=>r.status===409).length,1);
      const agenda=await request('/api/team/agenda?dia='+day,null,secretary);booking=agenda.data.slots.find(s=>s.id===slotA).agendamento_id;assert.ok(booking);
      assert.equal((await request('/api/team/appointments/'+booking+'/state',{status:'confirmado'},other)).status,404);
      assert.equal(JSON.stringify((await request('/api/team/agenda?dia='+day,null,other)).data).includes('Paciente manual'),false);
      assert.equal((await request('/api/team/availability/'+slotA+'/state',{status:'bloqueado'},secretary)).status,409);
      assert.equal((await request('/api/team/appointments/'+booking+'/state',{status:'confirmado'},secretary)).status,200);
      assert.equal((await request('/api/team/appointments/'+booking+'/state',{status:'concluido'},secretary)).status,409);
      assert.equal((await request('/api/team/appointments/'+booking+'/state',{status:'cancelado',motivo:'Profissional indisponível',liberar:false},secretary)).status,200);
      const after=await request('/api/team/agenda?dia='+day,null,secretary);assert.equal(after.data.slots.find(s=>s.id===slotA).status,'bloqueado');assert.equal(after.data.cancelled[0].id,booking);
    });
    await t.test('reabertura, reserva manual sem conta e cancelamento que libera vaga',async()=>{
      assert.equal((await request('/api/team/availability/'+slotA+'/state',{status:'disponivel'},secretary)).status,200);
      const result=await request('/api/team/appointments',{slotId:slotA,nome:'Paciente da recepção',telefone:'33999991234',email:'paciente-manual@example.invalid'},secretary);assert.equal(result.status,200);
      const [rows]=await pool.execute('SELECT paciente_id,origem FROM agendamentos WHERE id=?',[result.data.id]);assert.equal(rows[0].paciente_id,null);assert.equal(rows[0].origem,'manual');
      assert.equal((await request('/api/team/appointments/'+result.data.id+'/state',{status:'cancelado',motivo:'Solicitação do paciente',liberar:true},secretary)).status,200);
      assert.ok((await request('/api/professionals/'+p.insertId+'/availability')).data.slots.some(s=>s.id===slotA));
      const online=await request('/api/appointments',{slotId:slotA},patient);assert.equal(online.status,201);
      assert.equal((await request('/api/team/appointments/'+online.data.id+'/state',{status:'confirmado'},secretary)).status,200);
      assert.equal((await request('/api/appointments',null,patient)).data.find(a=>a.id===online.data.id).status,'confirmado');
      const [audit]=await pool.execute('SELECT acao,usuario_id FROM agenda_eventos WHERE disponibilidade_id=?',[slotA]);assert.ok(audit.some(a=>a.acao==='agendar_manual'&&a.usuario_id===secretary.id));
    });

    await t.test('portal profissional usa perfil próprio, mesmo com acesso amplo ao local',async()=>{
      assert.equal((await request('/api/professional/context')).status,401);
      assert.equal((await request('/api/professional/context',null,secretary)).status,403);
      const [another]=await pool.execute("INSERT INTO perfis_profissionais (usuario_id,titulo_profissional) VALUES (?,'Clínico')",[other.id]);profiles.push(another.insertId);
      await pool.execute('INSERT INTO profissionais_locais (profissional_id,local_id) VALUES (?,?)',[another.insertId,places[0]]);
      const [foreign]=await pool.execute('INSERT INTO disponibilidades (profissional_id,local_id,inicio_em,fim_em) VALUES (?,?,?,?)',[another.insertId,places[0],day+' 15:00:00',day+' 15:30:00']);
      await request('/api/admin/team-access',{email:doctor.email,tipo:'local',escopo_id:places[0]},admin);
      const context=await request('/api/professional/context',null,doctor);
      assert.equal(context.status,200);assert.ok(context.data.pairs.every(pair=>pair.profissional_id===p.insertId));
      for(const prefix of ['/api/professional','/api/Professional']){
        const agenda=await request(prefix+'/agenda?dia='+day,null,doctor);
        assert.equal(agenda.status,200);assert.ok(agenda.data.slots.length);assert.ok(agenda.data.slots.every(slot=>slot.profissional_id===p.insertId));
        assert.ok(agenda.data.slots.some(slot=>slot.agendamento_status==='confirmado'));
        assert.equal((await request(prefix+'/agenda?dia='+day+'&profissional='+another.insertId,null,doctor)).data.slots.length,0);
        assert.equal((await request(prefix+'/availability/'+foreign.insertId+'/state',{status:'bloqueado'},doctor)).status,403);
      }
      
      assert.equal((await request('/api/professional/availability',block,doctor)).status,403);
      const agenda=(await request('/api/professional/agenda?dia='+day,null,doctor)).data;
      const overview=await request('/api/professional/scheduled',null,doctor);
      assert.equal(overview.status,200);assert.ok(overview.data.slots.length>0);
      assert.ok(overview.data.slots.every(s=>s.agendamento_status==='confirmado'));
      assert.ok(overview.data.slots.every(s=>agenda.slots.some(a=>a.agendamento_id===s.agendamento_id)));
      assert.equal(overview.data.summary.total,overview.data.slots.length);
      assert.equal((await request('/api/professional/scheduled?page=-1',null,doctor)).status,400);
      assert.equal((await request('/api/professional/scheduled',null,patient)).status,403);
      assert.equal((await request('/api/professional/scheduled')).status,401);
      const confirmed=agenda.slots.find(s=>s.agendamento_status==='confirmado');
      assert.equal((await request('/api/professional/appointments/'+confirmed.agendamento_id+'/state',{status:'concluido'},doctor)).status,409);
      assert.equal((await request('/api/professional/appointments/'+confirmed.agendamento_id+'/state',{status:'confirmado'},doctor)).status,403);
      assert.equal((await request('/api/auth/me',null,doctor)).data.user.isProfessional,true);
    });

    await t.test('registro clínico é privado, persiste rascunhos e finaliza de forma atômica',async()=>{
      await require('../scripts/setup-consultations').setupConsultations(pool);
      const [appointments]=await pool.execute("SELECT id FROM agendamentos WHERE disponibilidade_id=? AND status='confirmado'",[slotA]);
      const id=appointments[0].id,url='/api/consultations/'+id;
      assert.equal((await request(url)).status,401);
      for(const actor of [patient,secretary,other,admin])assert.equal((await request(url,null,actor)).status,404);
      const initial=await request(url,null,doctor);assert.equal(initial.status,200);assert.equal(initial.data.record.versao,0);
      assert.equal(initial.data.appointment.profissional,'medico');assert.ok(!JSON.stringify(initial.data).includes('senha_hash'));
      const draft={evolucao:'Avaliação registrada pelo profissional.\nConduta de teste.',receita:'Texto de receita de teste.',versao:0,finalizar:false};
      assert.equal((await request(url,draft,doctor)).status,409);
      const currentDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      await pool.execute("UPDATE disponibilidades SET inicio_em='2020-01-01 08:00:00',fim_em='2020-01-01 08:30:00' WHERE id=?",[slotA]);
      assert.equal((await request(url,draft,doctor)).status,409);
      await pool.execute('UPDATE disponibilidades SET inicio_em=?,fim_em=? WHERE id=?',[currentDay+' 23:58:00',currentDay+' 23:59:00',slotA]);
      assert.equal((await request(url,draft,secretary)).status,404);
      const saved=await request(url,draft,doctor);assert.equal(saved.status,200);assert.equal(saved.data.record.versao,1);
      assert.equal((await request(url,null,doctor)).data.record.evolucao,draft.evolucao);
      assert.equal((await request(url,draft,doctor)).status,409);
      assert.equal((await request(url,{...draft,versao:1,evolucao:'',finalizar:true},doctor)).status,400);
      const final=await request(url,{...draft,versao:1,finalizar:true},doctor);assert.equal(final.status,200);assert.equal(final.data.status,'concluido');
      assert.ok(final.data.record.finalizado_em);
      assert.equal((await request(url,{...draft,versao:2},doctor)).status,409);
      assert.equal((await request(url,null,doctor)).data.record.receita,draft.receita);
      const [status]=await pool.execute('SELECT status FROM agendamentos WHERE id=?',[id]);assert.equal(status[0].status,'concluido');
    });
    await t.test('primeiro acesso não altera a senha de contas existentes e revogação é imediata',async()=>{
      const created=await request('/api/admin/team-access',{email:createdEmail,nome:'Nova secretária',senha:'Senha inicial 123',tipo:'local',escopo_id:places[0]},admin);assert.equal(created.status,201);
      const login=await request('/api/auth/login',{email:createdEmail,password:'Senha inicial 123'});assert.equal(login.status,200);assert.equal(login.data.user.canManage,true);users.push(login.data.user.id);
      assert.equal((await request('/api/admin/team-access',{email:createdEmail,senha:'Nao deve substituir',tipo:'local',escopo_id:places[1]},admin)).status,201);
      assert.equal((await request('/api/auth/login',{email:createdEmail,password:'Senha inicial 123'})).status,200);
      const list=(await request('/api/admin/team-access',null,admin)).data;const grant=list.find(g=>g.email===secretary.email);
      assert.equal((await request('/api/admin/team-access/'+grant.id,null,admin,'DELETE')).status,200);
      assert.equal((await request('/api/team/agenda?dia='+day,null,secretary)).status,403);
      assert.equal((await request('/api/auth/me',null,secretary)).data.user.canManage,false);
      const actor={cookie:login.cookie};assert.equal((await request('/api/team/password',{currentPassword:'Incorreta',password:'Nova senha 456'},actor)).status,400);
      assert.equal((await request('/api/team/password',{currentPassword:'Senha inicial 123',password:'Nova senha 456'},actor)).status,200);
      assert.equal((await request('/api/team/context',null,actor)).status,401);
      assert.equal((await request('/api/auth/login',{email:createdEmail,password:'Nova senha 456'})).status,200);
    });
  }finally{
    if(child){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;}
    for(const id of profiles){await pool.execute('DELETE FROM agendamentos WHERE profissional_id=?',[id]);await pool.execute('DELETE FROM perfis_profissionais WHERE id=?',[id]);}
    for(const id of places)await pool.execute('DELETE FROM locais_atendimento WHERE id=?',[id]);
    for(const id of users)await pool.execute('DELETE FROM usuarios WHERE id=?',[id]);
    await pool.execute('DELETE FROM usuarios WHERE email=?',[createdEmail]);await pool.end();
  }
});
