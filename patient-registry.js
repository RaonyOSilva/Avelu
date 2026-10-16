async function fromAccount(c,userId,localId){
 await c.execute(`INSERT INTO pacientes_recepcao(usuario_id,nome,telefone,email) SELECT id,nome_completo,COALESCE(telefone,''),email FROM usuarios WHERE id=? ON DUPLICATE KEY UPDATE nome=VALUES(nome),telefone=VALUES(telefone),email=VALUES(email)`,[userId]);
 const [rows]=await c.execute('SELECT id FROM pacientes_recepcao WHERE usuario_id=?',[userId]);if(!rows.length)throw Error('Paciente inexistente');
 await c.execute('INSERT IGNORE INTO pacientes_unidades VALUES (?,?)',[rows[0].id,localId]);return rows[0].id;
}
module.exports={fromAccount};
