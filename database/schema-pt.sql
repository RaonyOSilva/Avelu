CREATE DATABASE IF NOT EXISTS avelu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE avelu;

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo ENUM('paciente', 'profissional', 'administrador') NOT NULL DEFAULT 'paciente',
  nome_completo VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  senha_hash VARCHAR(255) NOT NULL,
  telefone VARCHAR(30),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS especialidades (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL UNIQUE,
  slug VARCHAR(140) NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS perfis_profissionais (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL UNIQUE,
  titulo_profissional VARCHAR(150) NOT NULL,
  numero_registro VARCHAR(80),
  biografia TEXT,
  avatar_url VARCHAR(500),
  distancia_km DECIMAL(7,2),
  avaliacao DECIMAL(2,1) NOT NULL DEFAULT 0,
  quantidade_avaliacoes INT UNSIGNED NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_perfil_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS profissionais_especialidades (
  profissional_id BIGINT UNSIGNED NOT NULL,
  especialidade_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (profissional_id, especialidade_id),
  CONSTRAINT fk_pe_profissional FOREIGN KEY (profissional_id) REFERENCES perfis_profissionais(id) ON DELETE CASCADE,
  CONSTRAINT fk_pe_especialidade FOREIGN KEY (especialidade_id) REFERENCES especialidades(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS disponibilidades (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  profissional_id BIGINT UNSIGNED NOT NULL,
  inicio_em DATETIME NOT NULL,
  fim_em DATETIME NOT NULL,
  status ENUM('disponivel', 'reservado', 'bloqueado') NOT NULL DEFAULT 'disponivel',
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_disponibilidade_datas CHECK (fim_em > inicio_em),
  CONSTRAINT uq_profissional_inicio UNIQUE (profissional_id, inicio_em),
  CONSTRAINT fk_disponibilidade_profissional FOREIGN KEY (profissional_id) REFERENCES perfis_profissionais(id) ON DELETE CASCADE,
  INDEX idx_disponibilidade_busca (status, inicio_em)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agendamentos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  paciente_id BIGINT UNSIGNED NOT NULL,
  profissional_id BIGINT UNSIGNED NOT NULL,
  disponibilidade_id BIGINT UNSIGNED NOT NULL UNIQUE,
  motivo VARCHAR(500),
  status ENUM('agendado', 'confirmado', 'concluido', 'cancelado') NOT NULL DEFAULT 'agendado',
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_agendamento_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios(id),
  CONSTRAINT fk_agendamento_profissional FOREIGN KEY (profissional_id) REFERENCES perfis_profissionais(id),
  CONSTRAINT fk_agendamento_disponibilidade FOREIGN KEY (disponibilidade_id) REFERENCES disponibilidades(id),
  INDEX idx_agendamentos_paciente (paciente_id, status),
  INDEX idx_agendamentos_profissional (profissional_id, status)
) ENGINE=InnoDB;
