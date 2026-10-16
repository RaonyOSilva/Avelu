
require('dotenv').config();
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{randomBytes,randomUUID,createHash}=require('node:crypto'),path=require('node:path'),pool=require('../db');
const service=require('../schedule-service');
test('programações: prévia, concorrência, escopo, retirada e janela móvel',{timeout:60000},async t=>{
 const users=[],profiles=[],places=[];let child,base,ruleId;
 async function account(name,role='profissional'){const [r]=await pool.execute('INSERT INTO usuarios(tipo,nome_completo,email,senha_hash) VALUES (?,?,?,?)',[role,name,randomUUID()+'@example.invalid','TESTE_SEM_LOGIN']);users.push(r.insertId);const token=randomBytes(32).toString('hex');await pool.execute('INSERT INTO sessoes(usuario_id,token_hash,expira_em) VALUES (?,?,NOW()+INTERVAL 1 DAY)',[r.insertId,createHash('sha256').update(token).digest('hex')]);return{id:r.insertId,role,cookie:'avelu_session='+token};}
 async function request(route,body,user){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json()};}
 try{
 await require('../scripts/setup-scheduling').setupScheduling(pool);
 child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'0',NODE_ENV:'test',APP_ORIGIN:''},stdio:['ignore','pipe','pipe']});
 base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Servidor não iniciou')),10000);child.once('error',reject);child.stdout.on('data',b=>{const m=b.toString().match(/http:\/\/localhost:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});});
 const doctor=await account('Doutor'),staff=await account('Equipe','equipe'),other=await account('Outra equipe','equipe'),patient=await account('Paciente','paciente');
 const [p]=await pool.execute("INSERT INTO perfis_profissionais(usuario_id,titulo_profissional) VALUES (?,'Clínico')",[doctor.id]);profiles.push(p.insertId);
 for(const name of ['Unidade A','Unidade B']){const [l]=await pool.execute("INSERT INTO locais_atendimento(nome,tipo,endereco,cidade,estado,ativo) VALUES (?,'clinica','Rua','Governador Valadares','MG',1)",[name]);places.push(l.insertId);await pool.execute('INSERT INTO profissionais_locais(profissional_id,local_id) VALUES (?,?)',[p.insertId,l.insertId]);}
 await pool.execute('INSERT INTO gestao_acessos(usuario_id,local_id) VALUES (?,?),(?,?)',[staff.id,places[0],other.id,places[1]]);
 const {today,add}=require('../schedule-engine'),day=add(today(),10),end=add(day,29);
 const config={profissional_id:p.insertId,local_id:places[0],inicio:day,fim:end,dias:[0,1,2,3,4,5,6],turnos:[{inicio:'08:00',fim:'12:00'},{inicio:'14:00',fim:'18:00'}],duracao:30,valor:100,modo:'integral',janela:90,calendario_revisado:true,feriados:[],excecoes:[]};
 await t.test('somente equipe autorizada pode visualizar e publicar',async()=>{
 assert.equal((await request('/api/team/schedules')).status,401);
 assert.equal((await request('/api/team/schedules/preview',config,patient)).status,403);
 assert.equal((await request('/api/team/schedules/preview',config,other)).status,403);
 assert.equal((await request('/api/team/schedules/preview',{...config,calendario_revisado:false},staff)).status,400);
 });
 await t.test('prévia não publica; confirmação cria em lotes e reenvio não duplica',async()=>{
 const before=(await pool.execute('SELECT COUNT(*) AS n FROM disponibilidades WHERE profissional_id=?',[p.insertId]))[0][0].n;
 const preview=await request('/api/team/schedules/preview',config,staff);assert.equal(preview.status,200);assert.equal(preview.data.created,480);
 assert.equal((await pool.execute('SELECT COUNT(*) AS n FROM disponibilidades WHERE profissional_id=?',[p.insertId]))[0][0].n,before);
 const results=await Promise.all([request('/api/team/schedules',{config,key:preview.data.key},staff),request('/api/team/schedules',{config,key:preview.data.key},staff)]);
 assert.ok(results.every(r=>r.status===201));ruleId=results[0].data.id;assert.equal(ruleId,results[1].data.id);
 assert.equal((await pool.execute('SELECT COUNT(*) AS n FROM programacao_horarios WHERE programacao_id=?',[ruleId]))[0][0].n,480);
 assert.equal((await request('/api/team/schedules',null,other)).data.items.length,0);
 });
 await t.test('conflitos com outro local e alterações após a prévia exigem revisão',async()=>{
 const c={...config,inicio:add(end,1),fim:add(end,1)};
 const preview=await request('/api/team/schedules/preview',c,staff);
 await pool.execute("INSERT INTO disponibilidades(profissional_id,local_id,inicio_em,fim_em,status) VALUES (?,?,?,?,'bloqueado')",[p.insertId,places[1],c.inicio+' 08:00:00',c.inicio+' 08:30:00']);
 assert.equal((await request('/api/team/schedules',{config:c,key:preview.data.key},staff)).status,409);
 const next=await request('/api/team/schedules/preview',c,staff);assert.equal(next.data.conflictCount,1);assert.equal(next.data.created,15);
 });
 await t.test('retirada preserva reservas, bloqueia vagas e impede recriação',async()=>{
 const [slots]=await pool.execute('SELECT d.id FROM disponibilidades d JOIN programacao_horarios ph ON ph.disponibilidade_id=d.id WHERE ph.programacao_id=? ORDER BY d.inicio_em LIMIT 1',[ruleId]);
 await pool.execute("INSERT INTO agendamentos(paciente_id,profissional_id,disponibilidade_id,status) VALUES (?,?,?,'confirmado')",[patient.id,p.insertId,slots[0].id]);await pool.execute("UPDATE disponibilidades SET status='reservado' WHERE id=?",[slots[0].id]);
 assert.equal((await request('/api/team/schedules/'+ruleId+'/withdraw',{inicio:day,fim:day},other)).status,404);
 const result=await request('/api/team/schedules/'+ruleId+'/withdraw',{inicio:day,fim:day},staff);assert.equal(result.status,200);assert.equal(result.data.removed,15);assert.equal(result.data.preserved,1);
 assert.equal((await pool.execute('SELECT status FROM disponibilidades WHERE id=?',[slots[0].id]))[0][0].status,'reservado');
 });
 await t.test('janela móvel avança, retoma com idempotência e pausa ao perder acesso',async()=>{
 const rolling={...config,inicio:add(end,5),fim:add(end,15),modo:'movel',janela:2};
 const pre=await service.preview(staff,rolling);const saved=await service.publish(staff,{config:rolling,key:pre.key});assert.equal(saved.created,0);
 const now=new Date(rolling.inicio+'T00:00:00-03:00');
 const first=await service.processRule(saved.id,now);assert.equal(first.created,32);
 assert.equal((await service.processRule(saved.id,now)).created,0);
 await service.withdraw(staff,saved.id,{inicio:add(rolling.inicio,2),fim:add(rolling.inicio,3)});
 const second=await service.processRule(saved.id,new Date(add(rolling.inicio,2)+'T00:00:00-03:00'));assert.equal(second.created,0);
 await service.changeState(staff,saved.id,'pausada');assert.equal(await service.processRule(saved.id,new Date(add(rolling.inicio,4)+'T00:00:00-03:00')),undefined);
 await service.changeState(staff,saved.id,'ativa');
 assert.equal((await service.processRule(saved.id,new Date(add(rolling.inicio,4)+'T00:00:00-03:00'))).created,32);
 await pool.execute('DELETE FROM gestao_acessos WHERE usuario_id=?',[staff.id]);await service.processRule(saved.id,new Date(add(rolling.inicio,6)+'T00:00:00-03:00'));
 const [state]=await pool.execute('SELECT status,ultimo_erro FROM programacoes_agenda WHERE id=?',[saved.id]);assert.equal(state[0].status,'pausada');assert.ok(state[0].ultimo_erro);
 });
 }finally{
 if(child){const stopped=new Promise(r=>child.once('exit',r));child.kill();await stopped;}
 for(const p of profiles){await pool.execute('DELETE FROM agendamentos WHERE profissional_id=?',[p]);await pool.execute('DELETE FROM perfis_profissionais WHERE id=?',[p]);}
 for(const l of places)await pool.execute('DELETE FROM locais_atendimento WHERE id=?',[l]);
 for(const u of users)await pool.execute('DELETE FROM usuarios WHERE id=?',[u]);await pool.end();
 }
});
