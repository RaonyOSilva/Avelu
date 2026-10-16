require('dotenv').config();

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
const port = Number(process.env.PORT || 3000);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));
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
app.use((request, response, next) => {
  const file = request.path === '/' ? 'index.html' : request.path.slice(1);
  if (['GET', 'HEAD'].includes(request.method) && publicFiles.has(file)) return response.sendFile(path.join(__dirname, file), { headers: { 'Cache-Control': 'no-cache' } });
  next();
});

mountAuth(app);
require('./account')(app);
app.use('/api',async(req,res,next)=>{try{if(!/^\/(team|professional|admin|consultations|appointments|account)(?:\/|$)/i.test(req.path))return next();const user=await require('./auth').currentUser(req);if(user?.passwordChangeRequired)return res.status(403).json({error:'Atualize sua senha inicial para continuar.',passwordChangeRequired:true});next();}catch(e){next(e);}});
mountAppointments(app);
mountAdmin(app);
mountProfiles(app);
require('./discovery')(app);
require('./team-access')(app);
require('./team')(app);
require('./consultations')(app);
require('./clinical-templates')(app);

app.get('/api/health', async (_request, response, next) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    next(error);
  }
});

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
  console.error('Falha na API:', error.code || error.name);
  if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'Dados inválidos.' });
  response.status(500).json({ error: 'Não foi possível concluir a operação.' });
});

app.use((_request, response) => response.status(404).send('Página não encontrada.'));

const server = app.listen(port, () => {
  console.log(`Avelu disponível em http://localhost:${server.address().port}`);
});

const stopBackup=process.env.NODE_ENV!=='test'&&port!==0?require('./backup-service').start():()=>{};
const stopScheduling=process.env.NODE_ENV!=='test'&&port!==0?require('./schedule-service').startWorker():()=>{};

async function shutdown() {
  stopBackup();
  stopScheduling();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
