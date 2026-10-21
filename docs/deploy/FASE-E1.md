# Fase E.1 — Preparação para validação Linux na Railway

20/10/2026. Preparação local concluída. **Nenhum deploy ou serviço criado. A imagem ainda não foi construída/executada.** Este roteiro só deve ser executado após nova autorização; criar um serviço conectado ao GitHub pode disparar build/deploy e cobrança.

## 1. Alterações e verificação local

| Arquivo | Ajuste |
| --- | --- |
| `Dockerfile` | Cliente Oracle MySQL 8.0.46, repositório HTTPS assinado e fingerprint fixado; validação amd64; limpeza de pacotes auxiliares; diretórios privados pertencentes a node; caminhos absolutos dos clientes. |
| `.dockerignore` | Exclui exports, SQL legado, planilhas, arquivos compactados, bancos locais e configurações de IDE; preserva somente SQL das migrações para inicialização manual. |
| `railway.toml` | Uma réplica explícita; mantém CMD direto, health e política de reinício. |
| `tests/deploy-isolated.test.js` | Contratos de empacotamento e configuração isolada de staging. |
| `scripts/run-tests.js` | Classifica os novos testes como isolados. |
| `docs/deploy/FASE-E1.md` | Procedimentos, custos, rollback e barreiras de publicação. |

`npm test`: **92 aprovados, zero falhas, zero ignorados**, incluindo HTTPS local com banco em memória. Evidência local: `%TEMP%\avelu-e1-tests.log`. Nenhuma integração MySQL foi executada nesta fase; os 72 testes de integração da Fase D são evidência anterior, não nova execução. Os novos testes são verificações estáticas/configuração, não prova de build Docker.

Nenhuma regra de negócio, dado existente, autenticação ou migração foi modificada. Docker e ferramentas não foram instalados no computador.

## 2. Dockerfile final

- Base: `node:22.23.3-bookworm-slim`, alinhada com `.nvmrc`, `package.json` e lockfile.
- Arquitetura alvo: **linux/amd64**. O build recusa arquitetura diferente, em vez de instalar binários incompatíveis. Confirmar arquitetura do builder Railway antes de iniciar.
- Cliente: `mysql-community-client=8.0.46-1debian12`, incluindo mysql e mysqldump; não instala servidor nem usa o cliente MariaDB padrão do Debian.
- Repositório Oracle HTTPS, chave pública 2025, fingerprint `BCA43417C3B485DD128EC6D4B7B3B788A8D3785C`, APT com `signed-by`. Não há bypass de assinatura. Chave expirada, pacote removido ou fingerprint divergente devem interromper build e exigir revisão.
- O índice oficial consultado contém essa versão. A instalação e sua compatibilidade efetiva com o servidor **ainda precisam do build e ensaio Linux**. Após validar, registrar digest da imagem e versões efetivas; pacotes base continuam sujeitos às atualizações dos repositórios.
- `npm ci --omit=dev`, limpeza de cache APT/npm e ferramentas auxiliares; nenhuma credencial via ARG ou ENV de build.
- `USER node`; `/data/backups` e `/app/.backups` criados com modo 0700 e proprietário node.
- `HOST=0.0.0.0`; clientes em `/usr/bin/mysql` e `/usr/bin/mysqldump`.
- CMD exec `node server.js`, Node como PID 1 e `STOPSIGNAL SIGTERM`. `npm start` aponta ao mesmo servidor, mas não envolve o processo principal no container.
- Não há inicialização de schema, carga ou bootstrap no CMD. Scripts de preparação não fazem parte da lista pública do Express.
- SQL legado fica fora da imagem; comandos antigos `db:setup:*` não devem ser usados nela. Migrações novas e fixtures JS continuam disponíveis para execução manual controlada.

Referências: [repositório APT Oracle](https://dev.mysql.com/doc/mysql-apt-repo-quick-guide/en/), [índice Bookworm amd64](https://repo.mysql.com/apt/debian/dists/bookworm/mysql-8.0/binary-amd64/Packages), [chave pública Oracle](https://repo.mysql.com/RPM-GPG-KEY-mysql-2025).

## 3. Railway e variáveis

`railway.toml`: Dockerfile na raiz, uma réplica, `/health/startup`, timeout 120 s, `ON_FAILURE`, máximo 3 reinícios. Não definir pre-deploy de migração nem sobrescrever Start Command: usar o CMD da imagem. PORT vem da Railway; EXPOSE 3000 é apenas metadado. Readiness `/health/ready` deve ser validado separadamente: startup não comprova conectividade ou schema do banco.

Utilizar `config/environments/staging.env.example` como referência, nunca copiar `.env` local. A lista abaixo não contém credenciais reais.

| Finalidade | Variáveis / configuração |
| --- | --- |
| Ambiente | `NODE_ENV=production`, `APP_ENV=staging`, `HOMOLOGATION_MODE=true`, `INVITE_ONLY=true`, `INVITE_TTL_HOURS` |
| HTTP | `HOST=0.0.0.0`, `PORT` fornecida pela plataforma, `APP_ORIGIN` HTTPS exata, `TRUST_PROXY=false` inicialmente, `SHUTDOWN_TIMEOUT_MS` |
| Banco privado | `DB_NETWORK=railway-private`, `DB_HOST` hostname interno do serviço do mesmo ambiente, `DB_PORT`, `DB_NAME=avelu_staging`, `DB_USER=avelu_staging_app`, `DB_PASSWORD` secreto; `RAILWAY_ENVIRONMENT_ID` fornecida pela Railway |
| Pool | `DB_CONNECTION_LIMIT`, `DB_QUEUE_LIMIT`, `DB_CONNECT_TIMEOUT_MS`, `DB_ACQUIRE_TIMEOUT_MS` |
| TLS | `DB_TLS_MODE=disabled` somente na rede privada criptografada; se TLS MySQL habilitado, `DB_TLS_MODE=verify` e `DB_TLS_CA` quando necessário. Para conexão externa usar `DB_NETWORK=tls`, hostname e certificado válidos. |
| Vitrine | `HOMOLOGATION_PROFESSIONAL_IDS`, `HOMOLOGATION_PLACE_IDS`: vazios inicialmente; só IDs fictícios revisados |
| E-mail | `RESEND_API_KEY`, `MAIL_FROM`: não configurar nem enviar convites nesta etapa |
| Backup | `BACKUP_DIR`, `BACKUP_KEY` (64 hex aleatórios), `BACKUP_DB_USER`, `BACKUP_DB_PASSWORD`, `BACKUP_RETENTION_DAYS`, `BACKUP_TIMEOUT_MS`, `MYSQL_PATH`, `MYSQLDUMP_PATH` |
| Cópia externa | `BACKUP_REMOTE_URL`, `BACKUP_REMOTE_TOKEN`: manter vazios durante validação |
| Preparação temporária | `DB_INIT_USER`, `DB_INIT_PASSWORD`, `FIXTURE_PASSWORD`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`: somente sessão controlada de manutenção; remover após uso |

Referenciar hostname/porta do MySQL pela interface de variáveis Railway. **Não usar o usuário root ou MYSQL_URL padrão como credencial da aplicação.** Os validadores exigem usuário com nome correspondente ao banco e identidade `avelu_environment`; recusam localhost em staging.

`TRUST_PROXY=false` é conservador. Não assumir que basta configurar `true` ou `1`. Após observar/documentar o proxy, habilitar somente IPs/CIDRs verificados e testar IP do cliente, CSRF e cabeçalhos forjados. Sem isso, o limitador pode agrupar usuários pelo IP do proxy. Cookies Secure dependem do modo production, e validação de origem usa APP_ORIGIN; não abrir domínio antes do teste da cadeia HTTPS.

Referências: [rede privada Railway](https://docs.railway.com/networking/private-networking), [Start Command](https://docs.railway.com/deployments/start-command).

## 4. Procedimento manual futuro: serviços

1. Obter autorização para criação de recursos e gasto. Criar projeto exclusivo de homologação, ambiente separado, acesso restrito aos responsáveis, MFA e alerta/limite de gastos. Não conectar domínio nem gerar URL pública. Não convidar usuários.
2. Criar serviço MySQL com versão **8.0 explicitamente selecionada e fixada**, não `latest`. Confirmar `SELECT VERSION()` e compatibilidade com cliente 8.0.46. Não presumir que o template atual usa 8.0. Vincular volume próprio ao datadir da imagem escolhida, manter rede privada e não habilitar TCP proxy público.
3. Criar banco vazio `avelu_staging` com utf8mb4. Criar credenciais separadas de administrador de infraestrutura, inicializador, aplicação e backup. As credenciais do serviço MySQL nunca devem ser exportadas ao Git ou logs.
4. Preparar conta de inicialização restrita a `avelu_staging` com CREATE, REFERENCES, SELECT, INSERT e UPDATE. Aplicação: SELECT/INSERT/UPDATE/DELETE nas tabelas de negócio, somente SELECT em `avelu_environment` e `avelu_migrations`, sem DDL/GRANT. Aplicar concessões depois da criação das tabelas. Backup: SELECT, SHOW VIEW, TRIGGER, EVENT nesse banco e SHOW_ROUTINE conforme necessidade do mysqldump. Revisar privilégios efetivos.
5. Criar serviço Node a partir da branch revisada (ainda não criada/enviada), raiz do repositório, Dockerfile existente. Desabilitar autodeploy até revisão; configurar variáveis antes de liberar qualquer execução. A criação/conexão do repositório pode iniciar deploy: só fazer após autorização.
6. Inicialmente sem domínio, sem convites, uma réplica, sem suspensão automática (há rotinas em background). Reservar recursos conforme medição; sugestão inicial de limites: Node 512 MB–1 GB, MySQL 1 GB, ajustáveis após ensaio.
7. Acessar pela rede privada ou sessão operacional autenticada da plataforma para preparação e smoke tests. `railway run` no computador local não o coloca automaticamente na rede privada; não abrir o banco à Internet para contornar DNS interno.

## 5. Banco vazio e administrador — somente após autorização

Executar em sessão operacional dentro da rede privada, com variáveis explícitas e credenciais temporárias, nunca como comando de startup. Conferir ambiente, hostname, nome do banco, versão e ausência de tabelas antes de iniciar. Não executar sobre banco existente.

```sh
node scripts/initialize-empty.js --plan
node scripts/initialize-empty.js --confirm-empty=avelu_staging
# Opcional: somente banco recém-criado, com FIXTURE_PASSWORD temporária:
node scripts/seed-fixtures.js --confirm-fixtures=avelu_staging
node scripts/migrate-invitations.js --confirm-database=avelu_staging
node scripts/bootstrap-admin.js --confirm-database=avelu_staging
```

Ordem: 001-core, 002-modules, carga fictícia opcional, 003-invitations, bootstrap. A carga atual exige exatamente a baseline e deve preceder 003; não inverter essa ordem. Aplicar grants de runtime antes de usar fixtures/bootstrap com a conta runtime, e incluir a tabela convites após 003. Inicializador usa `DB_INIT_*`; runtime permanece `DB_USER`/`DB_PASSWORD`.

A inicialização recusa banco não vazio e grava versões/checksums. Migração 003 é idempotente. Em falha parcial, parar e investigar: não apagar/recriar estruturas automaticamente. Nenhum dump local, seed legado, usuário ou sessão real deve ser importado.

Bootstrap: e-mail administrativo controlado para teste e senha única de 16–128 caracteres, guardada em gerenciador de senhas. Injetar via sessão/segredo temporário, não na linha de comando, URL, terminal gravado ou arquivo versionado. O procedimento recusa segundo administrador. Remover `BOOTSTRAP_ADMIN_*`, `FIXTURE_PASSWORD` e credenciais de inicialização depois. Revogar acesso temporário de manutenção. Não há endpoint HTTP de bootstrap.

## 6. Volume e temporários

Volume MySQL separado do volume de backups da aplicação. Proposta: volume da aplicação montado em `/data`, `BACKUP_DIR=/data/backups`. Não montar sobre `/app`.

**Montagem pode sobrescrever permissões criadas no Dockerfile.** Antes de ativar backup, preparar somente o diretório do volume dedicado com UID/GID de node verificado via `id` na imagem (normalmente 1000:1000), modo 0700. Fazer isso por operação de manutenção autorizada de escopo restrito; não executar a aplicação permanentemente como root nem aplicar chmod 777. Caso a plataforma não permita preparar a propriedade com segurança, deixar backups desabilitados e considerar a validação incompleta.

Temporários de credenciais/dump usam `/tmp` efêmero e são removidos pelas rotinas existentes. Não precisam sobreviver ao deploy. Backup criptografado precisa persistir e ser restaurado em banco descartável. Preservar BACKUP_KEY fora do volume; não rotacionar sem estratégia para backups antigos. Sem cópia externa confirmada a rotina não faz expurgo por retenção: monitorar crescimento. Não enviar backups externamente neste ensaio.

Referência: [permissões e volumes Railway](https://docs.railway.com/volumes/reference).

## 7. Validação Linux e critérios para domínio público

Seguir também `FASE-D.md`. Capturar build, digest e `node --version`, `mysql --version`, `mysqldump --version`, `id`. Confirmar linux/amd64, execução sem root, npm ci e assinatura de pacotes sem bypass.

Em runner Linux isolado com servidor MySQL descartável, repetir os 92 testes isolados e o executor `--phase-d`. O servidor mysqld não está na imagem de aplicação: não instalar servidor dentro dela nem executar testes de escrita contra `avelu_staging`. O ensaio completo exige ambiente descartável separado e verificação de datadir. Depois testar smoke/backup dentro da imagem real com dados fictícios.

Antes de domínio público:

- [ ] Build e smoke aprovados; nenhuma chave, `.env`, dump, SQL legado ou informação clínica na imagem/camadas.
- [ ] Health startup/live/ready; conexão privada e conta restrita; schema e identidade corretos.
- [ ] Escrita/leitura do volume como node, backup e restauração Linux em destino descartável.
- [ ] SIGTERM real com drenagem, interrupção, rollback e reprocessamento; falha temporária do MySQL.
- [ ] HTTPS/proxy/CSRF/cookies/limitação de tentativas validados em acesso técnico restrito.
- [ ] Somente catálogo e contas fictícias; convite obrigatório; nenhum segredo de bootstrap persistente.
- [ ] Checklist visual da Fase D concluído: todos os módulos, responsividade, CSP, PWA, logout e histórico.
- [ ] Autorização específica para publicação técnica e, separadamente, para liberar convidados.

Convite restringe cadastro, não protege a página pública. A barreira desta etapa é **ausência de domínio/TCP proxy público**. A eventual validação visual externa exige acesso restrito e nova autorização; não assumir que URL difícil de adivinhar é controle de acesso.

## 8. Git e sugestão de commits

Branch verificada: `main`. Há alterações rastreadas e arquivos novos acumulados de C.1–D, além desta fase. `git status --short` foi inspecionado; não executar `git add .` indiscriminadamente. `.env` está ignorado e não rastreado. Busca por padrões de chaves privadas, tokens GitHub, AWS e Resend não encontrou ocorrências; busca adicional por senha literal fora dos testes apontou montagem de configuração em `mysql-command.js`, sem credencial fixa. Isso não é auditoria completa de segredos nem do histórico remoto. Não houve autenticação/acesso ao GitHub remoto.

Há SQL legado já rastreado (`database/dados-iniciais.sql`, entre outros). Foi excluído da imagem, mas continua no repositório; revisar conteúdo pessoal e todo o histórico antes de compartilhar o repositório. Não removido ou reescrito nesta etapa.

Sugestão, somente após autorização: branch `chore/railway-linux-validation`. Commits por conjunto revisado: (1) configuração/isolamento C.1–C.2; (2) homologação/convites C.3; (3) operação/segurança C.4; (4) validação D; (5) empacotamento Railway E.1. Como há arquivos com alterações de várias fases, revisar hunks e dependências; alternativa segura é snapshot único C.1–E.1 revisado, sem inventar divisões inexequíveis. Não realizar merge em main antes do aceite Linux.

## 9. Rollback

Guardar commit e digest da imagem aprovada, versões/checksums de migração e configuração anterior sem expor segredos. Em falha, suspender exposição e rotinas, retornar à imagem anterior compatível e verificar readiness. Reverter código não reverte banco/volume. Não executar down migrations destrutivas nem sobrescrever banco. Se necessário, restaurar cópia verificada em **novo banco**, validar e trocar conexão após aprovação. Na primeira implantação ainda não existe versão anterior: parar o serviço e preservar banco/volume/logs para análise. Manter a chave de backup disponível fora da infraestrutura.

## 10. Recursos e custos futuros

Necessários: serviço Node, serviço MySQL, volume MySQL e volume de backups; posteriormente e-mail com remetente validado e armazenamento externo independente. Domínio próprio é opcional para teste e não foi contratado.

Na tabela consultada em 20/10/2026: Hobby tem mínimo de US$ 5/mês com US$ 5 de uso incluído; Pro US$ 20/mês com US$ 20 incluídos. Consumo excedente, CPU/RAM, volumes e tráfego compõem a cobrança. **US$ 5 não é orçamento garantido para Node + MySQL.** Selecionar plano conforme uso profissional/equipe, medir consumo, configurar alertas e revisar limites. Domínio, e-mail e armazenamento externo podem gerar custos adicionais. Nenhuma contratação realizada. [Preços oficiais](https://railway.com/pricing).

## 11. Pendências e conclusão

Preparação concluída; build Linux, compatibilidade real de clientes, permissões do volume, proxy Railway, testes visuais e validação operacional continuam pendentes. Não se declara a imagem validada. Nenhum banco existente foi alterado e nenhum deploy, serviço externo, instalação local, commit, push ou merge foi realizado. Aguardar autorização antes de qualquer publicação/criação de recursos.
