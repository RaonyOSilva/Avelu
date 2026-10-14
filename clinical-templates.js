
const pool=require('./db'),{currentUser}=require('./auth');
module.exports=app=>{
 app.use('/api/templates',async(req,res,next)=>{try{req.user=await currentUser(req);if(!req.user)return res.status(401).json({error:'Entre com sua conta.'});const [rows]=await pool.execute('SELECT id FROM perfis_profissionais WHERE usuario_id=? AND ativo=1',[req.user.id]);if(!rows.length)return res.status(403).json({error:'Área exclusiva do profissional.'});next();}catch(e){next(e);}});
 app.get('/api/templates',async(req,res,next)=>{try{const [rows]=await pool.execute('SELECT id,titulo,tipo,conteudo FROM modelos_clinicos WHERE usuario_id=? ORDER BY titulo,id',[req.user.id]);res.json(rows);}catch(e){next(e);}});
 app.post('/api/templates',async(req,res,next)=>{const b=req.body||{};if(typeof b.titulo!=='string'||!b.titulo.trim()||b.titulo.length>100||!['evolucao','receita'].includes(b.tipo)||typeof b.conteudo!=='string'||!b.conteudo.trim()||b.conteudo.length>10000)return res.status(400).json({error:'Informe título, tipo e texto de até 10 mil caracteres.'});try{const [r]=await pool.execute('INSERT INTO modelos_clinicos(usuario_id,titulo,tipo,conteudo) VALUES (?,?,?,?)',[req.user.id,b.titulo.trim(),b.tipo,b.conteudo]);res.status(201).json({id:r.insertId});}catch(e){next(e);}});
 app.delete('/api/templates/:id',async(req,res,next)=>{if(!/^[1-9]\d{0,14}$/.test(req.params.id))return res.status(400).json({error:'Modelo inválido.'});try{await pool.execute('DELETE FROM modelos_clinicos WHERE id=? AND usuario_id=?',[req.params.id,req.user.id]);res.json({ok:true});}catch(e){next(e);}});
};
