# Fase C.4 — Operação, segurança e monitoramento

## Situação e escopo

Preparação implementada e testada localmente, sem publicação, criação de serviços, commit ou push.
Nenhuma migração C.4 foi necessária. O banco de desenvolvimento e seu `.env` não foram utilizados
pelos testes nem modificados. Todas as escritas SQL ocorreram em instâncias MySQL temporárias.
Regras de horários, duração, feriados e cálculo de disponibilidade permanecem no motor existente.

Esta entrega **não declara a infraestrutura Railway pronta para produção**: instalação do cliente
MySQL na imagem Linux, volume, armazenamento externo, HTTPS real e alertas ainda precisam ser validados.
A Fase D e qualquer publicação dependem de autorização.

## Arquitetura operacional

Inicialmente, uma instância Node/Express atende HTTP e executa os dois workers existentes.
MySQL independente por ambiente mantém as transações e as travas distribuídas.
O backup grava ciphertext em um volume persistente e, quando configurado, envia uma cópia
para um destino HTTPS independente. A chave de criptografia permanece fora desse armazenamento.

Para futuras réplicas, a coordenação por MySQL já evita execução concorrente do ciclo de agendas
e do backup. Os limitadores de autenticação continuam por processo; portanto **manter uma réplica**
até implementar armazenamento compartilhado para limitação de tentativas. Nenhum Redis foi adicionado.
Volumes de backup não devem ser compartilhados entre máquinas sem validar a semântica de filesystem.

## Agendamento automático

- `GET_LOCK` identifica o ciclo pelo banco. A conexão que mantém a trava também executa as transações,
  evitando ocupar uma segunda conexão e permitindo pool pequeno.
- Locks de linha e de profissional existentes continuam protegendo a publicação de horários.
- Reprocessamento consulta os horários já existentes; transação confirma horários, vínculos e eventos juntos.
- Antes de executar a regra, o responsável precisa estar ativo e ser equipe ou administrador,
  além de continuar autorizado ao profissional/local. Perda de autorização pausa a regra.
- Falha de uma regra é registrada sem conteúdo clínico; o ciclo seguinte pode tentar novamente.
  Falha de conexão encerra o ciclo. Não há repetição cega de uma escrita fora de transação.
- Worker não inicia outro tick enquanto o anterior está em andamento. Intervalo de 15 minutos preservado.
- SIGTERM impede novos ticks e novas regras, espera a transação em andamento, drena HTTP e só então
  fecha o pool. O prazo de `SHUTDOWN_TIMEOUT_MS` continua limitado; ao excedê-lo, o processo sai com erro.
  Uma conexão interrompida antes do commit faz rollback no MySQL; o próximo processo reavalia a regra.

## Backup

### Geração, criptografia e credenciais

`mysqldump` MySQL 8 usa `--single-transaction`, `--quick`, `--skip-lock-tables`,
`--routines`, `--triggers`, `--events`, `--hex-blob`, `--no-tablespaces`,
`--set-gtid-purged=OFF`, `--column-statistics=0` e `--skip-add-drop-table`.
Não exporta com `--databases`, para evitar criação/troca de banco na restauração.
Não executar DDL simultaneamente ao snapshot. A consistência transacional pressupõe tabelas InnoDB.

O stdout passa diretamente por AES-256-GCM e grava `.partial`; somente após sucesso do processo
o arquivo recebe extensão `.enc`. Não se usa buffer de 256 MB ou leitura integral do dump.
Formato `AVELU1` preservado: cabeçalho, IV de 12 bytes, tag de 16 bytes e ciphertext.
Uma verificação completa da tag é feita por streaming, descartando o plaintext, antes de marcar sucesso.

Credenciais vão em arquivo temporário privado (diretório 0700/arquivo 0600 em Linux), nunca em argumentos
de senha ou logs. `spawn` não usa shell. Arquivos são removidos no `finally`; encerramento forçado pode
deixar artefatos temporários que precisam de limpeza operacional. O arquivo final não contém a chave.
No Windows, validar ACLs se houver uso fora dos testes; chmod não substitui uma revisão de ACL.

Em hospedagem, `BACKUP_DB_USER`/`BACKUP_DB_PASSWORD` são obrigatórios e separados da conta web.
A conta dedicada deve ter SELECT, SHOW VIEW, TRIGGER e EVENT no banco alvo; SHOW_ROUTINE pode ser
necessário para exportar rotinas no MySQL 8. A permissão SHOW_ROUTINE é global: avaliar essa concessão
no MySQL dedicado do ambiente. Não entregar credencial administrativa ao processo web.
Contas de backup não precisam de CREATE/DROP DATABASE. O ensaio usa conta de backup dedicada.

Conexões TLS usam `VERIFY_IDENTITY` e a CA configurada. Em conexão local/rede privada explicitamente
validada sem TLS, o cliente solicita a chave pública para autenticação `caching_sha2_password`.
Isso não substitui autenticação do servidor por TLS em redes públicas. Nenhuma redução para
`mysql_native_password` foi necessária.

### Persistência, cópia externa e retenção

`BACKUP_DIR` precisa apontar para volume persistente com espaço e permissão do usuário não root.
Sem volume, o filesystem efêmero do container não é uma cópia recuperável após substituição.
O Dockerfile atual ainda não inclui o cliente MySQL: não habilitar o backup hospedado antes de resolver
esse requisito e validar a imagem em Linux.

`BACKUP_REMOTE_URL` configura um adaptador PUT HTTPS por streaming. Redirecionamentos são recusados.
`BACKUP_REMOTE_TOKEN`, quando utilizado, vai no cabeçalho Authorization. O destino deve:

1. Armazenar cada `X-Backup-Name` como objeto independente, sem sobrescrever cópias anteriores.
2. Calcular SHA-256 do objeto recebido e devolver `X-Backup-SHA256` igual ao hash enviado.
3. Confirmar sucesso somente após persistência, com controle de acesso e retenção no armazenamento.

Não é um conector S3 pronto: exige um endpoint que cumpra esse contrato. Nenhum serviço foi criado
ou contatado nesta fase. O transporte foi testado com substituto em memória e dados fictícios.
O recibo confirma o hash informado pelo destino; validar recuperação e durabilidade do provedor ainda é necessário.

A retenção local padrão é de 7 dias, preservando pelo menos o arquivo mais recente. Limpeza ocorre
somente após uma cópia externa confirmada. Sem destino, arquivos locais são conservados e podem ocupar
todo o volume: monitorar espaço. Política externa proposta para homologação: 14 cópias diárias;
configurar o lifecycle do provedor posteriormente. Não foi implementada exclusão remota automática.
Separar a chave AES em gerenciador de segredos com cópia de recuperação offline. Guardar chaves antigas
até expirar todos os backups que as utilizam. A rotação não recriptografa arquivos anteriores.

`status.json` registra última cópia, bytes, integridade e situação externa. `failure.json` registra somente
a data da última falha; sucesso limpa a falha. Falhas também geram evento estruturado e contador operacional.
Intervalos atuais preservados: verificação a cada hora, backup após 24 horas, nova tentativa após falha.
RPO proposto: até 24 horas quando o sistema funciona; atraso/falha aumenta esse intervalo.
RTO ainda não medido em volume representativo.

### Integridade versus restauração

`npm run backup:verify` agora verifica **somente integridade criptográfica**, sem criar bancos.
O indicador do painel foi corrigido para não chamar essa verificação de restauração.
O antigo comportamento de criar um banco no mesmo servidor configurado foi substituído por um ensaio
separado, exclusivamente descartável. Isso evita usar acidentalmente o MySQL de desenvolvimento.

Procedimento de ensaio:

1. Criar uma instância MySQL descartável e comprovar `@@datadir` antes de qualquer escrita.
2. Criar um banco vazio `avelu_test_restore_*` e uma conta exclusiva desse destino, sem privilégios
   sobre outros bancos, roles ou GRANT OPTION. Não utilizar root no comando de restauração.
3. Informar variáveis de teste exigidas por C.2 e as variáveis `RESTORE_*` abaixo.
4. Executar:

   ```text
   node scripts/restore-backup.js --confirm-restore=avelu_test_restore_IDENTIFICADOR
   ```

5. Comparar tabelas, contagens e amostras fictícias, validar relacionamentos e registrar duração.
6. Encerrar a instância descartável. O comando não remove nem substitui bancos existentes.

A restauração verifica toda a tag GCM **antes** de enviar SQL ao MySQL, usando arquivo temporário privado
para não consumir a memória com o dump inteiro. Confere nome, diretório da instância, grants e ausência
de tabelas; recusa USE/CREATE DATABASE/DROP DATABASE e comandos de cliente na inspeção do dump.
Uma segunda execução no banco restaurado é recusada. Falha pode deixar restauração parcial no destino
descartável: criar outro destino vazio, não reaplicar por cima.
O marcador `avelu_environment` restaurado conserva a identidade de origem; não iniciar a aplicação
nesse destino como se fosse outro ambiente. Uma restauração real, incluindo identidade, usuários técnicos,
sessões e objetos com DEFINER, exige plano e autorização próprios.

## HTTP, CSP e PWA

Helmet passa a emitir CSP efetiva: scripts somente da própria origem, sem handlers inline/eval,
objetos bloqueados, formulários e base na própria origem, aplicação não embutível em frames.
Fontes Google e imagens HTTPS permanecem permitidas para compatibilidade com o frontend.
Estilos inline permanecem permitidos porque a interface usa estilos dinâmicos; retirar isso exigiria
adaptação adicional. HSTS e upgrade de HTTP são ativados somente em ambiente hospedado.
Referrer-Policy é `no-referrer`; arquivos internos continuam fora da lista de arquivos públicos.

Foi verificado que os HTML existentes usam scripts externos e não dependem de handlers inline.
Testes de UI existentes continuaram passando. A política foi ativada após essa verificação e testes
de cabeçalhos; ainda falta validação visual completa em navegador real, especialmente impressão,
fontes e imagens externas. CSP reduz superfície de XSS, mas não substitui escaping/validação de entrada.

Validação de Origin, cookies HttpOnly/SameSite/Secure e configuração restrita de proxy foram preservadas.
Falhas HTTP recebem identificador gerado no servidor. Erros não devolvem stack ou SQL.

O cache PWA mudou para `avelu-static-v12` e contém somente assets estáticos conhecidos.
Navegações HTML e APIs não entram no cache. Offline retorna aviso genérico sem dados de pacientes.
Caches antigos `avelu-*` são removidos na ativação; caches de outras aplicações não são apagados.
HTML recebe `Cache-Control: no-store`. O guard de privacidade recarrega páginas vindas do histórico
persistido do navegador e avisa outras abas do logout via BroadcastChannel. Logout bem-sucedido
limpa caches Avelu. Não são gravados tokens ou conteúdo clínico em storage por esse mecanismo.
O storage já existente guarda filtros de busca e um ID temporário de agendamento, não prontuário.
Uma página já aberta pode precisar recarregar para receber a nova versão do guard/service worker.

## Monitoramento

| Endpoint | Finalidade | Dependência do MySQL |
| --- | --- | --- |
| `/health/startup` | Express já consegue responder; usado por `railway.toml` | Não |
| `/health/live` | Processo HTTP disponível; 503 durante encerramento | Não |
| `/api/health` | Alias de liveness para compatibilidade de caminho | Não, sem o antigo campo database |
| `/health/ready` | Dependência MySQL operacional | SELECT 1, resposta limitada a 2 segundos |

Readiness usa uma consulta em voo e cache de 5 segundos; não multiplica consultas enquanto a anterior
continua pendente. O pool também mantém seus próprios timeouts. Erro temporário retorna 503 genérico;
liveness não cai por esse motivo. Não configurar reinício automático baseado em readiness.
Startup não garante que a aplicação possa concluir uma consulta de negócio: combinar observação com readiness.

Logs JSON usam `time`, `bootId`, evento e campos numéricos permitidos. `requestId` é gerado pelo servidor;
não se registra URL/query, payload, IP, e-mail, cookies, senha, token, SQL ou mensagens de exceções.
Eventos incluem `process.start`, `http.listening`, `process.stopping`, `process.stopped`,
`process.crashed`, `api.failed`, `http.failure`, `schedule.started/completed/failed` e
`backup.started/completed/failed`. Exceções fatais são registradas sem detalhes sensíveis e encerram o processo.
Novo bootId sem `process.stopped` anterior é indício de término inesperado; SIGKILL pode não gerar log final.

Alertas futuros, sem serviço criado agora: readiness indisponível por 5 minutos; repetição de 5xx;
falha de agenda; backup com falha ou mais de 26 horas; cópia externa ausente; espaço em volume abaixo
de 20%; reinicializações repetidas. Definir destinatários, agregação e retenção de logs antes da hospedagem.
O painel administrativo continua mostrando o monitor interno, que é zerado em cada reinicialização.

## Limitação de tentativas

Autenticação conserva limites por IP e e-mail; convites conservam 30 solicitações/hora por administrador.
Os mapas agora recusam novas chaves ao atingir 10 mil entradas, para limitar consumo de memória.
Chaves de IP/e-mail usam hash de tamanho fixo, evitando armazenar entradas arbitrariamente grandes.
Expiração continua removendo entradas. Respostas de recusa incluem Retry-After.
Para a primeira homologação, uma réplica e proxy restrito são obrigatórios para que o IP tenha significado.
Reinício perde contadores e múltiplas réplicas multiplicam o limite. Em fase posterior, escolher armazenamento
compartilhado com incremento atômico e TTL; falha do limitador deve recusar ações sensíveis. Nenhum Redis foi instalado.

## Variáveis

As variáveis C.1–C.3 de ambiente, MySQL, origem e proxy permanecem. Novas/revisadas:

| Nome | Finalidade |
| --- | --- |
| `BACKUP_DIR` | Volume persistente de ciphertext |
| `BACKUP_KEY` | Chave AES de 32 bytes, representada por 64 caracteres hexadecimais |
| `BACKUP_DB_USER`, `BACKUP_DB_PASSWORD` | Conta dedicada de exportação; obrigatória hospedada |
| `MYSQLDUMP_PATH` | Executável MySQL 8, sem shell |
| `BACKUP_TIMEOUT_MS` | Prazo do dump/envio, padrão 300000 |
| `BACKUP_RETENTION_DAYS` | Retenção local, padrão 7; de 1 a 365 |
| `BACKUP_REMOTE_URL`, `BACKUP_REMOTE_TOKEN` | Destino HTTPS e autenticação opcional; vazios desativam envio |
| `MYSQL_PATH` | Cliente MySQL 8 para ensaios |
| `BACKUP_FILE` | Caminho absoluto do ciphertext a restaurar |
| `RESTORE_DB_NAME`, `RESTORE_DB_USER`, `RESTORE_DB_PASSWORD` | Destino vazio e conta exclusiva |
| `RESTORE_EXPECTED_DATADIR` | Diretório comprovado da instância descartável |
| `SHUTDOWN_TIMEOUT_MS` | Prazo máximo de drenagem; compatibilizar com a plataforma |

Não colocar chaves reais nos exemplos nem usar credenciais de backup/restauração como conta web.
As variáveis de restauração só devem existir no processo de ensaio.

## Testes e evidências

- `npm test`: 89 testes isolados aprovados, incluindo logs sem segredos, worker single-flight,
  drenagem, falha/recuperação simulada do MySQL, health checks, CSP, PWA e GCM adulterado/truncado/chave errada.
- MySQL 8.0.42 descartável: 6 testes C.4 aprovados (incluindo teste pai), 11 testes de regressão C.3/acesso
  e 1 de persistência de datas. Não é uma execução de toda a suíte histórica de integração.
- Concorrência de workers, trava distribuída, idempotência, perda de tipo/vínculo e interrupção real
  de processo após INSERT e antes do commit foram exercitadas. Após interrupção, contagem permaneceu zero;
  retomada criou os quatro horários esperados, sem duplicação.
- Backup real com mysqldump, criptografia e restore real com mysql em outro banco vazio da mesma instância
  descartável. Comparadas contagens de usuários, agendamentos, disponibilidades, programações e convites;
  verificadas 30 tabelas, recusa de destino errado e recusa de segunda restauração.
- Transporte externo testado somente com substituto, sem conexão ou envio para provedor.
- HTTP real em porta temporária: CSP, no-store, nosniff, arquivos internos 404, APIs protegidas,
  health checks. Login/logout, invalidação de sessão, CSRF e convites cobertos pela regressão C.3.

Reprodução segura:

```text
npm test
node scripts/validate-mysql-isolated.js --confirm-isolated --phase-c4 --mysqld="C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe"
```

O executor não carrega `.env`; cria instância com `--no-defaults`, porta e datadir exclusivos,
confere `@@datadir` antes das escritas, cria usuários limitados e encerra apenas seu processo filho.
Artefatos restantes são exclusivamente fictícios. Nenhuma instância MySQL existente é reiniciada ou usada.
Último ensaio C.4 completo: `avelu-c2-yGSurF`, porta exclusiva 62689, MySQL 8.0.42,
backup fictício de 48.588 bytes e 30 tabelas restauradas; processo MySQL encerrado pelo executor.
As verificações de sintaxe e `git diff --check` passaram (somente avisos LF/CRLF do Git).

## Inventário da C.4

Criados: `background-task.js`, `backup-crypto.js`, `mysql-command.js`, `operational-log.js`,
`operational-health.js`, `http-security.js`, `privacy-guard.js`, `scripts/restore-backup.js`,
`tests/operational-isolated.test.js`, `tests/operational.test.js`,
`tests/fixtures/schedule-crash.js` e este documento.

Modificados: `schedule-service.js`, `backup-service.js`, `server-lifecycle.js`, `server.js`,
`service-worker.js`, `auth.js`, `invitation-routes.js`, `operations-ui.js`, `scripts/backup.js`,
`scripts/run-scheduling.js`, `scripts/run-tests.js`, `scripts/validate-mysql-isolated.js`,
`railway.toml`, `.env.example`, `config/environments/staging.env.example`, `.gitignore`,
`.dockerignore` e `README.md`. O Git também contém alterações anteriores C.1–C.3 ainda não commitadas.

## Impactos locais e pendências

O servidor local não foi reiniciado. No próximo início, CSP será aplicada e páginas offline exigirão
reconexão; assets continuam cacheáveis. Programações cuja conta perdeu o papel/vínculo serão pausadas
quando o worker executá-las. Isso aplica a autorização existente, sem mudar o calendário.
Backup configurado localmente continua automático; `backup:verify` deixa de criar banco.
Sem destino externo não há remoção por retenção; planejar espaço. Nada disso executou sobre os dados locais nesta fase.

Pendências antes de publicação: instalar e validar clientes Oracle MySQL 8 no Linux/container
(não substituir inadvertidamente por cliente MariaDB com flags diferentes), testar Node fixado,
filesystem/UID do volume, TLS/proxy/HTTPS real, período de encerramento da Railway, entrega externa e recuperação,
alertas e política de retenção do provedor. Validar impressão e atualização de PWA em navegador real.
Medir backup/restauração com volume representativo. Credenciais de rotina/DEFINER exigem revisão se surgirem
stored procedures, triggers ou eventos além do esquema atual. Não foi implementado PITR/binlog ou agendamento
externo capaz de continuar com toda a aplicação parada.

**Nenhum dado existente foi alterado. Nenhum deploy, serviço externo, commit ou push foi realizado.
A Fase D permanece aguardando autorização.**
