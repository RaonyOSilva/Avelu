const pool = require('./db');
const {randomBytes,createHash}=require('node:crypto');
const {currentUser,passwordHash,authLimit}=require('./auth');
const tokenHash=value=>createHash('sha256').update(value).digest('hex');
async function signedIn(req,res,next){try{req.user=await currentUser(req);if(!req.user)return res.status(401).json({error:'Entre na sua conta para continuar.'});next();}catch(e){next(e);}}
function mailReady(){try{const url=new URL(process.env.APP_ORIGIN);return !!process.env.RESEND_API_KEY&&!!process.env.MAIL_FROM&&url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}
module.exports=function mountAccount(app){
 app.get('/api/account',signedIn,async(req,res,next)=>{try{const [rows]=await pool.execute('SELECT nome_completo AS name,email,telefone AS phone FROM usuarios WHERE id=?',[req.user.id]);res.json(rows[0]);}catch(e){next(e);}});
 app.post('/api/account',signedIn,async(req,res,next)=>{const {name,phone}=req.body||{};if(typeof name!=='string'||name.trim().length<2||name.trim().length>150||typeof phone!=='string'||phone.length>30||(phone.trim()&&(!/^\+?[\d\s().-]+$/.test(phone)||!/^\d{10,15}$/.test(phone.replace(/\D/g,'')))))return res.status(400).json({error:'Confira seu nome e telefone com DDD.'});try{await pool.execute('UPDATE usuarios SET nome_completo=?,telefone=? WHERE id=?',[name.trim(),phone.replace(/\D/g,'')||null,req.user.id]);res.json({ok:true});}catch(e){next(e);}});
 app.post('/api/auth/forgot',authLimit,async(req,res,next)=>{
  const email=req.body?.email;if(typeof email!=='string'||email.length>190||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))return res.status(400).json({error:'Informe um e-mail válido.'});
  if(!mailReady())return res.status(503).json({error:'A recuperação por e-mail ainda não está disponível. Tente novamente mais tarde.'});
  try{const [rows]=await pool.execute('SELECT id FROM usuarios WHERE email=? AND ativo=1',[email.trim().toLowerCase()]);if(rows.length){
   const token=randomBytes(32).toString('hex');const hash=tokenHash(token);
   await pool.execute('DELETE FROM recuperacoes_senha WHERE expira_em<=NOW()');
   await pool.execute('INSERT INTO recuperacoes_senha (token_hash,usuario_id,expira_em) VALUES (?,?,NOW()+INTERVAL 15 MINUTE)',[hash,rows[0].id]);
   const url=new URL('/recuperar.html',process.env.APP_ORIGIN);url.hash='token='+token;
   try{const sent=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.MAIL_FROM,to:[email.trim().toLowerCase()],subject:'Redefina sua senha na Avelu',text:'Para escolher uma nova senha, abra este link em até 15 minutos: '+url.href+'\nSe você não solicitou esta alteração, ignore este e-mail.'})});if(!sent.ok)throw new Error('mail');}
   catch{await pool.execute('DELETE FROM recuperacoes_senha WHERE token_hash=?',[hash]);console.error('Não foi possível entregar o e-mail de recuperação.');}
  }res.status(202).json({message:'Se houver uma conta com este e-mail, você receberá um link. Confira também a caixa de spam.'});}catch(e){next(e);}
 });
 app.post('/api/auth/reset',authLimit,async(req,res,next)=>{
  const {token,password}=req.body||{};if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||typeof password!=='string'||password.length<8||password.length>128)return res.status(400).json({error:'Use um link válido e uma senha de 8 a 128 caracteres.'});let c;
  try{const hashed=await passwordHash(password);c=await pool.getConnection();await c.beginTransaction();const [rows]=await c.execute('SELECT r.usuario_id FROM recuperacoes_senha r JOIN usuarios u ON u.id=r.usuario_id WHERE r.token_hash=? AND r.expira_em>NOW() AND u.ativo=1 FOR UPDATE',[tokenHash(token)]);if(!rows.length){await c.rollback();return res.status(400).json({error:'Este link expirou ou já foi utilizado. Solicite outro.'});}await c.execute('UPDATE usuarios SET senha_hash=? WHERE id=?',[hashed,rows[0].usuario_id]);await c.execute('DELETE FROM sessoes WHERE usuario_id=?',[rows[0].usuario_id]);await c.execute('DELETE FROM recuperacoes_senha WHERE usuario_id=?',[rows[0].usuario_id]);await c.commit();res.json({ok:true});}catch(e){if(c)await c.rollback();next(e);}finally{c?.release();}
 });
};
