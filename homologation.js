const warning='AVELU — HOMOLOGAÇÃO | Ambiente de testes. Não utilize dados reais.';
function decorate(html){return html.replace('</head>','<meta name="robots" content="noindex,nofollow,noarchive"><link rel="stylesheet" href="homologation.css"></head>').replace(/<body([^>]*)>/i,'<body$1><div class="homologation-banner" role="note">'+warning+'</div>');}
function catalogMiddleware(access,pool){
 const allowed=(type,id)=>(type==='professional'?access.professionals:access.places).includes(String(id));
 const publicPath=/^\/api\/(?:cities|places(?:\/\d+)?|professionals(?:\/\d+\/availability)?|profiles\/(?:local|profissional)\/\d+|discovery)\/?$/;
 // Only an explicit list of reviewed fictional records can reach the public catalog.
 return (req,res,next)=>{
  if(!access.homologation)return next();
  let route;try{route=decodeURIComponent(req.path).toLowerCase().replace(/\/+$/,'');}catch{return res.status(400).json({error:'URL invalida.'});}
  if(!publicPath.test(route))return next();
  if(route==='/api/cities'){
   if(!access.places.length)return res.json([]);
   return pool.query("SELECT DISTINCT TRIM(cidade) AS cidade,estado AS uf FROM locais_atendimento WHERE ativo=1 AND id IN (?) ORDER BY cidade,uf",[access.places]).then(([rows])=>res.json(rows)).catch(next);
  }
  const match=route.match(/^\/api\/(places|professionals)\/(\d+)|^\/api\/profiles\/(local|profissional)\/(\d+)/);
  if(match&&!allowed(['professionals','profissional'].includes(match[1]||match[3])?'professional':'place',match[2]||match[4]))return res.status(404).json({error:'Perfil não disponível na homologação.'});
  const json=res.json.bind(res);
  res.json=data=>{
   if(res.statusCode>=400)return json(data);
   const taxonomy=row=>({especialidades:row.especialidades||[],areas:row.areas||[],atendimentos:(row.atendimentos||[]).map(e=>({id:e.id,nome:e.nome,areas:(e.areas||[]).map(a=>({id:a.id,nome:a.nome}))}))});
   const place=row=>({id:row.id,nome:'Local fictício '+row.id,tipo:row.tipo||'clinica',endereco:'Endereço fictício de teste',numero:'0',bairro:'Bairro de teste',cidade:row.cidade,estado:row.estado,telefone:null,whatsapp:null,email_publico:null,site:null,descricao:'Local exclusivo para testes.',...taxonomy(row),next_available_at:row.next_available_at,particular:1,convenios:''});
   const professional=row=>({id:row.id,name:'Profissional fictício '+row.id,nome:'Profissional fictício '+row.id,titulo:'Atendimento de teste',specialty:'Atendimento de teste',avatar_url:'assets/icon.svg',descricao:'Perfil exclusivo para testes.',telefone:null,whatsapp:null,email_publico:null,site:null,registro:null,...taxonomy(row),next_available_at:row.next_available_at});
   if(route.includes('/availability'))return json({professional:professional(data.professional),slots:data.slots.filter(s=>allowed('place',s.local_id)).map(s=>({id:s.id,profissional_id:s.profissional_id,local_id:s.local_id,inicio_em:s.inicio_em,fim_em:s.fim_em,valor:s.valor,local_nome:'Local fictício '+s.local_id,local_endereco:'Endereço fictício de teste'}))});
   if(route.startsWith('/api/profiles/')){const isPlace=route.includes('/local/');return json({... (isPlace?place(data):professional(data)),tipo_perfil:isPlace?'local':'profissional',relacionados:(data.relacionados||[]).filter(r=>allowed(isPlace?'professional':'place',r.id)).map(isPlace?professional:place)});}
   const isPlace=route.startsWith('/api/places')||(route==='/api/discovery'&&req.query.tipo_busca==='locais');
   if(Array.isArray(data))return json(data.filter(r=>allowed(isPlace?'place':'professional',r.id)).map(isPlace?place:professional));
   return json(isPlace?place(data):professional(data));
  };next();
 };
}
module.exports={decorate,catalogMiddleware,warning};
