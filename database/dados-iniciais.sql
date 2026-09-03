USE avelu;

INSERT IGNORE INTO especialidades (nome, slug) VALUES
  ('Clínica Geral', 'clinica-geral'), ('Gastroenterologia', 'gastroenterologia'),
  ('Odontologia', 'odontologia'), ('Psicologia', 'psicologia'), ('Fisioterapia', 'fisioterapia');

INSERT IGNORE INTO usuarios (tipo, nome_completo, email, senha_hash) VALUES
  ('profissional', 'Dr. Gustavo Alves', 'gustavo.demo@avelu.local', 'CONTA_DEMONSTRACAO_SEM_LOGIN'),
  ('profissional', 'Dra. Mariana Lima', 'mariana.demo@avelu.local', 'CONTA_DEMONSTRACAO_SEM_LOGIN'),
  ('profissional', 'Dr. Pedro Mendes', 'pedro.demo@avelu.local', 'CONTA_DEMONSTRACAO_SEM_LOGIN');

INSERT IGNORE INTO perfis_profissionais (usuario_id, titulo_profissional, avatar_url, distancia_km, avaliacao, quantidade_avaliacoes)
SELECT id, 'Clínico Geral', 'assets/avatar-gustavo.png', 1.20, 4.9, 128 FROM usuarios WHERE email='gustavo.demo@avelu.local';
INSERT IGNORE INTO perfis_profissionais (usuario_id, titulo_profissional, avatar_url, distancia_km, avaliacao, quantidade_avaliacoes)
SELECT id, 'Gastroenterologista', 'assets/avatar-mariana.png', 1.80, 4.8, 96 FROM usuarios WHERE email='mariana.demo@avelu.local';
INSERT IGNORE INTO perfis_profissionais (usuario_id, titulo_profissional, avatar_url, distancia_km, avaliacao, quantidade_avaliacoes)
SELECT id, 'Dentista', 'assets/avatar-pedro.png', 0.90, 4.9, 81 FROM usuarios WHERE email='pedro.demo@avelu.local';

INSERT IGNORE INTO disponibilidades (profissional_id, inicio_em, fim_em)
SELECT id, TIMESTAMP(CURRENT_DATE + INTERVAL 1 DAY, '14:00:00'), TIMESTAMP(CURRENT_DATE + INTERVAL 1 DAY, '14:30:00') FROM perfis_profissionais;
