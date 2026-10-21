const {randomBytes,createHash}=require('node:crypto');
const hash=token=>createHash('sha256').update(token).digest('hex');
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const validEmail=email=>typeof email==='string'&&email.trim().length<=190&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
function createInvitations({pool,ttl=48,send,passwordHash}){
 async function issue(adminId,email,role){
  if(!validEmail(email)||!['paciente','profissional','equipe'].includes(role))throw fail('Confira e-mail e perfil do convite.');
  email=email.trim().toLowerCase();
  const [users]=await pool.execute('SELECT id,tipo,ativo,senha_hash FROM usuarios WHERE email=?',[email]);
  if(users.length&&!(users[0].ativo&&users[0].tipo===role&&users[0].senha_hash==='CADASTRO_ADMINISTRATIVO_SEM_LOGIN'))throw fail('Este e-mail já possui conta. Utilize a gestão de acessos existente.',409);
  const token=randomBytes(32).toString('hex');
  const [r]=await pool.execute('INSERT INTO convites(email,tipo,token_hash,criado_por,expira_em) VALUES (?,?,?,?,NOW()+INTERVAL ? HOUR)',[email,role,hash(token),adminId,ttl]);
  try{await send(email,token);await pool.execute('UPDATE convites SET enviado_em=NOW() WHERE id=?',[r.insertId]);}
  catch{await pool.execute('UPDATE convites SET revogado_em=NOW() WHERE id=?',[r.insertId]);throw fail('Não foi possível entregar o convite. Verifique o serviço de e-mail e tente novamente.',503);}
  return {id:r.insertId};
 }
 async function consume({token,email,name,password,phone,role}){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||!validEmail(email))throw fail('Convite inválido ou indisponível.');
  const c=await pool.getConnection();
  try{
   await c.beginTransaction();
   const [rows]=await c.execute('SELECT id,email,tipo FROM convites WHERE token_hash=? AND enviado_em IS NOT NULL AND expira_em>NOW() AND utilizado_em IS NULL AND revogado_em IS NULL FOR UPDATE',[hash(token)]);
   const invite=rows[0];
   if(!invite||invite.email!==email.trim().toLowerCase()||(role!==undefined&&role!==invite.tipo))throw fail('Convite inválido ou indisponível.');
   const [existing]=await c.execute('SELECT id,tipo,ativo,senha_hash FROM usuarios WHERE email=? FOR UPDATE',[invite.email]);
   let id=existing[0]?.id;
   const hashed=await passwordHash(password);
   if(id){
    if(!existing[0].ativo||existing[0].tipo!==invite.tipo||existing[0].senha_hash!=='CADASTRO_ADMINISTRATIVO_SEM_LOGIN')throw fail('Convite inválido ou indisponível.');
    await c.execute('UPDATE usuarios SET nome_completo=?,senha_hash=?,telefone=? WHERE id=?',[name,hashed,phone||null,id]);
   }else{
    const [r]=await c.execute('INSERT INTO usuarios(tipo,nome_completo,email,senha_hash,telefone) VALUES (?,?,?,?,?)',[invite.tipo,name,invite.email,hashed,phone||null]);id=r.insertId;
    if(invite.tipo==='profissional')await c.execute('INSERT INTO perfis_profissionais(usuario_id,titulo_profissional) VALUES (?,?)',[id,'Profissional fictício — homologação']);
   }
   await c.execute('UPDATE convites SET utilizado_em=NOW(),usuario_id=? WHERE id=?',[id,invite.id]);
   await c.commit();return {id,name,email:invite.email,role:invite.tipo};
  }catch(error){await c.rollback();if(error.code==='ER_DUP_ENTRY')throw fail('Convite inválido ou indisponível.');throw error;}finally{c.release();}
 }
 async function revoke(id){if(!/^[1-9]\d{0,14}$/.test(String(id)))throw fail('Convite inválido.');await pool.execute('UPDATE convites SET revogado_em=COALESCE(revogado_em,NOW()) WHERE id=? AND utilizado_em IS NULL',[id]);}
 return {issue,consume,revoke};
}
function mailSender(env=process.env,transport=fetch){
 return async(email,token)=>{
  if(!env.RESEND_API_KEY||!env.MAIL_FROM||!/^https:\/\//.test(env.APP_ORIGIN||''))throw Error('E-mail indisponível.');
  const url=new URL('/cadastro.html',env.APP_ORIGIN);url.hash='convite='+token;
  const response=await transport('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.MAIL_FROM,to:[email],subject:'Convite para testes da Avelu',text:'Você foi convidado para o ambiente de testes da Avelu. Não utilize dados reais. Crie sua conta com este e-mail pelo link de uso único: '+url.href+'\nO link possui prazo de validade. Se você não esperava este convite, ignore a mensagem.'})});
  if(!response.ok)throw Error('E-mail indisponível.');
 };
}
module.exports={createInvitations,mailSender,validEmail};
