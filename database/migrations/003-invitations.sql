CREATE TABLE convites (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 email VARCHAR(190) NOT NULL,
 tipo ENUM('paciente','profissional','equipe') NOT NULL,
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 criado_por BIGINT UNSIGNED NOT NULL,
 expira_em DATETIME NOT NULL,
 enviado_em DATETIME NULL,
 utilizado_em DATETIME NULL,
 revogado_em DATETIME NULL,
 usuario_id BIGINT UNSIGNED NULL,
 criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (criado_por) REFERENCES usuarios(id),
 FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
 INDEX idx_convite_email (email),
 INDEX idx_convite_expiracao (expira_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
