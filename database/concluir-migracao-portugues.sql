USE avelu;

ALTER TABLE disponibilidades DROP CHECK chk_availability_dates;
ALTER TABLE disponibilidades
  CHANGE professional_id profissional_id BIGINT UNSIGNED NOT NULL,
  CHANGE start_at inicio_em DATETIME NOT NULL,
  CHANGE end_at fim_em DATETIME NOT NULL,
  MODIFY status ENUM('available','reserved','blocked','disponivel','reservado','bloqueado') NOT NULL DEFAULT 'disponivel',
  CHANGE created_at criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE disponibilidades SET status=CASE status WHEN 'available' THEN 'disponivel' WHEN 'reserved' THEN 'reservado' WHEN 'blocked' THEN 'bloqueado' ELSE status END;
ALTER TABLE disponibilidades
  MODIFY status ENUM('disponivel','reservado','bloqueado') NOT NULL DEFAULT 'disponivel',
  ADD CONSTRAINT chk_disponibilidade_datas CHECK (fim_em > inicio_em),
  RENAME INDEX uq_professional_start TO uq_profissional_inicio,
  RENAME INDEX idx_availability_search TO idx_disponibilidade_busca;

ALTER TABLE agendamentos
  CHANGE patient_id paciente_id BIGINT UNSIGNED NOT NULL,
  CHANGE professional_id profissional_id BIGINT UNSIGNED NOT NULL,
  CHANGE availability_id disponibilidade_id BIGINT UNSIGNED NOT NULL,
  CHANGE reason motivo VARCHAR(500),
  MODIFY status ENUM('scheduled','confirmed','completed','cancelled','agendado','confirmado','concluido','cancelado') NOT NULL DEFAULT 'agendado',
  CHANGE created_at criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHANGE updated_at atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
UPDATE agendamentos SET status=CASE status WHEN 'scheduled' THEN 'agendado' WHEN 'confirmed' THEN 'confirmado' WHEN 'completed' THEN 'concluido' WHEN 'cancelled' THEN 'cancelado' ELSE status END;
ALTER TABLE agendamentos
  MODIFY status ENUM('agendado','confirmado','concluido','cancelado') NOT NULL DEFAULT 'agendado',
  RENAME INDEX idx_patient_appointments TO idx_agendamentos_paciente,
  RENAME INDEX idx_professional_appointments TO idx_agendamentos_profissional;

ALTER TABLE perfis_profissionais
  DROP FOREIGN KEY fk_professional_user,
  ADD CONSTRAINT fk_perfil_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
ALTER TABLE profissionais_especialidades
  DROP FOREIGN KEY fk_ps_professional,
  DROP FOREIGN KEY fk_ps_specialty,
  ADD CONSTRAINT fk_pe_profissional FOREIGN KEY (profissional_id) REFERENCES perfis_profissionais(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_pe_especialidade FOREIGN KEY (especialidade_id) REFERENCES especialidades(id) ON DELETE CASCADE;
ALTER TABLE disponibilidades
  DROP FOREIGN KEY fk_availability_professional,
  ADD CONSTRAINT fk_disponibilidade_profissional FOREIGN KEY (profissional_id) REFERENCES perfis_profissionais(id) ON DELETE CASCADE;
ALTER TABLE agendamentos
  DROP FOREIGN KEY fk_appointment_patient,
  DROP FOREIGN KEY fk_appointment_professional,
  DROP FOREIGN KEY fk_appointment_availability,
  ADD CONSTRAINT fk_agendamento_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios(id),
  ADD CONSTRAINT fk_agendamento_profissional FOREIGN KEY (profissional_id) REFERENCES perfis_profissionais(id),
  ADD CONSTRAINT fk_agendamento_disponibilidade FOREIGN KEY (disponibilidade_id) REFERENCES disponibilidades(id);
