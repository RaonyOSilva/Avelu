CREATE TABLE IF NOT EXISTS locais_atendimento (
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS profissionais_locais (
  profissional_id BIGINT UNSIGNED NOT NULL,
  local_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (profissional_id, local_id),
  CONSTRAINT fk_pl_profissional FOREIGN KEY (profissional_id) REFERENCES perfis_profissionais(id) ON DELETE CASCADE,
  CONSTRAINT fk_pl_local FOREIGN KEY (local_id) REFERENCES locais_atendimento(id) ON DELETE CASCADE
) ENGINE=InnoDB;
