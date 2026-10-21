require('./require-test-database');
const {test}=require('node:test'),assert=require('node:assert/strict');
const pool=require('../db');
test('MySQL disposable: appointment roundtrip across Brasilia midnight',async()=>{
 const c=await pool.getConnection();
 try{
  await c.beginTransaction();
  const [u]=await c.execute("INSERT INTO usuarios(tipo,nome_completo,email,senha_hash) VALUES ('profissional','Teste temporal',?,'TESTE_SEM_LOGIN')",[require('node:crypto').randomUUID()+'@example.invalid']);
  const [p]=await c.execute("INSERT INTO perfis_profissionais(usuario_id,titulo_profissional) VALUES (?,'Teste')",[u.insertId]);
  const instant=new Date('2030-01-02T02:59:00Z');
  const [slot]=await c.execute('INSERT INTO disponibilidades(profissional_id,inicio_em,fim_em) VALUES (?,?,?)',[p.insertId,instant,new Date(+instant+120000)]);
  const [appointment]=await c.execute("INSERT INTO agendamentos(profissional_id,disponibilidade_id,status) VALUES (?,?,'confirmado')",[p.insertId,slot.insertId]);
  const [[row]]=await c.execute("SELECT d.inicio_em,d.fim_em,DATE_FORMAT(d.inicio_em,'%Y-%m-%d %H:%i:%s') AS wall FROM disponibilidades d JOIN agendamentos a ON a.disponibilidade_id=d.id WHERE a.id=?",[appointment.insertId]);
  assert.equal(row.wall,'2030-01-01 23:59:00');assert.equal(+row.inicio_em,+instant);assert.equal(+row.fim_em,+instant+120000);
  await c.query('SET timestamp = 1893553080'); // 2030-01-02T02:58:00Z
  const [[future]]=await c.execute('SELECT inicio_em>NOW() AS available, DATE(fim_em)>DATE(inicio_em) AS nextDay FROM disponibilidades WHERE id=?',[slot.insertId]);
  assert.equal(future.available,1);assert.equal(future.nextDay,1);
 }finally{await c.rollback();await c.query('SET timestamp = DEFAULT');c.release();await pool.end();}
});
