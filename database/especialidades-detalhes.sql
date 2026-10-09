CREATE TABLE IF NOT EXISTS categorias_especialidades (
  especialidade_id BIGINT UNSIGNED PRIMARY KEY,
  grupo VARCHAR(100) NOT NULL,
  FOREIGN KEY (especialidade_id) REFERENCES especialidades(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS areas_especialidades (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  especialidade_id BIGINT UNSIGNED NOT NULL,
  nome VARCHAR(150) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (especialidade_id, nome),
  UNIQUE (id, especialidade_id),
  FOREIGN KEY (especialidade_id) REFERENCES especialidades(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS locais_especialidades (
  local_id BIGINT UNSIGNED NOT NULL,
  especialidade_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (local_id, especialidade_id),
  FOREIGN KEY (local_id) REFERENCES locais_atendimento(id) ON DELETE CASCADE,
  FOREIGN KEY (especialidade_id) REFERENCES especialidades(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS profissionais_areas (
  profissional_id BIGINT UNSIGNED NOT NULL,
  area_id BIGINT UNSIGNED NOT NULL,
  especialidade_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (profissional_id, area_id),
  FOREIGN KEY (profissional_id, especialidade_id) REFERENCES profissionais_especialidades(profissional_id, especialidade_id) ON DELETE CASCADE,
  FOREIGN KEY (area_id, especialidade_id) REFERENCES areas_especialidades(id, especialidade_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS locais_areas (
  local_id BIGINT UNSIGNED NOT NULL,
  area_id BIGINT UNSIGNED NOT NULL,
  especialidade_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (local_id, area_id),
  FOREIGN KEY (local_id, especialidade_id) REFERENCES locais_especialidades(local_id, especialidade_id) ON DELETE CASCADE,
  FOREIGN KEY (area_id, especialidade_id) REFERENCES areas_especialidades(id, especialidade_id)
) ENGINE=InnoDB;
