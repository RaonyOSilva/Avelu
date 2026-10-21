# Fase C.2 — MySQL e isolamento

## Escopo e estado

Preparação implementada e validada em MySQL 8.0.42 **descartável**, sem conexão
com o banco de desenvolvimento. Nenhum serviço Railway foi criado. Não houve
deploy, commit, push ou migração do banco existente. A autenticação, permissões
funcionais, consultas de negócio, agenda automática e backup não foram modificados.

## Ambientes independentes

| Ambiente | NODE_ENV | APP_ENV | Banco | Conta de execução |
|---|---|---|---|---|
| Local existente | development | development | avelu | credencial local atual; recomenda-se usuário restrito |
| Homologação | production | staging | avelu_staging | avelu_staging_app |
| Produção futura | production | production | avelu_production | avelu_production_app |
| Teste descartável | test | test | avelu_test_identificador | usuário exclusivo desse banco |

Os arquivos de exemplo ficam em `config/environments/`. Não são carregados
automaticamente. A configuração local `.env` foi preservada. Para arquivos reais,
use `.env.staging`, `.env.production` ou arquivos `*.env`, todos ignorados pelo Git
e pela imagem Docker. Não preencha os arquivos `*.example` com segredos.

Na Railway, use ambientes separados, cada um com seu serviço MySQL e suas próprias
credenciais e volume. Referências ao host devem apontar ao serviço do mesmo ambiente.
Nomes de banco podem receber sufixo `_identificador`; a conta de execução hospedada
deve ser exatamente `DB_NAME` seguido de `_app`. Senhas devem ser distintas entre
ambientes; sua independência depende também do provisionamento, não apenas do código.

A aplicação hospedada exige APP_ENV explícito, rejeita rede local e nomes genéricos
como `avelu`. Antes de entregar cada conexão física nova à aplicação, confere a
tabela `avelu_environment`: ambiente e banco precisam coincidir com a configuração.
A conta de execução deve ter apenas SELECT nessa tabela, sem poder alterar sua identidade.
Desenvolvimento não exige essa tabela, preservando o banco atual sem migração.

## Variáveis MySQL

| Nome | Uso |
|---|---|
| DB_HOST, DB_PORT | Host e porta; 3306 por padrão |
| DB_NAME, DB_USER, DB_PASSWORD | Banco e credenciais exclusivos do ambiente |
| DB_NETWORK | local, railway-private ou tls |
| DB_CONNECTION_LIMIT | Conexões por processo, padrão 10; de 1 a 100 |
| DB_QUEUE_LIMIT | Fila limitada, padrão 100; de 1 a 10000 |
| DB_CONNECT_TIMEOUT_MS | Prazo de conexão e preparação da sessão, padrão 10000 |
| DB_ACQUIRE_TIMEOUT_MS | Prazo para adquirir conexão do pool, padrão 10000 |
| DB_TLS_MODE | disabled ou verify; verify obrigatório na rede externa tls |
| DB_TLS_CA | Certificado PEM da autoridade confiável, se necessário |
| DB_INIT_USER, DB_INIT_PASSWORD | Credencial de estrutura, somente no comando de inicialização |
| DB_DISPOSABLE, DB_TEST_CONFIRM | Barreiras explícitas para testes com banco |
| FIXTURE_PASSWORD | Senha temporária da carga fictícia, mínimo 12 caracteres |

Os dois timeouts aceitam de 100 a 60000 ms. Não foi introduzido cancelamento
indiscriminado de consultas nem repetição automática de INSERT/UPDATE/transações.
Conexões que falham na preparação são descartadas; falhas seguem para o tratamento
de erro existente da API. Conexões adquiridas após o prazo são liberadas.
O encerramento da C.1 continua fechando o pool, com operação de fechamento idempotente.

## Rede privada e TLS

`railway-private` aceita somente `servico.railway.internal` e exige
RAILWAY_ENVIRONMENT_ID. A rede privada da Railway usa túneis WireGuard e é isolada
por ambiente: [documentação oficial](https://docs.railway.com/networking/private-networking).
Nesse caso TLS no protocolo MySQL pode ser desabilitado explicitamente; a proteção
de transporte vem da rede privada. Não configure rede externa como se fosse privada.

Para uma conexão externa, `DB_NETWORK=tls` exige certificado válido e verificação
do nome do servidor (`rejectUnauthorized` e `verifyIdentity`). Não há modo de
ignorar certificado inválido. Hosts locais e IPs literais são recusados nesse modo.
Uma CA própria precisa estar em DB_TLS_CA e o certificado deve corresponder ao
hostname. O proxy TCP da plataforma, por si só, não garante que o MySQL esteja
configurado para TLS. Essa conexão deve ser validada antes do uso real.

Referência do driver: [mysql2 — conexões e TLS](https://sidorares.github.io/node-mysql2/docs/examples/connections/create-connection).

## Inicialização exclusiva de banco vazio

O DBA/provisionamento deverá criar previamente um **novo banco vazio** MySQL 8
(mínimo 8.0.16; validação feita em 8.0.42), com utf8mb4. Não usar dumps do banco local.
A conta DB_INIT_USER deve ser separada de DB_USER e receber, apenas no novo banco,
CREATE, REFERENCES, SELECT, INSERT e UPDATE. Ela não precisa DROP, privilégios globais,
GRANT OPTION nem acesso aos bancos de outros ambientes. Não configure essa credencial
no processo permanente da aplicação.

Procedimento, com a aplicação ainda parada:

1. Provisionar banco vazio e conta de estrutura fora da aplicação.
2. Selecionar explicitamente o arquivo de ambiente e fornecer os segredos fora do Git.
3. Revisar o plano sem conectar: `node scripts/initialize-empty.js --plan`.
4. Executar, por exemplo:
   `node --env-file=.env.staging scripts/initialize-empty.js --confirm-empty=avelu_staging`.
   Na Railway, as variáveis podem vir diretamente do processo, sem arquivo.
5. Conferir as versões e a identidade; provisionar conta de execução com SELECT,
   INSERT, UPDATE e DELETE **apenas nas 27 tabelas de negócio**, e somente SELECT
   em `avelu_environment` e `avelu_migrations`. Não conceder CREATE/ALTER/DROP à aplicação.
6. Remover DB_INIT_USER/DB_INIT_PASSWORD do ambiente de execução e retirar a credencial
   de estrutura quando não for mais necessária.

Ordem reproduzível:

| Versão | Conteúdo |
|---|---|
| 001-core.sql | 8 tabelas: usuários, profissionais, especialidades, locais, vínculos, disponibilidades e agendamentos |
| 002-modules.sql | 19 tabelas: sessões, detalhamentos, recuperação, equipe, atendimento, modelos, espera, programação e operação |

Mais duas tabelas técnicas guardam identidade e versões/checksums. A baseline
incorpora as colunas e índices finais dos scripts existentes sem executar seus
UPDATEs de dados, importar usuários ou modificar regras de acesso.

O inicializador usa lock consultivo, verifica versão MySQL, banco selecionado,
ausência de tabelas/views, rotinas e eventos antes do primeiro DDL. Recusa segunda
execução. DDL MySQL tem commit implícito: falha parcial **não é revertida** e uma
repetição é recusada. Inspecione o banco incompleto e provisione outro banco vazio;
o comando não remove ou corrige estruturas existentes automaticamente.
Os checksums normalizam CRLF/LF para não variar entre Windows e Linux.

Não usar `db:setup`, `db:migrate:pt` ou os scripts legados `setup-*` como procedimento
de implantação: eles foram preservados para compatibilidade, podem inserir dados
e não possuem as mesmas garantias de banco vazio. Não foram executados nesta fase.

## Dados fictícios

Com ambiente test ou staging, identidade correta, baseline completa, aplicação
parada e todas as tabelas de negócio vazias:

`node --env-file=.env.staging scripts/seed-fixtures.js --confirm-fixtures=avelu_staging`

É necessário fornecer FIXTURE_PASSWORD por variável/arquivo privado. O comando
gera uma conta de paciente, uma de profissional e uma de equipe, todas com nomes
explicitamente fictícios e e-mails `example.invalid`; cria uma especialidade e uma
unidade fictícias, seus vínculos, três horários futuros, um agendamento confirmado
e um pendente. Não cria sessões, prontuários nem dados clínicos reais.
Produção é recusada. Carga repetida ou presença de qualquer dado de negócio também
é recusada. Os INSERTs ficam em uma transação e a senha não é registrada em logs.
O lock evita duas cargas simultâneas; manter a aplicação parada evita concorrência
com operações que não participam desse lock.

O catálogo completo de especialidades é separado da estrutura; uma carga de referência
para produção deverá ser revisada em fase posterior. A fixture não pretende ser esse catálogo.

## Datas e Brasília

O modelo atual mantém DATETIME de agendamentos como horário civil de Brasília.
Não houve conversão de registros existentes. O driver agora usa `timezone: '-03:00'`
e toda conexão física recebe `SET SESSION time_zone = '-03:00'` antes de consultas
de negócio. Assim NOW(), comparação de vagas, parâmetros Date e leitura DATETIME
usam a mesma referência, independentemente do fuso do sistema operacional.

Objetos Date em Node representam instantes; JSON de Date usa UTC com Z. As consultas
que já retornam ISO com -03:00 foram preservadas. Os principais fluxos de navegador
já formatam com America/Sao_Paulo e continuam assim. Datas puras não devem ser
interpretadas como instantes UTC para apresentação de calendário.

Limitação existente: os horários civis usam offset fixo -03:00. Datas históricas de
horário de verão ou eventual mudança legislativa exigem análise própria; não se
deve converter prontuários antigos automaticamente. O SET é de sessão, não global.

## Testes e barreiras

- `npm test`: somente lista explícita de testes isolados, sem banco. Novos testes
  precisam ser classificados antes de entrar no executor.
- `npm run test:integration`: bloqueado antes de carregar a aplicação sem NODE_ENV=test,
  APP_ENV=test, DB_NAME=avelu_test_..., DB_DISPOSABLE=true e DB_TEST_CONFIRM igual ao
  nome do banco, além de todas as credenciais explícitas e sem root.
- As sete suítes legadas têm barreira antes de qualquer import da aplicação; não
  carregam mais o .env diretamente. Servidor em modo test também não carrega .env.
- A identidade do banco é conferida nas conexões de teste, mesmo com variáveis válidas.
- As suítes legadas completas não foram executadas. Algumas ainda exercitam scripts
  setup-* e catálogo de referência e precisam de preparação específica em banco
  descartável; não conceder DDL à conta permanente da aplicação para acomodá-las.

Validação MySQL autônoma realizada:

`node scripts/validate-mysql-isolated.js --confirm-isolated "--mysqld=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe"`

O executor usa --no-defaults, diretório novo em TEMP, porta dinâmica exclusiva,
bind de loopback, sem MySQL X nem binlog. Antes de qualquer CREATE/INSERT/GRANT,
compara @@datadir com o diretório recém-criado. Cria credenciais aleatórias próprias,
executa a baseline e os testes e encerra somente o processo que iniciou.
Logs e dados exclusivamente fictícios ficam no diretório temporário informado.
O serviço MySQL existente não é parado, reiniciado ou reconfigurado.

Resultados: 71 testes isolados aprovados; teste real de persistência/leitura de
agendamento entre 23:59 e 00:01 aprovado; estrutura completa criada; segunda
inicialização recusada; privilégios DDL/alteração de identidade recusados à aplicação;
carga fictícia validada (3 contas, 2 agendamentos, 0 sessões) e repetição recusada.
Validação executada no Node 22.17.0 local; a imagem fixada em 22.23.3 continua pendente.

Evidência da última execução: diretório temporário
`C:\Users\RAONY~1.OLI\AppData\Local\Temp\avelu-c2-LmnhsM`, porta exclusiva 54165,
MySQL 8.0.42. A instância foi encerrada ao final. O comando de plano confirmou
8 tabelas na versão 001 e 19 na versão 002. Verificações de sintaxe e
`git diff --check` também passaram.

## Impactos locais e pendências

O .env e os dados atuais permanecem intocados. Após um reinício futuro da aplicação,
as conexões usarão o fuso explícito de Brasília e limites de fila/aquisição. Em carga
excessiva, haverá falha controlada em vez de fila ilimitada. Não se reiniciou o servidor
local nesta fase. Sem configuração explícita, testes antigos agora recusam execução.

Pendências: validar imagem Node fixada e MySQL na rede real Railway; provisionar
ambientes/segredos e privilégios; testar TLS se houver conexão externa; executar a
regressão completa em banco descartável com catálogo preparado; definir carga de
referência e fluxo de primeiro administrador em fase autorizada; revisar persistência,
backup/restauração e concorrência de workers em suas fases específicas.
Não há autorização implícita para iniciar C.3.

## Arquivos da Fase C.2

Modificados: `README.md`, `config.js`, `db.js`, `server.js`, `package.json`, `.env.example`,
`.gitignore`, `.dockerignore`, `tests/config-isolated.test.js`,
`tests/access-policy.test.js`, `tests/admin.test.js`, `tests/auth-booking.test.js`,
`tests/experience.test.js`, `tests/operations.test.js`, `tests/scheduling.test.js`,
`tests/team.test.js`.

Criados: `database-config.js`, `database-pool.js`, `database/initialize.js`,
`database/fixtures.js`, `database/migrations/001-core.sql`,
`database/migrations/002-modules.sql`, os quatro exemplos em `config/environments/`,
`scripts/initialize-empty.js`, `scripts/seed-fixtures.js`, `scripts/run-tests.js`,
`scripts/validate-mysql-isolated.js`, `tests/require-test-database.js`,
`tests/database-isolated.test.js`, `tests/timezone-isolated.test.js`,
`tests/mysql-roundtrip.test.js` e este relatório.

Alterações de C.1 ainda aparecem no diff porque não houve commit entre as fases.
