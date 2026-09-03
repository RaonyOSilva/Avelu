require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const pool = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(__dirname, { extensions: ['html'] }));

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
    const [rows] = await pool.query(
      'SELECT id, nome, slug FROM especialidades WHERE ativo = 1 ORDER BY nome'
    );
    response.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/professionals', async (request, response, next) => {
  try {
    const term = String(request.query.q || '').trim();
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
                                  AND d.inicio_em >= NOW()
        WHERE p.ativo = 1
          AND (? = '' OR u.nome_completo LIKE ? OR p.titulo_profissional LIKE ?)
        GROUP BY p.id, u.nome_completo, p.titulo_profissional, p.avaliacao,
                 p.quantidade_avaliacoes, p.distancia_km, p.avatar_url
        ORDER BY next_available_at IS NULL, next_available_at, p.avaliacao DESC
        LIMIT 30`,
      [term, like, like]
    );
    response.json(rows);
  } catch (error) {
    next(error);
  }
});

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'Recurso não encontrado.' });
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: 'Não foi possível concluir a operação.' });
});

app.get('*path', (_request, response) => {
  response.sendFile(path.join(__dirname, 'index.html'));
});

const server = app.listen(port, () => {
  console.log(`Avelu disponível em http://localhost:${port}`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
