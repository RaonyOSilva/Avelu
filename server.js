if(process.env.NODE_ENV!=='test')require('dotenv').config();
let config;
try{config=require('./config').loadConfig();}catch(error){console.error(error.message);process.exit(1);}

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const pool = require('./db');
const cityFilter = require('./city-filter');
const { mountAuth } = require('./auth');
const mountAppointments = require('./appointments');
const mountAdmin = require('./admin');
const mountProfiles = require('./profiles');
const { catalog, attachSelection } = require('./specialties');

const app = express();
const port = config.port;
app.set('trust proxy',config.trustProxy);

app.use(require('./operational-log').requests);
app.use(helmet(require('./http-security').options(config.hosted)));
app.use((req,res,next)=>{if(req.path==='/'||/\.html$/i.test(req.path))res.set('Cache-Control','no-store');next();});
const stopHealth=require('./operational-health').mount(app,pool);
app.use(express.json({ limit: '100kb' }));
if(config.access.homologation)app.use((req,res,next)=>{res.set('X-Robots-Tag','noindex, nofollow, noarchive');next();});
app.get('/robots.txt',(req,res)=>res.type('text/plain').send(config.access.homologation?'User-agent: *\nDisallow: /\n':'User-agent: *\nAllow: /\n'));
app.get('/api/environment',(req,res)=>res.set('Cache-Control','no-store').json({homologation:config.access.homologation,inviteOnly:config.access.inviteOnly}));
app.use(require('./homologation').catalogMiddleware(config.access,pool));
app.use(async(req,res,next)=>{
 try{const policy=require('./access-policy'),roles=policy.apiRoles(req.path)||policy.pageRoles(req.path,req.query);
 if(!roles)return next();const user=await require('./auth').currentUser(req);
 res.set('Cache-Control','no-store');
 if(!user){if(req.path.startsWith('/api/'))return res.status(401).json({error:'Entre na sua conta para continuar.'});return res.redirect('/entrar.html?next='+encodeURIComponent(req.originalUrl));}
 if(!roles.includes(user.role)){if(req.path.startsWith('/api/'))return res.status(403).json({error:'Seu tipo de conta não permite acessar este módulo.'});return res.redirect(policy.home(user));}
 next();}catch(e){next(e);}
});
app.use('/api', (request, response, next) => {
  response.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const expectedOrigin = process.env.APP_ORIGIN || `${request.protocol}://${request.get('host')}`;
    if (request.get('origin') !== expectedOrigin) return response.status(403).json({ error: 'Origem da solicitação não permitida.' });
  }
  next();
});
// Sirva apenas arquivos públicos: código do servidor e SQL ficam privados.
const publicFiles = new Set(['session-exit.js','senha.html','senha.js','operacao.html','operations-ui.js','workspace.js','workspace.css','patient-tools.js','reception-patients.js','home-discovery.js','programacao.html','programacao.js','programacao.css','consulta-modelos.js','atendimento-extras.js','consulta.html','consulta.js','consulta.css','profissional.html','profissional.js','profissional.css','agendar-local.html', 'agendar-local.js', 'agendar-local.css', 'atendimento.html', 'atendimento.js', 'atendimento.css', 'equipe.html', 'equipe.js', 'recuperar.html', 'recuperar.js', 'agenda-admin.html', 'agenda-admin.js', 'index.html', 'sobre.html', 'buscar.html', 'buscar.js', 'buscar.css', 'perfil.html', 'perfil.js', 'perfil.css', 'cadastro.html', 'entrar.html', 'agendar.html', 'agendamentos.html', 'admin.html', 'admin-ui.js', 'admin.css', 'paginas.css', 'conta.css', 'app.js', 'conta.js', 'service-worker.js', 'manifest.webmanifest']);
app.use('/assets', express.static(path.join(__dirname, 'assets')));
publicFiles.add('privacy-guard.js');publicFiles.add('homologation.css');publicFiles.add('convites.html');publicFiles.add('convites.js');
app.use((request, response, next) => {
  const file = request.path === '/' ? 'index.html' : request.path.slice(1);
  if(config.access.homologation&&file==='service-worker.js')return response.type('application/javascript').set('Cache-Control','no-store').send("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('avelu-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));");
  if(['GET','HEAD'].includes(request.method)&&publicFiles.has(file)&&file.endsWith('.html'))return require('node:fs/promises').readFile(path.join(__dirname,file),'utf8').then(html=>response.type('html').set('Cache-Control','no-store').send((config.access.homologation?require('./homologation').decorate(html):html).replace('</head>','<script src="privacy-guard.js" defer></script></head>'))).catch(next);
  if (['GET', 'HEAD'].includes(request.method) && publicFiles.has(file)) return response.sendFile(path.join(__dirname, file), { headers: { 'Cache-Control': file.endsWith('.html')?'no-store':'no-cache' } });
  next();
});

const invitations=require('./invitation-service').createInvitations({pool,ttl:config.access.ttl,send:require('./invitation-service').mailSender(),passwordHash:require('./auth').passwordHash});
mountAuth(app,{access:config.access,invitations});
require('./account')(app);
app.use('/api',async(req,res,next)=>{try{if(!/^\/(team|professional|admin|consultations|appointments|account)(?:\/|$)/i.test(req.path))return next();const user=await require('./auth').currentUser(req);if(user?.passwordChangeRequired)return res.status(403).json({error:'Atualize sua senha inicial para continuar.',passwordChangeRequired:true});next();}catch(e){next(e);}});
mountAppointments(app);
mountAdmin(app);
require('./invitation-routes').mountInvitations(app,{pool,access:config.access,invitations,requireAdmin:require('./auth').requireAdmin});
mountProfiles(app);
require('./discovery')(app);
require('./team-access')(app);
require('./team')(app);
require('./consultations')(app);
require('./clinical-templates')(app);

app.get('/api/specialties', async (_request, response, next) => {
  try {
    response.json(await catalog());
  } catch (error) {
    next(error);
  }
});

app.get('/api/professionals', async (request, response, next) => {
  try {
    const term = String(request.query.q || '').trim();
    const local = String(request.query.local || '');
    const city = cityFilter(request.query);
    if(!city)return response.status(400).json({error:'Informe uma cidade e UF válidas.'});
    if (local && !/^[1-9]\d{0,14}$/.test(local)) return response.status(400).json({error:'Local inválido.'});
    const like = `%${term}%`;
    const [rows] = await pool.execute(
      `SELECT p.id, u.nome_completo AS name, p.titulo_profissional AS specialty,
              p.avaliacao AS rating, p.quantidade_avaliacoes AS review_count,
              p.distancia_km, p.avatar_url,
              MIN(d.inicio_em) AS next_available_at
         FROM perfis_profissionais p
         JOIN usuarios u ON u.id = p.usuario_id
    LEFT JOIN disponibilidades d ON d.profissional_id = p.id
                                  AND d.status = 'disponivel'
                                  AND d.inicio_em >= NOW() AND EXISTS (SELECT 1 FROM locais_atendimento dl JOIN profissionais_locais dp ON dp.local_id=dl.id WHERE dl.id=d.local_id AND dl.ativo=1 AND dp.profissional_id=p.id AND (?='' OR dl.id=?) AND (?='' OR (TRIM(dl.cidade)=? AND dl.estado=?)))
        WHERE p.ativo = 1 AND u.ativo=1 AND u.senha_hash <> 'CONTA_DEMONSTRACAO_SEM_LOGIN'
          AND ((? = '' AND ? = '') OR EXISTS (SELECT 1 FROM profissionais_locais pl JOIN locais_atendimento l ON l.id=pl.local_id WHERE pl.profissional_id=p.id AND l.ativo=1 AND (?='' OR l.id=?) AND (?='' OR (TRIM(l.cidade)=? AND l.estado=?))))
          AND (? = '' OR u.nome_completo LIKE ? OR p.titulo_profissional LIKE ?
            OR EXISTS (SELECT 1 FROM profissionais_especialidades pe JOIN especialidades e ON e.id=pe.especialidade_id WHERE pe.profissional_id=p.id AND e.ativo=1 AND e.nome LIKE ?)
            OR EXISTS (SELECT 1 FROM profissionais_areas pa JOIN areas_especialidades a ON a.id=pa.area_id JOIN especialidades e ON e.id=a.especialidade_id WHERE pa.profissional_id=p.id AND a.ativo=1 AND e.ativo=1 AND a.nome LIKE ?))
        GROUP BY p.id, u.nome_completo, p.titulo_profissional, p.avaliacao,
                 p.quantidade_avaliacoes, p.distancia_km, p.avatar_url
        ORDER BY next_available_at IS NULL, next_available_at, p.avaliacao DESC
        LIMIT 30`,
      [local, local, city.city, city.city, city.state, local, city.city, local, local, city.city, city.city, city.state, term, like, like, like, like]
    );
    response.json(await attachSelection(rows, 'professional', true));
  } catch (error) {
    next(error);
  }
});

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'Recurso não encontrado.' });
});

app.use((error, _request, response, _next) => {
  require('./runtime-health').failure();
  require('./operational-log').write('api.failed',{requestId:_request.requestId,status:500});
  if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'Dados inválidos.' });
  response.status(500).json({ error: 'Não foi possível concluir a operação.' });
});

app.use((_request, response) => response.status(404).send('Página não encontrada.'));

for(const event of ['uncaughtException','unhandledRejection'])process.on(event,()=>{require('./operational-log').write('process.crashed');process.exit(1);});
require('./operational-log').write('process.start');
const server = app.listen(port, config.host, () => {
  require('./operational-log').write('http.listening',{port:server.address().port});
});

const stopBackup=process.env.NODE_ENV!=='test'&&port!==0?require('./backup-service').start():()=>{};
const stopScheduling=process.env.NODE_ENV!=='test'&&port!==0?require('./schedule-service').startWorker():()=>{};

server.on('error',()=>{console.error('Não foi possível iniciar o serviço HTTP.');process.exit(1);});
require('./server-lifecycle').installShutdown({server,pool,stopTasks:[stopHealth,stopBackup,stopScheduling],timeoutMs:config.shutdownTimeout});
