require('./require-test-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const pool = require('../db');

test('administração de profissionais e locais', { timeout: 30000 }, async t => {
  const suffix = randomUUID();
  const adminEmail = `admin-${suffix}@example.invalid`;
  const patientEmail = `patient-${suffix}@example.invalid`;
  const professionalEmail = `prof-${suffix}@example.invalid`;
  const rollbackEmail = `rollback-${suffix}@example.invalid`;
  let child, base, adminCookie, patientCookie, placeId, professionalId, customSpecialtyId, otherPlaceId;
  const place = { nome: `Clínica teste ${suffix}`, tipo: 'clinica', endereco: 'Rua de teste', numero: '10', cidade: 'Governador Valadares', estado: 'MG', cep: '35000-000', telefone: '(33) 3333-1234', whatsapp:'(33) 99999-1234',email_publico:'contato@example.invalid',email:'interno@example.invalid',ativo: false };
  const professional = { nome: `Profissional ${suffix}`, titulo: 'Psicóloga', email: professionalEmail, telefone: '(33) 99999-1234',whatsapp:'+55 (33) 99999-1234',email_publico:'profissional@example.invalid',site:'https://example.invalid',registro: 'CRP teste', biografia: 'Perfil temporário', ativo: false, locais: [], especialidades: [] };
  async function request(route, method = 'GET', body, cookie) {
    const response = await fetch(base + route, { method, headers: { Origin: base, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  try {
    child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '0', NODE_ENV: 'test', APP_ORIGIN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Servidor não iniciou.')), 10000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Servidor encerrou: ${code}`)); });
      child.stdout.on('data', data => { const match = data.toString().match(/http:\/\/localhost:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
    });
    const admin = await request('/api/auth/register', 'POST', { name: 'Administrador de teste', email: adminEmail, password: 'Senha de teste 123', role: 'administrador' });
    assert.equal(admin.data.user.role, 'paciente');
    adminCookie = admin.cookie;
    await pool.execute("UPDATE usuarios SET tipo='administrador' WHERE email=?", [adminEmail]);
    patientCookie = (await request('/api/auth/register', 'POST', { name: 'Paciente de teste', email: patientEmail, password: 'Senha de teste 123' })).cookie;

    await t.test('visitantes e pacientes não acessam nenhum cadastro administrativo', async () => {
      for (const route of ['places', 'professionals']) {
        for (const method of ['GET', 'POST', 'PUT']) {
          const url = `/api/admin/${route}${method === 'PUT' ? '/1' : ''}`;
          assert.equal((await request(url, method, method === 'GET' ? undefined : {})).status, 401);
          assert.equal((await request(url, method, method === 'GET' ? undefined : {}, patientCookie)).status, 403);
        }
      }
    });
    await t.test('validação de tipo, endereço e links antes de salvar', async () => {
      for (const changes of [{ tipo: 'invalido' }, { cidade: '' }, { estado: 'XX' }, { site: 'javascript:alert(1)' }, { cep: '000' }]) {
        assert.equal((await request('/api/admin/places', 'POST', { ...place, ...changes }, adminCookie)).status, 400);
      }
      assert.equal((await request('/api/admin/professionals', 'POST', { ...professional, email: 'invalido' }, adminCookie)).status, 400);
    });
    await t.test('local pode ser salvo como rascunho e publicado depois', async () => {
      const created = await request('/api/admin/places', 'POST', place, adminCookie);
      assert.equal(created.status, 201); placeId = created.data.id;
      let publicList = await request(`/api/places?q=${suffix}`);
      assert.equal(publicList.data.length, 0);
      assert.equal((await request(`/api/admin/places/${placeId}`, 'PUT', { ...place, ativo: true }, adminCookie)).status, 200);
      publicList = await request(`/api/places?q=${suffix}`);
      assert.equal(publicList.data[0].id, placeId);
      assert.equal(publicList.data[0].telefone, '3333331234');
      assert.equal(publicList.data[0].email, undefined);
      const clinics=await request(`/api/places?q=${suffix}&tipo=clinica`);
      assert.equal(clinics.data.length,1);
      assert.equal(clinics.data[0].id,placeId);
      assert.deepEqual((await request(`/api/places?q=${suffix}&tipo=hospital`)).data,[]);
      assert.equal((await request('/api/places?tipo=invalido')).status,400);
    });
    await t.test('profissional e vínculos persistem e publicação controla a busca', async () => {
      professional.locais = [placeId];
      const specialties = await request('/api/specialties');
      professional.especialidades = specialties.data.slice(0, 1).map(item => item.id);
      const created = await request('/api/admin/professionals', 'POST', professional, adminCookie);
      assert.equal(created.status, 201); professionalId = created.data.id;
      assert.equal((await request(`/api/professionals?q=${suffix}`)).data.length, 0);
      assert.equal((await request(`/api/admin/professionals/${professionalId}`, 'PUT', { ...professional, ativo: true }, adminCookie)).status, 200);
      assert.equal((await request(`/api/professionals?q=${suffix}`)).data[0].id, professionalId);
      const list = await request('/api/admin/professionals', 'GET', undefined, adminCookie);
      const saved = list.data.find(item => item.id === professionalId);
      assert.deepEqual(saved.locais, [placeId]);
      assert.deepEqual(saved.especialidades, professional.especialidades);
      assert.equal(saved.telefone, '33999991234');
      assert.equal(saved.senha_hash, undefined);
      const scoped=await request(`/api/professionals?local=${placeId}`);
      assert.equal(scoped.status,200);
      assert.deepEqual(scoped.data.map(item=>item.id),[professionalId]);
      assert.deepEqual((await request(`/api/professionals?local=${placeId}&q=naoexiste-${suffix}`)).data,[]);
      assert.equal((await request('/api/professionals?local=invalido')).status,400);
      assert.equal((await request(`/api/places/${placeId}`)).data.nome,place.nome);
      await request(`/api/admin/places/${placeId}`,'PUT',place,adminCookie);
      assert.equal((await request(`/api/places/${placeId}`)).status,404);
      assert.deepEqual((await request(`/api/professionals?local=${placeId}`)).data,[]);
      await request(`/api/admin/places/${placeId}`,'PUT',{...place,ativo:true},adminCookie);
    });
    await t.test('agenda exige administrador, local vinculado e impede sobreposição',async()=>{
      const day=new Date(Date.now()+86400000*10).toISOString().slice(0,10);
      const body={profissional_id:professionalId,local_id:placeId,inicio:day+'T09:00',fim:day+'T09:30',valor:'150'};
      assert.equal((await request('/api/admin/availability','GET')).status,401);
      assert.equal((await request('/api/admin/availability','POST',body,patientCookie)).status,403);
      assert.equal((await request('/api/admin/availability','POST',{...body,local_id:'999999999999'},adminCookie)).status,400);
      assert.equal((await request('/api/admin/availability','POST',{...body,inicio:'2030-02-30T09:00',fim:'2030-03-02T09:30'},adminCookie)).status,400);
      const created=await request('/api/admin/availability','POST',body,adminCookie);assert.equal(created.status,201);
      assert.equal((await request('/api/admin/availability','POST',{...body,inicio:day+'T09:15',fim:day+'T09:45'},adminCookie)).status,409);
      const publicSlots=await request('/api/professionals/'+professionalId+'/availability?local='+placeId);assert.equal(publicSlots.data.slots[0].local_id,placeId);assert.equal(Number(publicSlots.data.slots[0].valor),150);
      assert.equal((await request('/api/admin/availability/'+created.data.id+'/block','POST',{},adminCookie)).status,200);
      assert.equal((await request('/api/professionals/'+professionalId+'/availability')).data.slots.length,0);
    });
    await t.test('perfis públicos incluem contatos próprios e vínculos, sem dados internos', async () => {
      const local=await request(`/api/profiles/local/${placeId}`);
      assert.equal(local.status,200);assert.equal(local.data.whatsapp,'5533999991234');assert.equal(local.data.email_publico,place.email_publico);
      assert.equal(local.data.email,undefined);assert.equal(local.data.relacionados[0].id,professionalId);
      const prof=await request(`/api/profiles/profissional/${professionalId}`);
      assert.equal(prof.status,200);assert.equal(prof.data.email,undefined);assert.equal(prof.data.senha_hash,undefined);assert.equal(prof.data.usuario_id,undefined);
      assert.equal(prof.data.descricao,professional.biografia);assert.equal(prof.data.registro,professional.registro);assert.equal(prof.data.whatsapp,'5533999991234');
      assert.equal(prof.data.email_publico,professional.email_publico);assert.equal(prof.data.relacionados[0].id,placeId);assert.equal(prof.data.quantidade_avaliacoes,0);
      assert.equal((await request('/api/profiles/local/invalido')).status,400);
      assert.equal((await request('/api/profiles/profissional/999999999999999')).status,404);
      for(const [type,route,id,body] of [['local','places',placeId,place],['profissional','professionals',professionalId,professional]]){
        await request(`/api/admin/${route}/${id}`,'PUT',{...body,ativo:false},adminCookie);
        assert.equal((await request(`/api/profiles/${type}/${id}`)).status,404);
        const opposite=await request(`/api/profiles/${type==='local'?'profissional':'local'}/${type==='local'?professionalId:placeId}`);
        assert.equal(opposite.data.relacionados.length,0);
        await request(`/api/admin/${route}/${id}`,'PUT',{...body,ativo:true},adminCookie);
      }
      assert.equal((await request(`/api/admin/professionals/${professionalId}`,'PUT',{...professional,site:'javascript:alert(1)'},adminCookie)).status,400);
      assert.equal((await request(`/api/admin/places/${placeId}`,'PUT',{...place,whatsapp:'abc'},adminCookie)).status,400);
    });
    await t.test('cidade e UF filtram locais e profissionais sem confundir cidades homônimas', async () => {
      const created=await request('/api/admin/places','POST',{...place,estado:'ES',ativo:true},adminCookie);
      assert.equal(created.status,201);otherPlaceId=created.data.id;
      const query=new URLSearchParams({q:suffix,cidade:place.cidade,uf:'MG'});
      assert.deepEqual((await request(`/api/places?${query}`)).data.map(item=>item.id),[placeId]);
      assert.deepEqual((await request(`/api/professionals?${query}`)).data.map(item=>item.id),[professionalId]);
      query.set('uf','ES');
      assert.deepEqual((await request(`/api/places?${query}`)).data.map(item=>item.id),[otherPlaceId]);
      assert.deepEqual((await request(`/api/professionals?${query}`)).data,[]);
      query.set('local',String(placeId));
      assert.deepEqual((await request(`/api/professionals?${query}`)).data,[]);
      for(const route of ['places','professionals'])assert.equal((await request(`/api/${route}?cidade=Teste`)).status,400);
      const cities=(await request('/api/cities')).data;
      assert.ok(cities.some(item=>item.cidade===place.cidade&&item.uf==='ES'));
      await request(`/api/admin/places/${otherPlaceId}`,'PUT',{...place,estado:'ES',ativo:false},adminCookie);
      const inactive=(await request(`/api/places?cidade=${encodeURIComponent(place.cidade)}&uf=ES&q=${suffix}`)).data;
      assert.deepEqual(inactive,[]);
    });
    await t.test('vínculo inexistente reverte cadastro inteiro e e-mail duplicado é rejeitado', async () => {
      const bad = await request('/api/admin/professionals', 'POST', { ...professional, email: rollbackEmail, locais: ['999999999999999'] }, adminCookie);
      assert.equal(bad.status, 400);
      const [rows] = await pool.execute('SELECT id FROM usuarios WHERE email=?', [rollbackEmail]); assert.equal(rows.length, 0);
      assert.equal((await request('/api/admin/professionals', 'POST', professional, adminCookie)).status, 409);
      assert.equal((await request('/api/admin/places/999999999999999', 'PUT', place, adminCookie)).status, 404);
    });
    await t.test('catálogo hierárquico e seleção múltipla nos dois cadastros', async () => {
      const catalog = (await request('/api/specialties')).data;
      const ortho = catalog.find(item=>item.nome==='Ortopedia e Traumatologia');
      const psychology = catalog.find(item=>item.nome==='Psicologia');
      assert.ok(ortho.areas.some(area=>area.nome==='Ombro e braço'));
      const areas = [ortho.areas.find(area=>area.nome==='Coluna').id,ortho.areas.find(area=>area.nome==='Joelho').id,psychology.areas[0].id];
      const selection = { especialidades:[ortho.id,psychology.id],areas };
      for (const [route,id,body] of [['places',placeId,place],['professionals',professionalId,professional]]) {
        assert.equal((await request(`/api/admin/${route}/${id}`,'PUT',{...body,...selection,ativo:true},adminCookie)).status,200);
        const saved = (await request(`/api/admin/${route}`,'GET',undefined,adminCookie)).data.find(item=>item.id===id);
        assert.deepEqual(saved.especialidades.sort((a,b)=>a-b),selection.especialidades.slice().sort((a,b)=>a-b));
        assert.deepEqual(saved.areas.sort((a,b)=>a-b),areas.slice().sort((a,b)=>a-b));
        assert.equal(saved.atendimentos.find(item=>item.id===ortho.id).areas.length,2);
        const invalid = await request(`/api/admin/${route}/${id}`,'PUT',{...body,nome:'Não deve ser salvo',especialidades:[psychology.id],areas:[areas[0]]},adminCookie);
        assert.equal(invalid.status,400);
        const unchanged=(await request(`/api/admin/${route}`,'GET',undefined,adminCookie)).data.find(item=>item.id===id);
        assert.equal(unchanged.nome,body.nome);
        assert.equal(unchanged.areas.length,3);
      }
      assert.ok((await request('/api/places?q=coluna')).data.some(item=>item.id===placeId));
      assert.ok((await request('/api/professionals?q=coluna')).data.some(item=>item.id===professionalId));
    });
    await t.test('ampliação do catálogo é administrativa e detalhes participam da busca', async () => {
      const body={nome:`Categoria ${suffix}`,grupo:'Outras'};
      assert.equal((await request('/api/admin/specialties','POST',body)).status,401);
      assert.equal((await request('/api/admin/specialties','POST',body,patientCookie)).status,403);
      const created=await request('/api/admin/specialties','POST',body,adminCookie);
      assert.equal(created.status,201); customSpecialtyId=created.data.id;
      assert.equal((await request('/api/admin/specialties','POST',body,adminCookie)).status,409);
      const areaName=`Especificação ${suffix}`;
      const createdArea=await request('/api/admin/specialties','POST',{nome:areaName,especialidade_id:customSpecialtyId},adminCookie);
      assert.equal(createdArea.status,201);
      const selection={especialidades:[customSpecialtyId],areas:[createdArea.data.id],ativo:true};
      await request(`/api/admin/places/${placeId}`,'PUT',{...place,...selection},adminCookie);
      await request(`/api/admin/professionals/${professionalId}`,'PUT',{...professional,...selection},adminCookie);
      assert.ok((await request(`/api/places?q=${encodeURIComponent(areaName)}`)).data.some(item=>item.id===placeId));
      assert.ok((await request(`/api/professionals?q=${encodeURIComponent(areaName)}`)).data.some(item=>item.id===professionalId));
    });
    await t.test('seed pode ser repetido sem perder IDs e vínculos', async () => {
      const before=(await request('/api/specialties')).data;
      const connection=await pool.getConnection();
      try{await require('../scripts/setup-specialties').setupSpecialties(connection);}finally{connection.release();}
      const after=(await request('/api/specialties')).data;
      assert.deepEqual(after,before);
      const saved=(await request('/api/admin/places','GET',undefined,adminCookie)).data.find(item=>item.id===placeId);
      assert.deepEqual(saved.especialidades,[customSpecialtyId]);
      assert.equal(saved.areas.length,1);
    });
    await t.test('edição remove vínculos e despublica sem excluir', async () => {
      assert.equal((await request(`/api/admin/professionals/${professionalId}`, 'PUT', { ...professional, locais: [], especialidades: [] }, adminCookie)).status, 200);
      assert.equal((await request(`/api/professionals?q=${suffix}`)).data.length, 0);
      const record = (await request('/api/admin/professionals', 'GET', undefined, adminCookie)).data.find(item => item.id === professionalId);
      assert.deepEqual(record.locais, []); assert.deepEqual(record.especialidades, []);
      assert.deepEqual(record.areas, []);
      await request(`/api/admin/places/${placeId}`, 'PUT', place, adminCookie);
      const savedPlace=(await request('/api/admin/places','GET',undefined,adminCookie)).data.find(item=>item.id===placeId);
      assert.deepEqual(savedPlace.especialidades,[]);assert.deepEqual(savedPlace.areas,[]);
      assert.equal((await request(`/api/places?q=${suffix}`)).data.length, 0);
    });
  } finally {
    if (child && child.exitCode === null) { const stopped = new Promise(resolve => child.once('exit', resolve)); child.kill(); await stopped; }
    if (professionalId) await pool.execute('DELETE FROM perfis_profissionais WHERE id=?', [professionalId]);
    if (placeId) await pool.execute('DELETE FROM locais_atendimento WHERE id=?', [placeId]);
    if (otherPlaceId) await pool.execute('DELETE FROM locais_atendimento WHERE id=?', [otherPlaceId]);
    if (customSpecialtyId) await pool.execute('DELETE FROM especialidades WHERE id=?', [customSpecialtyId]);
    await pool.execute('DELETE FROM usuarios WHERE email IN (?,?,?,?)', [adminEmail, patientEmail, professionalEmail, rollbackEmail]);
    await pool.end();
  }
});
