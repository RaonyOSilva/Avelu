# AVELU — Fase pública 01: auditoria para Windows Server + IIS

Data: 17/11/2026. Referência: commit `71e8abd`; árvore de trabalho limpa no início da inspeção. **Parecer: arquitetura viável, lançamento público bloqueado.** Este documento é diagnóstico e proposta; não autoriza implementação ou publicação.

## 1. Resumo executivo

O AVELU é um monólito Node.js/Express com MySQL, frontend HTML/CSS/JavaScript sem etapa de compilação e PWA. IIS pode terminar HTTPS e encaminhar as requisições para um serviço Node independente. Não é necessário converter o backend para .NET nem executar Node dentro do IIS.

Há trabalho aproveitável: allowlist de arquivos públicos, sessões persistidas com hash de token, scrypt, proteção de origem nas escritas, Helmet/CSP, autorização por papel e escopo, transações de agendamento, identificação de ambiente do banco, backups criptografados e health checks. Isso não comprova segurança completa ou prontidão operacional.

Principais impedimentos comprovados:

1. A configuração hospedada recusa bind em loopback e MySQL local; as regras foram orientadas a Railway/rede TLS externa (`config.js:loadConfig`, `database-config.js:databaseConfig`).
2. Cadastro público cria pacientes e sessão imediatamente, sem confirmação de e-mail (`auth.js:mountAuth`). Não há fluxo público de candidatura/verificação de profissionais ou clínicas.
3. Módulos de prontuário, receita, pacientes e vinculação estão montados incondicionalmente. Faltam flags de backend para manter o Grupo C indisponível (`server.js`, `appointments.js`, `consultations.js`, `team.js`, `operations.js`).
4. O telefone da conta do profissional é retornado anonimamente, apesar de existirem campos de contato público separados (`profiles.js:mountProfiles`).
5. Serviço Windows, parada pelo SCM, proxy HTTPS, ACLs, restauração operacional e recuperação de desastre não estão preparados/comprovados no ambiente alvo.
6. O inicializador seguro existe, mas bootstrap administrativo e migração de convites recusam produção. Os scripts antigos continuam disponíveis e alguns carregam dados iniciais automaticamente.

MVP recomendado: apresentação, busca e perfis de catálogo previamente aprovados; captação mínima de interesse de profissionais/clínicas; conta de paciente apenas após verificação de e-mail e fluxo de privacidade. Agendamento e comunicação ficam para validação posterior; funcionalidades clínicas permanecem desativadas no servidor.

## 2. Método, evidências e limites

Inspeção estática dos módulos de servidor, configuração, banco/migrations, scripts operacionais, frontend representativo, testes e relatórios C.1–E.1. Consultas de leitura ao Git e versões locais; pesquisa em documentação oficial para infraestrutura, suporte e privacidade. Não foram iniciados servidores, abertas conexões MySQL, executados testes, migrations, backups, restaurações ou scripts de setup. Não houve instalação, deploy, alteração de credenciais, Railway, commit ou push. Única escrita: este relatório solicitado.

O pedido proíbe alterar código-fonte/banco, mas solicita expressamente este Markdown; sua criação é tratada como entregável autorizado. Não foi encontrado AGENTS.md pela busca no projeto. Não foram lidos valores do `.env` nem dumps/backups.

**NÃO VERIFICADO:** estado de serviços em execução, versão do MySQL realmente conectado, conteúdo/dados do banco, permissões efetivas, infraestrutura de destino, domínio/IP, certificados, e-mail entregue, contratos, auditoria completa de segredos de todo o histórico, vulnerabilidades de dependências por base de advisories e funcionamento em navegador/IIS reais. Ausência de achado estático não equivale a ausência de vulnerabilidade.

`docs/deploy/FASE-D.md` registra 162 aprovações em 20/10/2026, em isolamento Windows. São evidências históricas, não testes repetidos nesta fase e não aceite de lançamento. E.1 atualiza o empacotamento Docker; a observação da Fase D sobre ausência de cliente MySQL na imagem está superada no código, porém o build Linux continua sem comprovação nesta auditoria.

## 3. Inventário da arquitetura

### 3.1 Estrutura do repositório

Inventário lógico completo das áreas, com aproximadamente 191 arquivos visíveis à busca fora de dependências/backups:

| Área | Conteúdo e responsabilidade |
| --- | --- |
| Raiz: apresentação | `index.html`, `sobre.html`, `buscar.*`, `perfil.*`, `agendar*`, estilos e scripts; frontend servido pelo Express |
| Raiz: conta | `cadastro.html`, `entrar.html`, `conta.js`, `recuperar.*`, `senha.*`, `session-exit.js`, `privacy-guard.js` |
| Raiz: áreas restritas | `admin*`, `agenda-admin*`, `equipe*`, `atendimento*`, `profissional*`, `consulta*`, `programacao*`, `operacao.html`, `operations-ui.js`, `convites*`, `workspace*` |
| Raiz: API | `server.js`, `auth.js`, `account.js`, `appointments.js`, `admin.js`, `profiles.js`, `discovery.js`, `specialties.js`, `team*.js`, `operations.js`, `consultations.js`, `clinical-templates.js` |
| Configuração/DB | `config.js`, `database-config.js`, `database-pool.js`, `db.js`, `homologation-config.js`, `config/environments/*.env.example`, `.env.example`, `.nvmrc` |
| Operação | `server-lifecycle.js`, `operational-*`, `runtime-health.js`, `background-task.js`, `backup-*`, `mysql-command.js`, `schedule-*` |
| `database/` | Baseline 001/002, migração 003, inicializador, fixtures, schema/SQL legados, catálogo de especialidades |
| `scripts/` | Setup legado, inicialização vazia, fixtures, bootstrap/grant de administrador, convites, backup/restore, executor de testes/validação isolada, sincronização de pacientes |
| `tests/` | Suítes de acesso, autenticação, UI, banco, HTTPS, convites, operação e agendas; fixtures de processo/e-mail |
| `assets/` | Imagens e ícones públicos; todo o diretório é servido estaticamente |
| `docs/deploy/`, `README.md` | Histórico C.1–C.4, D, E.1 e instruções existentes |
| Empacotamento | `package.json`, lockfile, Dockerfile Debian, `.dockerignore`, `railway.toml`, `.gitignore` |
| Dados locais | `.env`, `.backups/`, `node_modules/`, `.git/`; privados, não são artefatos de publicação |

### 3.2 Versões efetivamente observadas

| Componente | Declaração | Evidência local |
| --- | --- | --- |
| Node | `engines`, `.nvmrc`, Dockerfile: 22.23.3 | `node --version`: **22.17.0**; divergência confirmada |
| Express | `^5.1.0` | Lockfile e pacote instalado: **5.2.1** |
| mysql2 | `^3.14.0` | Lockfile e pacote instalado: **3.24.3** |
| Helmet | `^8.1.0` | Lockfile e pacote instalado: **8.3.0** |
| dotenv | `^16.4.7` | Lockfile e pacote instalado: **16.6.1** |
| MySQL servidor | Inicializador exige MySQL 8, mínimo 8.0.16 | Binário local `mysqld.exe --version`: **8.0.42 Win64**; servidor conectado **NÃO VERIFICADO** |
| Cliente no Dockerfile | Oracle 8.0.46, pacote Debian fixado | Apenas declaração; imagem não executada nesta fase |
| Windows Server/IIS | Não definidos no projeto | Edição, build, suporte e módulos instalados **NÃO VERIFICADO** |

Há quatro dependências diretas. `mysql2` é o cliente usado pelo backend; não confundir sua versão com a versão do servidor. Backup depende adicionalmente de executáveis Oracle `mysql`/`mysqldump`. Não se identificou dependência direta que obrigue Linux no backend. O Dockerfile usa apt, caminhos POSIX e usuário Linux: é uma opção Linux, não um instalador Windows.

Definir versão LTS e patch de Node aprovados, reproduzir com lockfile em ambiente isolado e planejar manutenção. O Node recomenda linhas Active/Maintenance LTS para produção: [política oficial](https://nodejs.org/en/about/previous-releases). Disponibilidade e adequação exatas da versão fixada ao servidor alvo precisam de validação; não assumir que o número no Dockerfile comprove execução.

### 3.3 Inicialização, encerramento e ambiente

`npm start` executa `node server.js`; `dev` usa `--watch`. Não há build frontend. `dotenv` é carregado pelo servidor fora de testes; o diretório de trabalho do serviço precisa ser explícito. `loadConfig` valida ambiente, porta, origem HTTPS, proxy e identidade de banco. Porta padrão 3000; JSON limitado a 100 KiB; deadline de parada padrão 20 s.

O servidor monta logs/Helmet/health, controles de acesso/origem, arquivos públicos, autenticação e todos os módulos. `app.listen` inicia HTTP; backup e worker são iniciados no mesmo processo. Exceções/rejeições não tratadas encerram o processo; erros HTTP são devolvidos genericamente. Readiness testa banco, mas startup/liveness não comprovam schema de negócio completo.

`server-lifecycle.js:installShutdown` trata SIGINT/SIGTERM, fecha listener/conexões ociosas, aguarda tarefas e pool e aplica deadline. Isso é boa base, mas **não comprova integração com parada de serviço Windows**. Processo crashado sai imediatamente; recuperação depende do supervisor externo.

### 3.4 Integrações e tarefas

| Recurso | Situação |
| --- | --- |
| Resend | `account.js` e `invitation-service.js`; envio de recuperação/convite, timeout de rede; remetente/chave e entrega real NÃO VERIFICADO |
| Google Fonts | Carregamento externo nas páginas e permitido pela CSP; exige avaliação de privacidade e disponibilidade |
| Maps/WhatsApp | Links externos em `perfil.js`, `whatsapp-confirmation.js`; não há comprovação de integração WhatsApp Business nem confirmação automática de entrega |
| Backup externo | PUT HTTPS opcional, exige recibo SHA-256; endpoint, contrato e retenção externa NÃO VERIFICADO |
| Worker de agendas | `schedule-service.js:startWorker`: intervalo de 15 min, lock MySQL, validação de permissão, transações e reprocessamento |
| Backup automático | `backup-service.js:start`: checagem horária e cópia quando idade supera 24 h ou após falha; não é cron de horário fixo |
| WebSocket/SSE | Nenhuma implementação identificada nos módulos inspecionados; transporte de notificações persistentes não comprovado |
| Upload | Nenhum endpoint multipart/upload identificado; avatar é URL e assets são arquivos estáticos |

## 4. Compatibilidade com Windows Server e IIS

### 4.1 Arquitetura recomendada

`Internet → TCP 443/TLS → IIS + URL Rewrite/ARR → HTTP loopback Node/Express → MySQL local ou rede privada protegida`.

ARR/URL Rewrite é uma abordagem documentada pela Microsoft: [proxy reverso com IIS](https://learn.microsoft.com/en-us/iis/extensions/url-rewrite-module/reverse-proxy-with-url-rewrite-v2-and-application-request-routing). A Microsoft também documenta Node nativo no Windows para Windows Server: [Node no Windows](https://learn.microsoft.com/en-us/windows/dev-environment/javascript/nodejs-on-windows). Compatibilidade da combinação exata de OS/módulos/runtime no servidor pretendido permanece **NÃO VERIFICADO**.

Manter o Express responsável pelas páginas e estáticos inicialmente: o código injeta proteção de privacidade no HTML, restringe páginas por papel, aplica headers e altera o worker em homologação. Apontar a raiz pública do IIS para o repositório exporia arquivos internos e contornaria esses controles. Usar diretório IIS separado, contendo somente futura configuração de proxy. Não adotar iisnode como requisito.

### 4.2 Adaptações necessárias

| Tema | Diagnóstico e procedimento proposto |
| --- | --- |
| Bind Node | `config.js` aceita em hosted apenas `0.0.0.0`/`::`; adaptar política para loopback validado. Até lá, firewall é controle compensatório, não motivo para abrir 3000 publicamente |
| MySQL no mesmo host | `DB_NETWORK=local` é recusado em hosted; `tls` exige hostname DNS não local e `railway-private` exige ambiente Railway. Criar política explícita e validada para Windows/local; não falsificar variáveis Railway |
| Proxy | Encaminhar caminho e query integralmente, preservar Host aprovado e definir/sanitizar protocolo/IP encaminhados. Rejeitar Host desconhecido e impedir acesso direto ao backend |
| `trust proxy` | O validador aceita IPs/CIDRs, não `true`/número. Confiar somente no endereço real do proxy; loopback exato se confirmado. Não confiar em redes amplas nem aceitar cabeçalho do cliente como IP original |
| Origem/cookies | `APP_ORIGIN` precisa ser origem HTTPS exata; validar `req.protocol`, IP, redirects e Origin. Cookie Secure depende de `NODE_ENV=production`; testar navegador real através do IIS |
| TLS | Binding HTTPS no IIS, cadeia válida, DNS, renovação automatizada com alerta/ensaio, redirect HTTP e revisão de protocolos/ciphers do Windows. HSTS já é emitido por Helmet em hosted |
| Serviço | Selecionar wrapper mantido, por exemplo WinSW, com versão/origem/licença revisadas; executável Node e cwd absolutos, conta dedicada sem administrador, início automático, dependências e política de recuperação. [Projeto WinSW](https://github.com/winsw/winsw) |
| Parada | Integrar stop do wrapper ao shutdown real; provar drenagem em stop/restart/reboot e rollback de transação. Aguardar prazo coerente com tarefas; evitar que o SCM mate o processo antes da drenagem |
| Limites | Harmonizar IIS request filtering, ARR, headers, URL/query, conexão e timeouts com Express. JSON hoje 100 KiB; excesso tende a virar 500 no handler genérico, em vez de 413; corrigir em fase posterior |
| Conexões persistentes | Não habilitar WebSocket/SSE por suposição. Se adicionados, validar upgrade, buffering, idle timeout e reconexão no ARR |
| Arquivos | Logs, backups e futuros uploads fora dos diretórios de releases e fora da raiz pública; ACLs NTFS explícitas. `mode:0600/0700` e chmod nos scripts não substituem ACL Windows |
| Logs | Capturar stdout/stderr com rotação e retenção; logs IIS/HTTPERR e Event Viewer; restringir leitura. Redigir query string de convites/tokens/dados pessoais no proxy e em ferramentas externas |
| Monitoramento | Monitor externo verifica HTTPS e `/health/ready`; alertas de certificado, espaço, serviço, latência, pool, idade de backup e cópia externa. `/health/startup` sozinho é insuficiente |
| PWA | Servir na raiz inicialmente: caminhos absolutos existentes dificultam subdiretório. MIME correto de manifest/worker; não cachear API/HTML no IIS; testar atualização, offline, logout e rollback de assets |

### 4.3 Publicação e rollback propostos

Preparar release imutável em pasta versionada, manifesto de versões/checksums e dependências reproduzidas em ambiente autorizado. Separar configuração/segredos/dados das releases. Em janela de mudança, verificar backup externo restaurável, parar com drenagem, apontar serviço para nova release, iniciar e verificar readiness, login e flags. Migrações ficam em etapa separada e revisada, com conta própria e plano de compatibilidade.

Rollback de código troca a release e reinicia o serviço; não apaga banco, uploads ou backups. Exige schema compatível com versão anterior e validação de PWA/assets. Em alteração irreversível, restaurar em novo banco e validar antes de trocar conexão; não sobrescrever a única base. Atualmente só há ferramenta de ensaio de restauração, não runbook de recuperação de produção.

## 5. Segurança para lançamento público

Criticidade considera impacto e exposição prevista; itens condicionais são distinguidos de exploração comprovada. Nenhum exploit remoto foi executado.

| ID / nível | Evidência | Consequência e ação necessária |
| --- | --- | --- |
| S01 — **Crítico se publicado sem bloqueio** | `server.js` monta `consultations`, `clinical-templates`, `team`; `appointments.js:/record`; `operations.js` | Dados clínicos continuam acessíveis a papéis autorizados mesmo se menus forem ocultos. Não é bypass de autenticação comprovado. Desativar todo Grupo C em backend e workers antes de exposição |
| S02 — **Alto** | `profiles.js`, SELECT profissional inclui `u.telefone` | Telefone cadastral sai em API pública; separar DTO público de dados de conta e decidir publicação por campo |
| S03 — **Alto** | `auth.js:register`, schema `usuarios` | Conta ativa e sessão sem verificação de titularidade do e-mail; risco de cadastro em nome alheio/abuso. Implementar estado pendente, token hash, expiração, uso único, reenvio limitado e ativação condicionada |
| S04 — **Alto** | `config.js`, `database-config.js` | Modelo atual não atende isolamento de rede local Windows; evitar contornar validações/desativar TLS para fazê-lo funcionar |
| S05 — **Alto operacional** | `mysql-command.js:credentials`, `backup-crypto.js`, `restore-backup.js` | Credenciais temporárias e SQL de restore em disco; permissões POSIX não comprovam proteção NTFS. Conta/ACL dedicada, proteção do volume e descarte seguro conforme política |
| S06 — **Alto operacional** | `scripts/setup-database.js` | Carrega `.env`, abre conexão diretamente, permite múltiplos statements e executa SQL + dados iniciais sem barreiras do inicializador novo. Proibir uso em produção no processo de release e separar ferramentas legadas |
| S07 — **Alto, requer validação específica** | `operations.js:/api/team/patients/:id/link` | O paciente inicial é verificado por escopo, mas a atualização/mesclagem usa todos os agendamentos daquele cadastro. Provar autorização de efeitos em outras unidades e do destino antes de liberar vínculo; não declarar IDOR explorado sem teste |
| S08 — **Alto** | `admin.js:saveProfessional`, schema perfis/locais | Publicação por booleano `ativo`, registro opcional e sem trilha de identidade/conselho/aprovação. Não equivale a verificação profissional; criar revisão e republicação após alterações sensíveis |
| S09 — **Médio** | `auth.js:authLimit` | Limite por IP/e-mail em memória, 40/15 por 15 min e teto de mapa; reinício zera contagem e múltiplas instâncias fragmentam limites. Falta controle geral para busca/recursos caros; camada de borda e limites persistentes conforme carga |
| S10 — **Médio** | `auth.js:register` retorna 409 distinto; `account.js:forgot` usa resposta genérica | Registro permite enumeração de e-mail; recuperação tem diferença temporal por envio. Mitigar enumeração e abuso sem sacrificar recuperação |
| S11 — **Médio** | `team-access.js` cria/define senha sem atribuir `trocar_senha=1` | Administrador conhece senha inicial e não há troca obrigatória explícita nessa criação. Usar ativação individual ou exigir mudança e revogar sessões conforme política |
| S12 — **Médio** | `auth.js` e `account.js` | Senhas 8–128 e scrypt são base razoável; não há MFA administrativo nem avaliação de senhas comprometidas. Definir política e proteção reforçada para administradores |
| S13 — **Médio** | `auth.js:currentUser`, `server.js` | Sessões expiram em 7 dias; sem timeout ocioso ou gestão de dispositivos demonstrada. Rotas de conta/senha ficam em ordem particular dos middlewares; revisar matriz de troca obrigatória, inclusive templates |
| S14 — **Médio** | Schema e `operations.js:/audit` | Há eventos de escrita, mas leitura clínica/exportação/publicação não possuem trilha completa demonstrada; FKs CASCADE podem apagar eventos. Separar auditoria íntegra de log operacional |
| S15 — **Médio** | `server.js` serve `/assets` inteiro; CSP permite imagens HTTPS | Revisar conteúdo público, metadados e URLs externas; imagens externas podem transmitir IP. Sem evidência de upload atual, antivírus/quarentena são requisito futuro, não controle existente |
| S16 — **Baixo** | handler de erro `server.js` | Falhas de tamanho/validação podem ser reportadas como 500 e contam como erro operacional. Diferenciar 4xx esperados e manter observabilidade sem PII |

### 5.1 Controles presentes e limites

- **Autorização/IDOR:** `access-policy.js` restringe papéis; `auth.js:requireAdmin/requireUser`; `team-permissions.js:scope` limita profissional/local; agendamentos filtram `paciente_id`; consultas filtram `p.usuario_id`; templates filtram `usuario_id`. São evidências positivas, não auditoria dinâmica completa de todos os objetos. Testar leitura/escrita com IDs alheios e escopos revogados.
- **SQL injection:** `pool.execute` com placeholders é predominante. Fragmentos dinâmicos inspecionados derivam de escopos/allowlists internas, como tabela/coluna em `team-access.js`. Não foi confirmado SQL injection; scripts legados têm privilégios e superfície diferentes da API.
- **XSS:** `perfil.js` usa textContent/createElement e valida links HTTP/HTTPS; Helmet bloqueia scripts inline, objetos e frames externos. Revisar todos os sinks, impressão e URLs/avatares em fase de testes; não há comprovação de ausência global de XSS.
- **CSRF/CORS:** escritas em `/api` exigem Origin igual a `APP_ORIGIN`; SameSite=Lax complementa a barreira. Não se identificou liberação CORS genérica. Validar proxy/Host, Origin ausente/forjado e métodos/rotas alternativas. Não relaxar a origem para corrigir implantação.
- **Sessões:** token aleatório de 32 bytes, hash SHA-256 no MySQL, HttpOnly/Secure em produção, Path=/, SameSite=Lax; rotação na autenticação, invalidação no logout e ao trocar/redefinir senha. Conta ativa é conferida em cada acesso autenticado.
- **Recuperação:** token hash, 15 min, link em fragmento, consumo transacional e invalidação de sessões (`account.js`). Falha de envio remove token; entrega real, reputação e DNS do remetente não foram verificados.
- **Logs:** `operational-log.js` usa allowlist de escalares sem URL/body/erro bruto. Isso reduz PII no log da aplicação; não cobre IIS, SMTP/provedor, APM, Windows ou dumps.
- **Segredos/fallbacks:** `.env` e `.backups` não aparecem como arquivos rastreados na consulta realizada; `.gitignore` cobre chaves/dumps/backups. Defaults root/senha vazia existem no desenvolvimento e no setup legado; hosted recusa root e exige credenciais. Marcadores de contas sem login não são senhas válidas de scrypt. Nenhuma credencial administrativa padrão autenticável foi confirmada; auditoria integral de valores/histórico **NÃO VERIFICADO**. Nenhum segredo é reproduzido aqui.

### 5.2 Superfície anônima prevista no código

Páginas públicas/arquivos da allowlist, assets, manifest e worker; `/api/environment`, health checks, `/api/auth/register|login|forgot|reset|logout|me`, `/api/specialties`, `/api/cities`, `/api/places`, `/api/places/:id`, `/api/professionals`, `/api/professionals/:id/availability`, `/api/profiles/:type/:id`, `/api/discovery`. Algumas rotas mudam com homologação. `me` devolve sessão própria ou null, não um cadastro geral. Health público devolve status genérico. Confirmar inventário via matriz de rotas em futura validação, inclusive montagens internas de `team.js`.

APIs administrativas não devem ser anônimas e têm barreiras no servidor. Ocultar página ou botão não basta. Captura de interesse também precisa limites/validação e minimização de dados.

## 6. Banco de dados

### 6.1 Estrutura e integridade

Baseline: oito tabelas em `001-core.sql` e dezenove em `002-modules.sql`. Metadados adicionais: `avelu_migrations`, `avelu_environment`; 003 adiciona `convites` separadamente.

| Domínio | Tabelas |
| --- | --- |
| Contas | usuarios, sessoes, recuperacoes_senha |
| Catálogo | especialidades, categorias_especialidades, areas_especialidades |
| Diretório | perfis_profissionais, locais_atendimento, profissionais_locais, profissionais_especialidades, locais_especialidades, profissionais_areas, locais_areas |
| Agenda | disponibilidades, agendamentos, agenda_eventos, lista_espera, programacoes_agenda, programacao_horarios |
| Acesso/admin | gestao_acessos, administracao_eventos |
| Clínico | registros_atendimentos, modelos_clinicos |
| Pacientes/comunicação | pacientes_recepcao, pacientes_unidades, vinculos_paciente, comunicacoes |
| Convites | convites, somente após 003 |

InnoDB/utf8mb4, FKs, unique de e-mail/perfil, CHECK de período e escopo, coluna gerada única para reserva ativa. Transações e `FOR UPDATE` nas reservas, remarcação, registros clínicos e administração reduzem condições de corrida. `agendamentos.cadastro_paciente_id` não tem FK na baseline inspecionada; `administracao_eventos` usa IDs sem FKs. Revisar órfãos, ações de exclusão e retenção; não adicionar cascatas indiscriminadamente.

### 6.2 Versionamento e produção limpa

`database/initialize.js`: plano com checksum, apenas CREATE TABLE, lock nomeado, servidor MySQL 8 >=8.0.16, schema vazio e identidade do banco. DDL MySQL não torna a sequência toda atômica: execução parcial é recusada ao repetir, exigindo investigação e novo destino vazio. Não aplicar baseline sobre base existente.

`database/migrate-invitations.js` checa baseline/identidade/checksum, mas só permite staging/test. `scripts/bootstrap-admin.js` também só permite staging/test e cria administrador rotulado fictício. `homologation-config.js` proíbe `INVITE_ONLY=true` em produção; `invitation-routes.js` só habilita convites quando essa flag está ativa. Portanto preservar convites como opção de produção requer desacoplar as regras; não basta trocar variável.

Procedimento futuro seguro:

1. Criar instância/schema/contas de produção independentes; nunca importar dump de desenvolvimento nem copiar `.env`.
2. Validar rede/TLS e nomes `avelu_production...`, usuário correspondente `_app`, APP_ENV e identidade.
3. Revisar plano e executar inicialização vazia com credencial DDL separada, confirmação explícita e artefato aprovado.
4. Introduzir procedimento de primeiro administrador de produção com verificação de titularidade, senha/ativação individual e auditoria; não usar cadastro público não verificado + grant por conveniência.
5. Importar somente catálogo estático revisado, separado de pessoas/locais/agendas fictícias. A baseline vazia não carrega catálogo automaticamente.
6. Provisionar dados reais apenas em fase autorizada e com fluxos/políticas aprovados; executar smoke e validar ausência de fixtures.

`database/fixtures.js` barra produção e exige destino/confirmacão e banco sem dados de negócio. Essa proteção não cobre `scripts/setup-database.js`, que lê `dados-iniciais.sql`, nem todos os setups antigos. Excluir tais comandos do runbook de produção sem remover código nesta fase.

### 6.3 Pool, desempenho e timezone

`database-pool.js` adquire/libera conexão, limita aquisição, ajusta timezone e confere identidade por conexão. Padrões: pool 10, fila 100, aquisição/conexão 10 s, keepalive, multipleStatements=false. Não há limite global de execução SQL de negócio demonstrado; requests lentos podem ocupar pool. Backup e worker também disputam conexões.

Índices relevantes: e-mail único, perfis por usuário, disponibilidade status/início e profissional/início, agendamentos paciente/status e profissional/status, vínculos e junções. Busca usa LIKE com `%termo%`, TRIM, EXISTS e agregações: índices convencionais não garantem eficiência. Paginação limitada/ausente em partes da API; lista do paciente não tem LIMIT. Exigir EXPLAIN, volume representativo, concorrência, latência e orçamento de conexões antes do Grupo B. Não foram obtidos planos reais.

Timezone da sessão e do driver: `-03:00`; frontend/agenda usam America/Sao_Paulo e alguns retornos incluem offset fixo. DATETIME e TIMESTAMP coexistem. Alinhar relógios/NTP e testar fronteiras de dia, restore/dump e mudanças de fuso; offset fixo não atende automaticamente expansão nacional ou mudanças legais futuras. Não inferir timezone do Windows apenas pela sessão SQL.

MySQL 8.0.42 é o binário local; a baseline admite outras versões 8. Avaliar MySQL 8.4 com sistema/cliente suportados, SQL mode, autenticação e regressão, sem assumir compatibilidade pelo prefixo. A instalação Windows requer pré-requisitos próprios: [manual Oracle](https://dev.mysql.com/doc/refman/8.4/en/windows-installation.html), [plataformas suportadas](https://www.mysql.com/support/supportedplatforms/database.html).

### 6.4 Backup, restore e privilégios

`backup-service.js` executa mysqldump com single-transaction, routines/triggers/events, quick e sem tablespaces; cifra AES-256-GCM, verifica autenticação, escreve status e pode enviar cópia HTTPS com recibo SHA-256. Lock de banco e controle local reduzem concorrência. Retenção local só roda depois de cópia externa bem-sucedida e preserva cópia recente; sem destino externo, espaço pode crescer indefinidamente. Falta backup pode não impedir startup: se chave/diretório ausentes, rotina não inicia.

`backup:verify` verifica criptografia, não restauração funcional. `scripts/restore-backup.js` autentica dump antes de SQL e só aceita banco descartável vazio com datadir/privilégios conferidos. Não suporta restauração de produção. Precisam ser definidos RPO/RTO, frequência, cópia externa imutável, retenção externa, custódia/rotação da chave, teste periódico de recuperação e recuperação em outro equipamento. Backups de MySQL não cobrem automaticamente segredos, ACLs, IIS, logs e futuros uploads.

Conta runtime deve ter DML apenas nas tabelas necessárias; não conceder DDL, FILE, GRANT ou privilégios globais. Separar conta init/migration e backup; conferir permissões reais exigidas pelo dump conforme opções/versão, não conceder administrador para resolver erro. Metadados de ambiente/migration devem ser só leitura pela aplicação. Grants reais **NÃO VERIFICADO**. [Opções oficiais do mysqldump](https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html).

## 7. Cadastro público e estado funcional

| Jornada | Estado evidenciado | Trabalho necessário |
| --- | --- | --- |
| Paciente: cadastro/login | Implementado, papel fixo paciente no cadastro aberto | Verificação de e-mail, antiautomação, política de privacidade, testes de abuso |
| Recuperação/senha | Implementado via Resend e revogação de sessões | Validar entrega, domínio, experiência e operação |
| Perfil de conta | Nome/telefone em `account.js` | Revisar minimização, mudança de e-mail e direitos do titular |
| Desativação/exclusão própria | Não identificada; só admin desativa terceiros em `operations.js` | Solicitação autenticada, retenção/anônimização e resposta ao titular |
| Busca/perfil público | Implementado | Aprovação, DTO público e revisão de dados reais/conteúdo |
| Interesse profissional | Não identificado | Formulário mínimo, confirmação, consentimento quando cabível e revisão |
| Perfil profissional | Cadastro/edição administrativa, leitura de conta pelo profissional | Edição própria com estado de revisão; verificar conselho, UF, identidade e trilha |
| Aprovação profissional | Booleano ativo; registro livre/opcional | Estados pendente/aprovado/reprovado/suspenso, responsável e evidências protegidas |
| Clínicas | CRUD administrativo de locais e vínculos | Candidatura, responsável, verificação, aprovação e gestão de membros |
| Agendamento | Reserva, remarcação, cancelamento e histórico implementados | Concorrência, abuso, confiabilidade e cadeia completa no IIS |
| Recepção/equipe | Escopos, pacientes, fila, espera e comunicação implementados | Isolamento entre unidades, vínculo/mesclagem e privacidade |
| Clínico | Evolução, receita textual, modelos, histórico e impressão | Avaliação específica; impressão não comprova assinatura/prescrição regulatória válida |
| Avaliações | Campos de nota/contagem existem; `perfil.js` anuncia etapa futura | Não anunciar coleta/moderação de avaliações como pronta |

Não remover convites: `auth.js`, `invitation-service.js`, `invitation-routes.js`, `homologation*`, telas e 003 são dependências reais. Manter convite opcional de produção exige novo desenho, inclusive consumo sem impedir cadastro aberto.

## 8. Proposta de MVP e flags

Classificação abaixo é proposta após correções; nenhum grupo está automaticamente liberado hoje.

| Grupo | Funcionalidades | Condições |
| --- | --- | --- |
| **A — lançamento inicial** | Apresentação, busca pública, perfis aprovados e contatos explicitamente públicos, captação de interesse, conta básica de paciente | Sem dados clínicos; verificação de e-mail, privacidade, antifraude, aprovação e operação mínimas concluídas. Captação e confirmação ainda precisam ser implementadas |
| **B — após validação** | Disponibilidade, agendamento/remarcação/cancelamento, agenda/equipe, lista de espera, recepção, relatórios operacionais e comunicação WhatsApp | Validar concorrência, titularidade, escopos, recuperação de falha e informação de envio; definir quais dados de saúde podem ser inferidos mesmo pela agenda |
| **C — desativado inicialmente** | Evoluções/prontuários, receitas/modelos, histórico clínico, impressão/exportação clínica, acesso de paciente ao registro e vínculo/mesclagem que habilite acesso clínico | Aprovação técnica, privacidade e avaliação jurídica/regulatória específicas |

Flags existentes: `HOMOLOGATION_MODE`, `INVITE_ONLY`, allowlists de profissionais/locais de homologação; `ativo` para contas/catálogo; status de regras de agenda; backup só inicia quando configurado. Nenhuma delas é flag granular de módulo público/clínico.

Propor flags de backend para cadastro público, captação profissional/clínica, booking, operações/recepção, comunicação e módulo clínico. Aplicar em montagem de rotas, comandos/worker, consultas/respostas que embutem dados sensíveis e UI. Default fechado para B/C em produção. `/api/appointments/:id/record`, templates, histórico clínico e impressão precisam estar cobertos mesmo sem página visível. Testar 404/403 consistente por acesso direto; não depender só do IIS ou CSS.

## 9. LGPD e privacidade

Avaliação técnica, sem declaração de conformidade. Dados de saúde demandam análise própria; a LGPD os classifica como sensíveis: [texto legal atualizado, Câmara dos Deputados](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html).

| Tema | Evidência e lacuna técnica | Dependência jurídica/organizacional |
| --- | --- | --- |
| Minimização/finalidade | Cadastro pede nome/e-mail/senha/telefone opcional; recepção/histórico e clínico coletam mais; telefone de conta aparece público | Mapear finalidade e necessidade por campo, população atendida e base legal |
| Transparência | Não identificados aviso completo, versionamento ou aceite contextual nos arquivos de páginas inspecionados | Redigir aviso, identificar controlador/operadores, canais e responsabilidades |
| Consentimento | Não identificada trilha de versão/finalidade/revogação | Determinar quando é aplicável; não tratar consentimento genérico como base universal para saúde |
| Direitos | Não há autosserviço completo de acesso/exportação/correção/exclusão/desativação | Processo de identificação, prazos e resposta, inclusive solicitações fora do sistema |
| Retenção | Há expiração de tokens e retenção de backup; não há política abrangente de dados pessoais/clínicos | Compatibilizar deveres de guarda e exclusão, inclusive cópias e bloqueio legal |
| Acesso | Papel, propriedade e escopo implementados | Matriz de necessidade, revisão periódica de acesso, desligamentos e segregação |
| Auditoria | Eventos de escrita parciais; leitura de prontuário e exportação sem trilha completa demonstrada | Responsáveis, acesso aos logs, prazo e investigação |
| Proteção | HTTPS previsto, cookies e backup cifrado; disco/MySQL/TLS real não comprovados | Política de chaves, dispositivos, contratos e responsabilização |
| Incidentes | Health/logs existem, plano de incidente não identificado | Definir resposta, evidências, avaliação e comunicação conforme regras vigentes da ANPD |
| Terceiros | Resend, fontes, links externos e futuro destino de backup | Mapear dados enviados, operadores/suboperadores, localização, contrato e transferência internacional |
| Regulação clínica | Receita é texto e impressão; nenhuma certificação/assinatura foi comprovada | Avaliação profissional/jurídica dos requisitos aplicáveis e limites de uso |

Avaliar exposição de criança/adolescente, documentos de identidade e conselho antes de coletar. Preferir evidência mínima e acesso restrito; não criar upload indiscriminado de documentos para cumprir uma etapa de verificação.

## 10. Infraestrutura, disponibilidade e custos

Dimensionamento inicial estimado para MVP pequeno, não capacidade comprovada; validar com carga e volume reais antes de contratar.

| Recurso | Mínimo de planejamento, host único | Recomendado inicial |
| --- | --- | --- |
| CPU | 2–4 vCPU dedicadas ou equivalentes | 4 vCPU com folga para scrypt, MySQL e backups |
| RAM | 8 GiB | 16 GiB; orçamento explícito para OS, pool/buffers MySQL, Node e agentes |
| Disco | SSD 100 GiB úteis, com quotas/alerta e reserva | SSD 200 GiB ou mais conforme dados/retencão; redundância e cópia externa independente |
| Banco separado | Opcional para MVP, mesma falha física se no host | Separar quando medição/SLA justificarem; rede privada/TLS e backup independente |
| Sistema | Windows Server suportado e licenciado | Build suportado com atualização planejada; versão alvo a confirmar |
| Rede | IP público roteável, domínio/DNS, NAT/firewall revisados | Link estável, possibilidade de contingência e monitor externo |
| Energia | Nobreak com desligamento controlado | Autonomia medida, bateria mantida e contingência conforme SLA |
| Backup | Cópia criptografada externa e chave fora do host | Destino independente com imutabilidade/versionamento e ensaios recorrentes |

Expor somente 443 e, se necessário, 80 para redirect/validação de certificado. Não expor Node, 3306, SMB, RDP ou WinRM à internet. Administração via VPN/bastion restrito com MFA e logs. Confirmar CGNAT, regras do provedor, IPv6, roteador, NAT e rota de retorno; IP público não foi verificado. DNS e renovação de certificado precisam responsáveis e alertas.

Host único reúne IIS, aplicação, MySQL e possivelmente backups: falha de disco, energia, rede, atualização ou ransomware pode parar tudo. RAID e nobreak não substituem cópia externa. Definir manutenção, patching, EDR/antimalware, acesso físico, conta de serviço, proteção/criptografia de volume e documentação de reconstrução. Não prometer alta disponibilidade com esse desenho.

Windows Server envolve licenciamento por edição/núcleos e condições de acesso que dependem da carga e do contrato; não presumir CAL por paciente nem isenção universal. Validar com fornecedor/licenciamento: [guia Microsoft](https://www.microsoft.com/licensing/guidance/Windows-Server-2025). IIS é componente Windows; módulos/wrapper, Node, bibliotecas e MySQL Community exigem revisão dos termos aplicáveis e suporte. Não foi realizada análise jurídica de licenças nem cotação.

Modelo de custo total mensal: amortização do equipamento/licenças + energia (potência média em kW × horas × tarifa) + internet/IP/contingência + domínio anual/12 + certificado/automação + e-mail + armazenamento/egresso externo + monitoramento/proteção + horas de administração/manutenção + reserva para falhas e reposição. Equipamento e licença já disponíveis reduzem desembolso inicial, mas não tornam operação gratuita. Valores locais e capacidade instalada **NÃO VERIFICADO**; comparar TCO com serviço gerenciado após orçamento e SLA definidos.

## 11. Reutilização das fases Railway

| Preservar/reutilizar | Adaptar | Manter como alternativa |
| --- | --- | --- |
| Validação de env, origem HTTPS, proxy restrito, cookies e CSP | Regras HOST/DB_NETWORK e exemplos Windows separados | Dockerfile Debian e `railway.toml` |
| Pool, timezone, identidade de banco e baseline com checksum | Inicialização/admin de produção e migração de convites opcional | Rede `railway-private`, sinais/volumes Linux |
| Fixtures isoladas e barreiras dos testes | Não usar setups legados em produção; preparar pacote Windows | Runbooks C.1–E.1 como histórico |
| Backup cifrado, cópia externa, health/logs, workers e shutdown | Executáveis Windows, ACL NTFS, SCM, rotação e restore de produção | Validação Linux continua válida para eventual hospedagem alternativa |
| Convites, escopos e telas de homologação | Separar convites opcionais do bloqueio ao cadastro aberto | Homologação fictícia restrita, sem reutilizar banco de desenvolvimento |
| PWA sem cache de API/HTML e privacy guard | Testes reais com IIS e política de cache/rollback | Empacotamento futuro distinto por destino |

Não excluir Docker, Railway, convites, migrations ou documentação para iniciar IIS. Não alterar configurações remotas. Criar um caminho Windows explícito e manter decisões/limites do histórico identificados por data.

## 12. Bloqueadores obrigatórios

Antes de qualquer publicação do Grupo A:

- Aprovar escopo e implementar bloqueio real B/C em todas as rotas e tarefas relacionadas.
- Corrigir DTOs públicos, aprovação de catálogo e verificação de e-mail; implementar captação mínima aprovada se fizer parte do lançamento.
- Concluir política de ambiente Windows/local ou rede TLS, isolamento de portas e trust proxy testado.
- Disponibilizar serviço com inicialização/recuperação/parada comprovadas, runtime/OS/dependências revisados.
- Preparar banco novo sem fixtures, conta mínima, catálogo revisado e primeiro administrador seguro.
- Validar domínio/TLS/origem/cookies e fluxos reais de e-mail pelo IIS.
- Ter backup externo restaurado em ensaio, custódia da chave e runbook de desastre/rollback.
- Definir aviso de privacidade, direitos/retencão, incidentes e responsabilidades com avaliação jurídica pertinente.
- Concluir testes funcionais, segurança, navegador/PWA e operação na infraestrutura alvo, com riscos altos/críticos do escopo resolvidos.

## 13. Plano incremental proposto

Todas as etapas abaixo são propostas futuras; dependem da aprovação da análise. Complexidade qualitativa não representa prazo contratado.

| Fase | Escopo pequeno | Complexidade | Critério de saída |
| --- | --- | --- | --- |
| P02.1 | Aprovar matriz A/B/C e mapa de dados/rotas | Baixa/média | Recursos públicos e bloqueados definidos; responsável por decisão |
| P02.2 | Flags de backend/UI e interrupção de tarefas fora do MVP | Média | Acesso direto a B/C negado; nenhum campo clínico em respostas do A |
| P02.3 | DTO público, publicação de catálogo e contatos | Média | Campos privados ausentes anonimamente; perfis só após aprovação auditável |
| P03.1 | Configuração Windows, bind/rede/pool e exemplos separados | Média | Configuração segura aceita; configurações perigosas recusadas em teste |
| P03.2 | Empacotar serviço Windows e logs/ACLs | Média | Instalação em laboratório, reboot/crash/stop com evidências e sem privilégios admin no runtime |
| P03.3 | Proxy IIS/TLS/headers/timeouts/cache | Média | HTTPS válido, IP/origem corretos, spoofing rejeitado e backend inacessível externamente |
| P04.1 | Inicialização/banco novo/admin/catálogo de produção | Média/alta | Schema e grants conferidos, sem fixtures; procedimento repetível e separado de legado |
| P04.2 | Backup externo e restore/rollback operacional | Alta | Recuperação em destino novo dentro de RPO/RTO aprovados |
| P05.1 | Confirmação de e-mail e endurecimento de conta | Média/alta | Tokens seguros, abuso limitado, entrega e revogação verificadas |
| P05.2 | Interesse profissional/clínica e revisão | Média/alta | Sem autopublicação; responsável/registro verificados; mudanças sensíveis voltam à revisão |
| P06.1 | Privacidade, direitos, retenção e incidente | Alta, multidisciplinar | Processos aprovados e controles demonstráveis para dados do MVP |
| P06.2 | Validação integrada, carga, segurança e PWA | Alta | Matriz de aceite executada no ambiente alvo; sem pendências impeditivas |
| P07 | Publicação controlada do Grupo A e acompanhamento | Média | Go/no-go formal, janela/rollback e alertas operantes |
| P08 | Grupo B, por jornada | Alta | Concorrência, isolamento entre unidades, vínculo e comunicação aprovados |
| P09 | Grupo C, projeto próprio | Alta | Avaliações clínica, regulatória, segurança e privacidade concluídas antes da ativação |

Próxima fase recomendada: **P02.1–P02.3, definição e isolamento do MVP**, mantendo o sistema sem exposição pública. Em seguida, laboratório Windows/IIS e dados exclusivamente fictícios em ambiente novo autorizado.

## 14. Critérios objetivos de aceite para publicação

1. Matriz de endpoints documentada; usuários anônimos, paciente A/B, profissional A/B, equipe de unidades distintas e administrador testados. Nenhuma leitura/escrita indevida ou módulo B/C acessível no MVP.
2. Cadastro não ativa e-mail não confirmado; token expirado/reutilizado/inválido é recusado. Reenvio/registro/login/reset possuem limites e entrega de e-mail demonstrada, sem credenciais em logs.
3. Perfis não aprovados não aparecem em busca, acesso por ID, relacionados ou disponibilidade. DTO público não contém telefone/e-mail cadastral ou documentação privada não autorizada.
4. Somente portas aprovadas são alcançáveis externamente; Node/DB/gerência permanecem privados. Host/Origin incorretos e X-Forwarded-* forjados não contornam controles nem limitação por IP.
5. Certificado/cadeia/renovação, redirecionamento e headers validados; cookie Secure/HttpOnly/SameSite observado em navegador real; logout/reset/troca de senha invalidam sessões conforme política.
6. Serviço sobe após reinício, recupera crash e encerra dentro do prazo sem transação parcial, perda de tarefa ou reserva duplicada. Worker desativado não processa funcionalidades bloqueadas.
7. Banco é novo, identificado, sem fixtures, com migration checksums corretos e conta runtime sem DDL/GRANT/FILE. Restore em destino separado compara estrutura e dados de teste e permite execução funcional.
8. RPO/RTO aprovados e medidos; backup externo/idade/falha monitorados, chave recuperável fora do host e espaço/retencão controlados. Falha de backup não passa despercebida.
9. Deploy e rollback ensaiados preservam dados/configurações/arquivos e compatibilidade de schema; PWA não conserva HTML/API/dados clínicos após logout ou rollback.
10. Carga de referência e meta de latência/erro aprovadas antes do teste; atendidas sob concorrência, busca, hashing e indisponibilidade temporária do banco. Readiness acusa falha e recuperação de forma observável.
11. Aviso/processos de privacidade, retenção, titulares, incidente, terceiros e revisão jurídica do escopo aprovados. Nenhuma declaração genérica de conformidade baseada apenas em testes.
12. Evidências anexadas, pendências críticas/altas do escopo encerradas e decisão go/no-go registrada pelo responsável. **Testes verdes isoladamente não autorizam lançamento.**

## 15. Encerramento da fase

IIS é tecnicamente viável como proxy reverso. O esforço maior está em limitar o produto público, confirmar titularidade e publicação, adaptar políticas Railway ao Windows e provar operação/recuperação. Infraestrutura própria exige administração contínua e avaliação de custo total.

Nenhuma implementação foi iniciada. Aguardar aprovação do relatório antes das próximas fases.
