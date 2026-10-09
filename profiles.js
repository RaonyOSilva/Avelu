const pool=require('./db');
const {attachSelection}=require('./specialties');
module.exports=function mountProfiles(app){
  app.get('/api/profiles/:type/:id',async(request,response,next)=>{
    const {type,id}=request.params;
    if(!['local','profissional'].includes(type)||!/^[1-9]\d{0,14}$/.test(id))return response.status(400).json({error:'Perfil inválido.'});
    try{
      let rows, related;
      if(type==='local'){
        [rows]=await pool.execute(`SELECT id,nome,tipo,descricao,telefone,whatsapp,email_publico,site,cep,endereco,numero,complemento,bairro,cidade,estado
          FROM locais_atendimento WHERE id=? AND ativo=1`,[id]);
        if(!rows.length)return response.status(404).json({error:'Este perfil não está disponível.'});
        [related]=await pool.execute(`SELECT p.id,u.nome_completo AS nome,p.titulo_profissional AS titulo,p.avatar_url
          FROM profissionais_locais pl JOIN perfis_profissionais p ON p.id=pl.profissional_id JOIN usuarios u ON u.id=p.usuario_id
          WHERE pl.local_id=? AND p.ativo=1 AND u.ativo=1 AND u.senha_hash <> 'CONTA_DEMONSTRACAO_SEM_LOGIN' ORDER BY u.nome_completo`,[id]);
      }else{
        [rows]=await pool.execute(`SELECT p.id,u.nome_completo AS nome,p.titulo_profissional AS titulo,p.numero_registro AS registro,
          p.biografia AS descricao,p.avatar_url,p.whatsapp,p.email_publico,p.site,u.telefone,p.avaliacao,p.quantidade_avaliacoes
          FROM perfis_profissionais p JOIN usuarios u ON u.id=p.usuario_id WHERE p.id=? AND p.ativo=1 AND u.ativo=1 AND u.senha_hash <> 'CONTA_DEMONSTRACAO_SEM_LOGIN'`,[id]);
        if(!rows.length)return response.status(404).json({error:'Este perfil não está disponível.'});
        [related]=await pool.execute(`SELECT l.id,l.nome,l.endereco,l.numero,l.complemento,l.bairro,l.cidade,l.estado
          FROM profissionais_locais pl JOIN locais_atendimento l ON l.id=pl.local_id WHERE pl.profissional_id=? AND l.ativo=1 ORDER BY l.nome`,[id]);
      }
      const [profile]=await attachSelection(rows,type==='local'?'place':'professional',true);
      response.json({...profile,tipo_perfil:type,relacionados:related});
    }catch(error){next(error);}
  });
};
