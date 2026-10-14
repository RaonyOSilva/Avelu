require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
    charset: 'utf8mb4'
  });

  try {
    const schema = await fs.readFile(path.join(__dirname, '../database/schema-pt.sql'), 'utf8');
    const seed = await fs.readFile(path.join(__dirname, '../database/dados-iniciais.sql'), 'utf8');
    await connection.query(schema);
    await connection.query(seed);
    await connection.query(await fs.readFile(path.join(__dirname, '../database/sessoes.sql'), 'utf8'));
    await connection.query(await fs.readFile(path.join(__dirname, '../database/locais.sql'), 'utf8'));
    await require('./setup-specialties').setupSpecialties(connection);
    await require('./setup-profiles').setupProfiles(connection);
    await require('./setup-journey').setupJourney(connection);
    await require('./setup-team').setupTeam(connection);
    await require('./setup-consultations').setupConsultations(connection);
    await require('./setup-experience').setupExperience(connection);
    await require('./setup-scheduling').setupScheduling(connection);
    console.log('Banco Avelu criado e dados iniciais inseridos.');
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error('Falha ao preparar o banco:', error.message);
  process.exitCode = 1;
});
