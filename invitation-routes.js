function mountInvitations(app,{pool,access,invitations,requireAdmin}){
 const attempts=new Map();
 const limit=(req,res,next)=>{
  const now=Date.now();for(const [k,v] of attempts)if(v.until<=now)attempts.delete(k);
  if(!attempts.has(String(req.user.id))&&attempts.size>=10000)return res.status(429).set('Retry-After','60').json({error:'Limite temporário. Tente novamente mais tarde.'});
  const key=String(req.user.id),item=attempts.get(key)||{count:0,until:now+3600000};
  item.count++;attempts.set(key,item);if(item.count>30){res.set('Retry-After',String(Math.ceil((item.until-now)/1000)));return res.status(429).json({error:'Limite de convites atingido. Tente novamente mais tarde.'});}next();
 };
 const enabled=(req,res,next)=>access.inviteOnly?next():res.status(404).json({error:'Convites não habilitados.'});
 app.get('/api/admin/invitations',requireAdmin,enabled,async(req,res,next)=>{try{
  const [rows]=await pool.query("SELECT id,email,tipo,DATE_FORMAT(expira_em,'%Y-%m-%dT%H:%i:%s-03:00') AS expira_em,CASE WHEN utilizado_em IS NOT NULL THEN 'utilizado' WHEN revogado_em IS NOT NULL THEN 'revogado' WHEN expira_em<=NOW() THEN 'expirado' WHEN enviado_em IS NULL THEN 'não enviado' ELSE 'pendente' END AS status FROM convites ORDER BY id DESC LIMIT 100");res.json(rows);
 }catch(e){next(e);}});
 app.post('/api/admin/invitations',requireAdmin,enabled,limit,async(req,res,next)=>{try{res.status(201).json(await invitations.issue(req.user.id,req.body?.email,req.body?.role));}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}});
 app.post('/api/admin/invitations/:id/revoke',requireAdmin,enabled,async(req,res,next)=>{try{await invitations.revoke(req.params.id);res.json({ok:true});}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}});
}
module.exports={mountInvitations};
