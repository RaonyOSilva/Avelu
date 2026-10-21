CREATE TABLE usuarios (
  trocar_senha TINYINT(1) NOT NULL DEFAULT 0,

  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo ENUM('paciente', 'profissional', 'administrador', 'equipe') NOT NULL DEFAULT 'paciente',
  nome_completo VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  senha_hash VARCHAR(255) NOT NULL,
  telefone VARCHAR(30),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE especialidades (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL UNIQUE,
  slug VARCHAR(140) NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE perfis_profissionais (
  whatsapp VARCHAR(15) NULL, email_publico VARCHAR(190) NULL, site VARCHAR(500) NULL,

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE profissionais_especialidades (
  profissional_id BIGINT UNSIGNED NOT NULL,
  especialidade_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (profissional_id, especialidade_id),
  CONSTRAINT fk_pe_profissional FOREIGN KEY (profissional_id) REFERENCES perfis_profissionais(id) ON DELETE CASCADE,
  CONSTRAINT fk_pe_especialidade FOREIGN KEY (especialidade_id) REFERENCES especialidades(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE locais_atendimento (
  whatsapp VARCHAR(15) NULL, email_publico VARCHAR(190) NULL,
  orientacoes TEXT NULL, convenios VARCHAR(1000) NULL, particular TINYINT(1) NOT NULL DEFAULT 1,
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  tipo ENUM('clinica','consultorio','hospital','laboratorio','centro_medico','outro') NOT NULL,
  descricao TEXT,
  telefone VARCHAR(30),
  email VARCHAR(190),
  site VARCHAR(500),
  cep VARCHAR(8),
  endereco VARCHAR(190) NOT NULL,
  numero VARCHAR(20),
  complemento VARCHAR(100),
  bairro VARCHAR(100),
  cidade VARCHAR(100) NOT NULL,
  estado CHAR(2) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_locais_busca (ativo, cidade, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE profissionais_locais (
  profissional_id BIGINT UNSIGNED NOT NULL,
  local_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (profissional_id, local_id),
  CONSTRAINT fk_pl_profissional FOREIGN KEY (profissional_id) REFERENCES perfis_profissionais(id) ON DELETE CASCADE,
  CONSTRAINT fk_pl_local FOREIGN KEY (local_id) REFERENCES locais_atendimento(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE disponibilidades (
  local_id BIGINT UNSIGNED NULL, valor DECIMAL(10,2) NULL,
  CONSTRAINT fk_disponibilidade_local FOREIGN KEY (local_id) REFERENCES locais_atendimento(id),

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE agendamentos (
  local_nome VARCHAR(150) NULL, local_endereco VARCHAR(700) NULL, valor DECIMAL(10,2) NULL,
  origem ENUM('site','manual') NOT NULL DEFAULT 'site', nome_paciente VARCHAR(150) NULL,
  telefone_paciente VARCHAR(30) NULL, email_paciente VARCHAR(190) NULL, motivo_cancelamento VARCHAR(500) NULL,
  fluxo ENUM('previsto','aguardando','em_atendimento','faltou') NOT NULL DEFAULT 'previsto',
  chegada_em DATETIME NULL, iniciado_em DATETIME NULL, cadastro_paciente_id BIGINT UNSIGNED NULL,
  disponibilidade_ativa_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status IN ('agendado','confirmado') THEN disponibilidade_id ELSE NULL END) STORED,
  UNIQUE KEY uq_agendamento_ativo (disponibilidade_ativa_id), INDEX idx_agendamento_disponibilidade (disponibilidade_id),

  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  paciente_id BIGINT UNSIGNED NULL,
  profissional_id BIGINT UNSIGNED NOT NULL,
  disponibilidade_id BIGINT UNSIGNED NOT NULL,
  motivo VARCHAR(500),
  status ENUM('agendado', 'confirmado', 'concluido', 'cancelado') NOT NULL DEFAULT 'agendado',
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_agendamento_paciente FOREIGN KEY (paciente_id) REFERENCES usuarios(id),
  CONSTRAINT fk_agendamento_profissional FOREIGN KEY (profissional_id) REFERENCES perfis_profissionais(id),
  CONSTRAINT fk_agendamento_disponibilidade FOREIGN KEY (disponibilidade_id) REFERENCES disponibilidades(id),
  INDEX idx_agendamentos_paciente (paciente_id, status),
  INDEX idx_agendamentos_profissional (profissional_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
