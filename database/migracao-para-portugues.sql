USE avelu;

RENAME TABLE
  users TO usuarios,
  specialties TO especialidades,
  professional_profiles TO perfis_profissionais,
  professional_specialties TO profissionais_especialidades,
  availability TO disponibilidades,
  appointments TO agendamentos;

ALTER TABLE usuarios
  CHANGE role tipo ENUM('patient','professional','admin','paciente','profissional','administrador') NOT NULL DEFAULT 'paciente',
  CHANGE full_name nome_completo VARCHAR(150) NOT NULL,
  CHANGE password_hash senha_hash VARCHAR(255) NOT NULL,
  CHANGE phone telefone VARCHAR(30),
  CHANGE active ativo BOOLEAN NOT NULL DEFAULT TRUE,
  CHANGE created_at criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE updated_at atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
UPDATE usuarios SET tipo=CASE tipo WHEN 'patient' THEN 'paciente' WHEN 'professional' THEN 'profissional' WHEN 'admin' THEN 'administrador' ELSE tipo END;
ALTER TABLE usuarios MODIFY tipo ENUM('paciente','profissional','administrador') NOT NULL DEFAULT 'paciente';

ALTER TABLE especialidades
  CHANGE name nome VARCHAR(120) NOT NULL,
  CHANGE active ativo BOOLEAN NOT NULL DEFAULT TRUE,
  CHANGE created_at criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE perfis_profissionais
  CHANGE user_id usuario_id BIGINT UNSIGNED NOT NULL,
  CHANGE professional_title titulo_profissional VARCHAR(150) NOT NULL,
  CHANGE registration_number numero_registro VARCHAR(80),
  CHANGE bio biografia TEXT,
  CHANGE distance_km distancia_km DECIMAL(7,2),
  CHANGE rating avaliacao DECIMAL(2,1) NOT NULL DEFAULT 0,
  CHANGE review_count quantidade_avaliacoes INT UNSIGNED NOT NULL DEFAULT 0,
  CHANGE active ativo BOOLEAN NOT NULL DEFAULT TRUE,
  CHANGE created_at criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE updated_at atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE profissionais_especialidades
  CHANGE professional_id profissional_id BIGINT UNSIGNED NOT NULL,
  CHANGE specialty_id especialidade_id BIGINT UNSIGNED NOT NULL;

ALTER TABLE disponibilidades
  CHANGE professional_id profissional_id BIGINT UNSIGNED NOT NULL,
  CHANGE start_at inicio_em DATETIME NOT NULL,
  CHANGE end_at fim_em DATETIME NOT NULL,
  MODIFY status ENUM('available','reserved','blocked','disponivel','reservado','bloqueado') NOT NULL DEFAULT 'disponivel',
  CHANGE created_at criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE disponibilidades SET status=CASE status WHEN 'available' THEN 'disponivel' WHEN 'reserved' THEN 'reservado' WHEN 'blocked' THEN 'bloqueado' ELSE status END;
ALTER TABLE disponibilidades MODIFY status ENUM('disponivel','reservado','bloqueado') NOT NULL DEFAULT 'disponivel';

ALTER TABLE agendamentos
  CHANGE patient_id paciente_id BIGINT UNSIGNED NOT NULL,
  CHANGE professional_id profissional_id BIGINT UNSIGNED NOT NULL,
  CHANGE availability_id disponibilidade_id BIGINT UNSIGNED NOT NULL,
  CHANGE reason motivo VARCHAR(500),
  MODIFY status ENUM('scheduled','confirmed','completed','cancelled','agendado','confirmado','concluido','cancelado') NOT NULL DEFAULT 'agendado',
  CHANGE created_at criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE updated_at atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
UPDATE agendamentos SET status=CASE status WHEN 'scheduled' THEN 'agendado' WHEN 'confirmed' THEN 'confirmado' WHEN 'completed' THEN 'concluido' WHEN 'cancelled' THEN 'cancelado' ELSE status END;
ALTER TABLE agendamentos MODIFY status ENUM('agendado','confirmado','concluido','cancelado') NOT NULL DEFAULT 'agendado';
