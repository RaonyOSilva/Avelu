CREATE TABLE sessoes (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  expira_em DATETIME NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessao_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_sessoes_expiracao (expira_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE categorias_especialidades (
  especialidade_id BIGINT UNSIGNED PRIMARY KEY,
  grupo VARCHAR(100) NOT NULL,
  FOREIGN KEY (especialidade_id) REFERENCES especialidades(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE areas_especialidades (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  especialidade_id BIGINT UNSIGNED NOT NULL,
  nome VARCHAR(150) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (especialidade_id, nome),
  UNIQUE (id, especialidade_id),
  FOREIGN KEY (especialidade_id) REFERENCES especialidades(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE locais_especialidades (
  local_id BIGINT UNSIGNED NOT NULL,
  especialidade_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (local_id, especialidade_id),
  FOREIGN KEY (local_id) REFERENCES locais_atendimento(id) ON DELETE CASCADE,
  FOREIGN KEY (especialidade_id) REFERENCES especialidades(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE profissionais_areas (
  profissional_id BIGINT UNSIGNED NOT NULL,
  area_id BIGINT UNSIGNED NOT NULL,
  especialidade_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (profissional_id, area_id),
  FOREIGN KEY (profissional_id, especialidade_id) REFERENCES profissionais_especialidades(profissional_id, especialidade_id) ON DELETE CASCADE,
  FOREIGN KEY (area_id, especialidade_id) REFERENCES areas_especialidades(id, especialidade_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE locais_areas (
  local_id BIGINT UNSIGNED NOT NULL,
  area_id BIGINT UNSIGNED NOT NULL,
  especialidade_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (local_id, area_id),
  FOREIGN KEY (local_id, especialidade_id) REFERENCES locais_especialidades(local_id, especialidade_id) ON DELETE CASCADE,
  FOREIGN KEY (area_id, especialidade_id) REFERENCES areas_especialidades(id, especialidade_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE recuperacoes_senha (
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    usuario_id BIGINT UNSIGNED NOT NULL, expira_em DATETIME NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_recuperacao_usuario (usuario_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE gestao_acessos (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id BIGINT UNSIGNED NOT NULL,
    profissional_id BIGINT UNSIGNED NULL,
    local_id BIGINT UNSIGNED NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (profissional_id) REFERENCES perfis_profissionais(id) ON DELETE CASCADE,
    FOREIGN KEY (local_id) REFERENCES locais_atendimento(id) ON DELETE CASCADE,
    UNIQUE KEY uq_gestao_profissional (usuario_id, profissional_id),
    UNIQUE KEY uq_gestao_local (usuario_id, local_id),
    CONSTRAINT chk_gestao_escopo CHECK ((profissional_id IS NULL) <> (local_id IS NULL))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE agenda_eventos (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    disponibilidade_id BIGINT UNSIGNED NOT NULL,
    agendamento_id BIGINT UNSIGNED NULL,
    usuario_id BIGINT UNSIGNED NULL,
    acao VARCHAR(50) NOT NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (disponibilidade_id) REFERENCES disponibilidades(id) ON DELETE CASCADE,
    FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE registros_atendimentos (
 agendamento_id BIGINT UNSIGNED PRIMARY KEY,
 evolucao MEDIUMTEXT NOT NULL,
 receita MEDIUMTEXT NOT NULL,
 versao INT UNSIGNED NOT NULL DEFAULT 1,
 finalizado_em DATETIME NULL,
 atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE CASCADE
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE modelos_clinicos (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,usuario_id BIGINT UNSIGNED NOT NULL,
 titulo VARCHAR(100) NOT NULL,tipo ENUM('evolucao','receita') NOT NULL,conteudo TEXT NOT NULL,
 FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE lista_espera (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,profissional_id BIGINT UNSIGNED NOT NULL,local_id BIGINT UNSIGNED NOT NULL,
 nome VARCHAR(150) NOT NULL,telefone VARCHAR(30) NOT NULL,preferencia VARCHAR(500) NOT NULL DEFAULT '',
 status ENUM('aguardando','contatado','encerrado') NOT NULL DEFAULT 'aguardando',
 criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(profissional_id) REFERENCES perfis_profissionais(id) ON DELETE CASCADE,
 FOREIGN KEY(local_id) REFERENCES locais_atendimento(id) ON DELETE CASCADE
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE programacoes_agenda (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,usuario_id BIGINT UNSIGNED NOT NULL,
 profissional_id BIGINT UNSIGNED NOT NULL,local_id BIGINT UNSIGNED NOT NULL,
 configuracao JSON NOT NULL,status ENUM('ativa','pausada','concluida') NOT NULL,
 chave VARCHAR(64) NOT NULL UNIQUE,ultima_execucao DATETIME NULL,ultimo_erro VARCHAR(500) NULL,
 criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(usuario_id) REFERENCES usuarios(id),
 FOREIGN KEY(profissional_id) REFERENCES perfis_profissionais(id) ON DELETE CASCADE,
 FOREIGN KEY(local_id) REFERENCES locais_atendimento(id) ON DELETE CASCADE
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE programacao_horarios (
 programacao_id BIGINT UNSIGNED NOT NULL,disponibilidade_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(programacao_id,disponibilidade_id),UNIQUE(disponibilidade_id),
 FOREIGN KEY(programacao_id) REFERENCES programacoes_agenda(id) ON DELETE CASCADE,
 FOREIGN KEY(disponibilidade_id) REFERENCES disponibilidades(id) ON DELETE CASCADE
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE pacientes_recepcao(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,usuario_id BIGINT UNSIGNED NULL UNIQUE,nome VARCHAR(150) NOT NULL,telefone VARCHAR(30) NOT NULL,email VARCHAR(190) NULL,nascimento DATE NULL,criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE pacientes_unidades(paciente_id BIGINT UNSIGNED NOT NULL,local_id BIGINT UNSIGNED NOT NULL,PRIMARY KEY(paciente_id,local_id),FOREIGN KEY(paciente_id) REFERENCES pacientes_recepcao(id) ON DELETE CASCADE,FOREIGN KEY(local_id) REFERENCES locais_atendimento(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE vinculos_paciente(token_hash CHAR(64) PRIMARY KEY,usuario_id BIGINT UNSIGNED NOT NULL,expira_em DATETIME NOT NULL,FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE comunicacoes(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,agendamento_id BIGINT UNSIGNED NOT NULL,usuario_id BIGINT UNSIGNED NOT NULL,acao ENUM('aberta','envio_informado') NOT NULL,criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(agendamento_id) REFERENCES agendamentos(id) ON DELETE CASCADE,FOREIGN KEY(usuario_id) REFERENCES usuarios(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE administracao_eventos(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,usuario_id BIGINT UNSIGNED NULL,alvo_id BIGINT UNSIGNED NULL,acao VARCHAR(80) NOT NULL,criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
