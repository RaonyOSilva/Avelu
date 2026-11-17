# AVELU — P02.1: escopo e matriz de isolamento do MVP

Data: 17/11/2026. Base: código inspecionado no checkout de `71e8abd` e `FASE-PUBLICA-01-AUDITORIA-IIS.md`. **Documento de definição; nenhuma flag, rota ou migração descrita abaixo foi implementada. Publicação continua bloqueada.**

## 1. Decisões de escopo

| Grupo | Escopo do lançamento | Decisão |
| --- | --- | --- |
| A | Apresentação institucional, busca de profissionais/clínicas, perfis aprovados, contatos autorizados, captação de interesse | Disponível somente após os respectivos controles e aceite; captação ainda não existe |
| A condicional | Cadastro básico de paciente, confirmação de e-mail, login e gestão básica da própria conta | Cadastro fechado até confirmação de e-mail implementada e validada; sem agenda, prontuário ou vínculo de recepção |
| B | Disponibilidade operacional, reservas, remarcação/cancelamento, equipes/recepção, fila/lista de espera, comunicação e relatórios associados | Desativado para todos os papéis, inclusive administrador |
| C | Prontuários/evoluções, receitas/modelos, histórico clínico, impressão/exportação clínica e vínculos/mesclagens que habilitem esse acesso | Desativado para todos os papéis, inclusive administrador |

**A restrito** designa suporte administrativo necessário ao Grupo A, não nova funcionalidade pública: moderação de catálogo, gestão mínima de contas, credenciais e auditoria própria do A. Não autoriza acesso a agenda/recepção/saúde. Monitoramento, backup e segurança são suporte transversal; não devem ser desligados como se fossem operações de agenda.

Recurso não inventariado permanece fechado até classificação explícita. Papel, perfil ativo, convite ou flag não substituem autorização. Não remover módulos, dados, convites ou configuração Railway.

## 2. Método e alcance

Inspeção de todos os arquivos JavaScript da raiz para registros Express, arrays de caminhos, router montado em prefixo e montagens internas; leitura dos módulos de rotas, configuração, tarefas, allowlist estática, páginas HTML, scripts de tela, PWA e scripts de manutenção. A extração de chamadas foi feita como texto, sem importar/iniciar o servidor. Todos os HTML da raiz foram enumerados (20 páginas).

Não foram executados testes, SQL, migrations, workers, backups, scripts de setup ou serviços. Não foram lidos valores do `.env`, usados dados reais, instaladas dependências ou alteradas configurações. O relatório anterior já estava não rastreado no início e foi preservado. Única escrita desta fase: este documento.

As tabelas representam o comportamento pretendido, contrastado com o código atual quando necessário. **NÃO VERIFICADO**: comportamento em execução/IIS, conteúdo real do banco, ACLs/grants, entrega de e-mail e efetividade de controles futuros. Esta fase não certifica isolamento implementado.

Conferência final estritamente textual: identificados **93 pares explícitos método/caminho**, expandindo arrays e prefixo do router administrativo; todos os caminhos aparecem neste documento, assim como os 20 nomes de HTML. Essa conferência de presença complementa a revisão manual das tabelas; não é teste de autorização nem substitui inventário de runtime em futura validação. Estáticos, middlewares, HEAD e OPTIONS implícitos são tratados separadamente.

## 3. Convenções de permissão e estado

- **Anônimo:** acesso sem sessão; nunca pode obter dados de conta, candidato, paciente, agenda ou saúde.
- **Paciente:** apenas própria conta básica quando habilitada e e-mail confirmado; acesso a B/C segue negado.
- **Profissional/equipe:** nenhum portal operacional no MVP; autenticação pode continuar existindo, sem liberar módulos por isso.
- **Administrador:** moderação/contas do A sob autorização existente; B/C negados. Não criar um bypass administrativo para flags.
- **Técnico:** health/status genérico e tarefas de proteção com conta de serviço; não é papel de usuário da API.
- **Cat:** catálogo público aprovado; **AdmCat:** gestão privada desse catálogo; **Conta:** conta básica/identidade; **Cap:** captação mínima; **Conv:** convites opcionais preservados; **Tec:** suporte técnico. Esses nomes identificam as flags propostas na seção 8.

Uma linha com dois métodos/caminhos representa cada combinação explicitamente listada, não um wildcard implícito. `:id` é parâmetro existente. Em arrays de aliases, ambos os endereços devem ser protegidos. GET inclui o HEAD implícito do Express.

## 4. Inventário completo das rotas Express

### 4.1 Infraestrutura, autenticação e conta

| Método | Caminho | Origem | Grupo / permissão no MVP | Condição e comportamento |
| --- | --- | --- | --- | --- |
| GET | `/robots.txt` | `server.js:26` | A/Tec, anônimo | Preservar política por ambiente; não é controle de acesso |
| GET | `/api/environment` | `server.js:27` | A/Tec, anônimo | Apenas capacidades públicas mínimas; nunca segredos/flags internas/IDs de homologação |
| GET | `/health/live` | `operational-health.js:4` | Tec | Status genérico |
| GET | `/health/startup` | idem | Tec | Não comprova todos os módulos prontos |
| GET | `/api/health` | idem | Tec | Alias deve obedecer mesma política |
| GET | `/health/ready` | `operational-health.js:10` | Tec | Pode consultar conectividade/identidade; sem leitura de tabelas B/C |
| POST | `/api/auth/register` | `auth.js:86` | A condicional, anônimo | Conta + cadastro público + verificação habilitados; ramo convite tem condição própria, sem bypass de confirmação |
| POST | `/api/auth/login` | `auth.js:115` | A/Auth, anônimo | Preservar rate limit; sessão não concede B/C; paciente pendente não recebe sessão operacional |
| GET | `/api/auth/me` | `auth.js:130` | A/Auth | Própria identidade mínima ou null; `audience=patient` não é autorização |
| POST | `/api/auth/logout` | `auth.js:133` | A/segurança | Manter revogação disponível mesmo ao desativar login/conta |
| POST | `/api/auth/forgot` | `account.js:11` | A/Auth, anônimo | Recuperação não confirma e-mail por efeito colateral nem publica perfil |
| POST | `/api/auth/reset` | `account.js:23` | A/Auth, anônimo com token | Token hash/uso único, revogação; não habilita B/C |
| GET | `/api/account` | `account.js:9` | A condicional, paciente próprio | Atualmente política global exige paciente, além de signedIn; manter propriedade e confirmação |
| POST | `/api/account` | `account.js:10` | A condicional, paciente próprio | Somente nome/telefone permitido; não aceitar papel, publicação ou aprovação |
| POST | `/api/account/password` | `account.js:8` | A/segurança, próprio usuário autenticado | Não subordinar à flag de agenda; preservar acesso para troca obrigatória e revogar sessões |
| POST | `/api/account/link-code` | `operations.js:32`, montado por `team.js` | **C, negado** | Gera chave de vínculo com recepção, não pertence à conta básica |

`/api/auth/register` hoje abre cadastro paciente e cria sessão imediatamente, sem confirmação de e-mail. A implementação futura deve separar ativação de conta de publicação de perfil e de concessão de papel. Login de administrador continua necessário mesmo com cadastro público fechado; redirects atuais em `access-policy.js:home/loginDestination` levam paciente/profissional/equipe a B/C e precisarão de destino seguro compatível com as capacidades.

### 4.2 Catálogo público e catálogo administrativo

| Método | Caminho | Origem | Grupo / permissão | Isolamento necessário |
| --- | --- | --- | --- | --- |
| GET | `/api/specialties` | `server.js:71`, `specialties.js:catalog` | A/Cat, anônimo | Taxonomia ativa revisada; sem pacientes/agendas |
| GET | `/api/cities` | `admin.js:180` | A/Cat, anônimo | Somente cidades de locais publicáveis, não só `ativo=1` |
| GET | `/api/places` | `admin.js:194` | A/Cat, anônimo | DTO público; telefone só autorizado; perfis aprovados |
| GET | `/api/places/:id` | `admin.js:186` | A/Cat, anônimo | Mesmo predicado de publicação do perfil/busca |
| GET | `/api/professionals` | `server.js:79` | **A com dependência B atual** | Remover execução de disponibilidade, ordenação por agenda e seus campos no modo A |
| GET | `/api/discovery` | `discovery.js:2` | **A com dependência B atual** | Separar consulta do diretório da consulta operacional; filtros de agenda recusados no MVP |
| GET | `/api/profiles/:type/:id` | `profiles.js:4` | A/Cat, anônimo | `type=local|profissional`; DTO e relacionados aprovados; retirar telefone cadastral |
| GET | `/api/admin/places` | `admin.js:73`, router `/api/admin` | A restrito/AdmCat, admin | Leitura privada para revisão; sem pacientes/agendas |
| POST | `/api/admin/places` | `admin.js:99` | A restrito/AdmCat, admin | Cadastro em rascunho; não publicar por simples booleano |
| PUT | `/api/admin/places/:id` | `admin.js:100` | A restrito/AdmCat, admin | Alteração sensível exige revisão/republicação |
| GET | `/api/admin/professionals` | `admin.js:101` | A restrito/AdmCat, admin | Contatos privados restritos à revisão necessária |
| POST | `/api/admin/professionals` | `admin.js:147` | A restrito/AdmCat, admin | Hoje cria usuário sem login + perfil; separar criação de diretório de acesso profissional |
| PUT | `/api/admin/professionals/:id` | `admin.js:148` | A restrito/AdmCat, admin | Hoje também altera nome/e-mail/telefone de conta: exigir regra de titularidade e rever confirmação ao mudar e-mail |
| POST | `/api/admin/specialties` | `admin.js:150` | A restrito/AdmCat, admin | Preservar allowlists/validação e integridade da taxonomia |

### 4.3 Disponibilidade e jornada do paciente

| Método | Caminho | Origem | Grupo / permissão atual | MVP |
| --- | --- | --- | --- | --- |
| GET | `/api/professionals/:id/availability` | `appointments.js:23` | B, **anônimo hoje** | Negado, inclusive aliases de formato aceitos pelo Express |
| GET | `/api/appointments` | `appointments.js:27` | B, paciente próprio | Negado |
| POST | `/api/appointments` | `appointments.js:28` | B, paciente próprio | Negado; inclui remarcação por `rescheduleId` no corpo |
| POST | `/api/appointments/:id/cancel` | `appointments.js:37` | B, paciente próprio | Negado |
| GET | `/api/appointments/:id/history` | `operations.js:36` | B, paciente próprio; eventos com etapas clínicas | Negado; filtrar eventos clínicos se B for ativado antes de C |
| GET | `/api/appointments/:id/record` | `appointments.js:9` | C, paciente próprio | Negado |
| GET | `/api/admin/availability` | `appointments.js:41` | B, admin | Negado |
| POST | `/api/admin/availability` | `appointments.js:42` | B, admin | Negado |
| POST | `/api/admin/availability/:id/block` | `appointments.js:46` | B, admin | Negado |

### 4.4 Equipe e portal profissional, inclusive aliases

Todas as rotas desta tabela são **B e negadas no MVP**, inclusive leitura da conta profissional pelo portal operacional. A futura edição de perfil do Grupo A será uma jornada separada; não habilitar o portal inteiro para oferecê-la. `T` abaixo significa equipe/admin com `canManage` e `scope`; `P` significa profissional com perfil próprio, além da política global por papel. O papel administrador não substitui P nos caminhos `/api/professional`.

| Método | Caminho(s) existentes | Origem | Autorização/observação atual |
| --- | --- | --- | --- |
| GET | `/api/professional/account` | `team.js:47` | P; dados privados da conta |
| GET | `/api/professional/report` | `team.js:54` | P; pacientes, atendimentos concluídos e data de finalização clínica; dependência C |
| POST | `/api/team/password`, `/api/professional/password` | `team.js:69` | T/P; aliases operacionais fechados; usar `/api/account/password` para credenciais básicas |
| GET | `/api/team/context`, `/api/professional/context` | `team.js:80` | T/P; pares profissional/local e estado de publicação |
| GET | `/api/professional/scheduled` | `team.js:96` | P; lista de pacientes confirmados |
| GET | `/api/team/agenda`, `/api/professional/agenda` | `team.js:109` | T/P; pacientes/contatos, cancelados, estados e links WhatsApp |
| POST | `/api/team/availability`, `/api/professional/availability` | `team.js:144` | T; alias P é registrado, porém requireTeam recusa esse POST profissional |
| POST | `/api/team/availability/:id/state`, `/api/professional/availability/:id/state` | `team.js:175` | T; alias P registrado mas recusado pelo middleware |
| POST | `/api/team/appointments`, `/api/professional/appointments` | `team.js:195` | T; alias P registrado mas recusado; pode criar cadastro de recepção/vínculo de unidade |
| POST | `/api/team/appointments/:id/state`, `/api/professional/appointments/:id/state` | `team.js:229` | T/P com ações distintas; consulta registro clínico e pode concluir atendimento |
| POST | `/api/team/appointments/:id/reschedule` | `team-experience.js:7` | T; também verifica ausência de registro clínico |
| GET | `/api/team/waitlist` | `team-experience.js:30` | T, escopo profissional/local |
| POST | `/api/team/waitlist` | `team-experience.js:37` | T, escopo profissional/local |
| POST | `/api/team/waitlist/:id/state` | `team-experience.js:45` | T, escopo profissional/local |
| GET | `/api/team/schedules/calendar` | `team-scheduling.js:5` | T; calendário de programação |
| GET | `/api/team/schedules` | `team-scheduling.js:10` | T; regras, status, erros e última execução |
| POST | `/api/team/schedules/preview` | `team-scheduling.js:17` | T; prévia também é execução B |
| POST | `/api/team/schedules` | `team-scheduling.js:18` | T; publica regra/horários |
| POST | `/api/team/schedules/:id/state` | `team-scheduling.js:19` | T |
| POST | `/api/team/schedules/:id/withdraw` | `team-scheduling.js:20` | T; retira horários preservando reservas |
| POST | `/api/team/queue/:id` | `operations.js:12` | T; fluxo de recepção |
| POST | `/api/professional/queue/:id/start` | `operations.js:12` | **B + C**; P inicia atendimento clínico; exigir ambas as capacidades no futuro |
| GET | `/api/team/patients` | `operations.js:24` | T; cadastro de recepção, não cadastro público de paciente |
| POST | `/api/team/patients` | `operations.js:25` | T; dados pessoais e unidades |
| POST | `/api/team/patients/:id/contact` | `operations.js:30` | T; altera cadastro compartilhado |
| GET | `/api/team/patients/:id` | `operations.js:31` | T; retorna histórico operacional associado |
| GET | `/api/team/communications` | `operations.js:34` | T; contatos, horários e links de mensagem |
| POST | `/api/team/communications/:id` | `operations.js:35` | T; registra aberta/envio informado, não comprova entrega |

Montagem real: `server.js → team.js:mountTeam → team-experience.js + team-scheduling.js + operations.js`. Bloquear apenas chamadas diretas de `server.js` ou prefixos `/api/team` e `/api/professional` deixa descobertas as rotas `/api/account/link-code`, `/api/appointments/:id/history` e rotas admin montadas por `operations.js`.

### 4.5 Clínico e vínculo

| Método | Caminho | Origem | Grupo / autorização atual | MVP |
| --- | --- | --- | --- | --- |
| GET | `/api/consultations/:id` | `consultations.js:31` | C, profissional dono; inclui histórico | Negado |
| POST | `/api/consultations/:id` | `consultations.js:44` | C, profissional dono; salva/finaliza e modifica agenda | Negado |
| GET | `/api/templates` | `clinical-templates.js:5` | C, profissional próprio | Negado |
| POST | `/api/templates` | `clinical-templates.js:6` | C, profissional próprio | Negado |
| DELETE | `/api/templates/:id` | `clinical-templates.js:7` | C, profissional próprio | Negado |
| POST | `/api/team/patients/:id/link` | `operations.js:33` | C, equipe/admin + escopo inicial + código | Negado; mescla/unifica unidades/cadastros/agendamentos |

Também pertencem ao C `/api/account/link-code`, já listado na tabela de conta, e o início clínico `/api/professional/queue/:id/start` em B+C. Impressão/exportação clínica não têm rota Express própria identificada: são executadas no navegador sobre respostas de C; devem ser bloqueadas no dado e na tela, não só por procurar uma rota `/print` inexistente.

### 4.6 Administração mista e convites

| Método | Caminho | Origem | Grupo / permissão | Decisão para MVP |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/operations` | `operations.js:37` | B, admin | Negado; mistura indicadores, agenda e status técnico de backup |
| GET | `/api/admin/audit` | `operations.js:38` | B + suporte A misturados | **Rota atual negada**; futuro endpoint/variante A deve consultar só eventos de catálogo/conta, sem agenda/IDs B/C |
| GET | `/api/admin/users` | `operations.js:39` | A restrito, admin | Pode permanecer após separar montagem de B e limitar DTO/necessidade |
| POST | `/api/admin/users/:id/state` | `operations.js:40` | A restrito, admin | Pode permanecer para desativação/revogação, sem executar B/C; preservar proteção de administradores |
| POST | `/api/admin/users/:id/role` | `team-access.js:6` | B, admin | Negado inicialmente; moderação de perfil não exige conceder papel profissional/equipe |
| GET | `/api/admin/team-access` | `team-access.js:18` | B, admin | Negado |
| POST | `/api/admin/team-access` | `team-access.js:29` | B, admin | Negado; cria credencial e escopo operacional |
| DELETE | `/api/admin/team-access/:id` | `team-access.js:66` | B, admin | Negado no MVP; revogação excepcional fica em procedimento técnico autorizado, não bypass público |
| GET | `/api/admin/place-settings` | `operations.js:41` | B atual, admin | Negado; contém orientações operacionais/convênios, não necessário ao diretório básico |
| POST | `/api/admin/place-settings/:id` | `operations.js:42` | B atual, admin | Negado; eventual convênio público terá revisão/DTO próprios |
| GET | `/api/admin/invitations` | `invitation-routes.js:10` | A restrito/Conv, admin | Preservado, fechado por padrão; nunca anônimo |
| POST | `/api/admin/invitations` | `invitation-routes.js:13` | A restrito/Conv, admin | Fechado; no futuro validar papel permitido e confirmação independente |
| POST | `/api/admin/invitations/:id/revoke` | `invitation-routes.js:14` | A restrito/Conv, admin | Mesma política de Conv; sem tocar agenda/saúde |

`INVITE_ONLY` hoje controla simultaneamente cadastro e rotas de convite; produção recusa essa flag (`homologation-config.js`). Convites opcionais exigirão desacoplamento explícito. Não alterar a regra existente silenciosamente nesta fase ou usar convite para ativar equipe/profissional no MVP.

### 4.7 Middlewares, estáticos e rotas implícitas

| Registro | Fonte | Cobertura/decisão |
| --- | --- | --- |
| Logs, Helmet, no-store HTML, JSON 100 KiB | `server.js:20–24` | Preservar; erro não deve expor payload/segredo |
| `catalogMiddleware` | `server.js:28`, `homologation.js` | Pode responder `/api/cities` antes das rotas e reescrever JSON de catálogo; guardas de capacidade precisam precedê-lo. Não confundir dados fictícios com isolamento de B |
| Política de papel/página | `server.js:29`, `access-policy.js` | Preservar autenticação/autorização; acrescentar isolamento antes de consultas/auth que não precisam executar em recurso fechado |
| Origin/no-store `/api` | `server.js:37` | Preservar para endpoints ativos; respostas de capacidade fechada também terão no-store |
| `GET/HEAD /assets/*` | `server.js:47` | Diretório público inteiro hoje; revisar e servir somente assets aprovados, sem documentos privados |
| `GET/HEAD /` e arquivos de `publicFiles` | `server.js:46–54` | Handler genérico, não chamadas app.get individuais; páginas/scripts da seção 5 fazem parte do inventário |
| Alteração do worker em homologação | `server.js:51` | Preservar separação de ambiente; nenhum retorno alternativo pode contornar flags |
| Troca obrigatória | `server.js:60` | Mantê-la; hoje vem depois de account/auth e não inclui `/api/templates`; flags não devem replicar essa lacuna |
| Router `/api/admin`, `router.use(requireAdmin)` e `router.param('id')` | `admin.js:7,71,179` | Prefixo já expandido nas tabelas; param não é endpoint; não retirar guardas para separar catálogo |
| Middleware `/api/team`, `/api/professional` | `team.js:43` | `requireTeam` consulta perfil/escopo e restringe POST P; não é único ponto de isolamento |
| Middleware `/api/consultations`, `/api/templates` | `consultations.js:28`, `clinical-templates.js:4` | Não executar consulta de usuário/perfil de módulo fechado |
| Fallback `/api`, handler de erro e fallback página | `server.js:114` em diante | Negação 404 uniforme; sem fallback SPA para recurso fechado |
| HEAD/OPTIONS e métodos não registrados | Comportamento Express | HEAD implícito e OPTIONS automático precisam de testes; não anunciar métodos de B/C em Allow; qualquer método sobre recurso fechado recebe 404 |

Não foram encontrados outros routers montados, app.route, WebSocket, SSE ou endpoints de upload no inventário estático. Chamadas diretas a funções de serviço/CLI são superfícies adicionais e estão na seção 7.

## 5. Páginas HTML, scripts e ações locais

`privacy-guard.js` é injetado em **todos** os HTML servidos pelo Express. `homologation.js:decorate` injeta banner/CSS na homologação. A tabela inclui todas as 20 páginas HTML da raiz e seus scripts externos declarados.

| Página | Grupo / estado proposto | Scripts declarados | Pontos de isolamento |
| --- | --- | --- | --- |
| `/`, `index.html` | A | `app.js`, `home-discovery.js` | Navegação/CTA sem agendar ou cadastro não habilitado; conteúdo demonstrativo revisado, sem prometer B/C |
| `sobre.html` | A | `app.js` | Revisar afirmações e links para funções fechadas |
| `buscar.html` | A após separar B | `buscar.js` | Retirar filtros de disponibilidade, badges/ordem por agenda e CTA operacional; usar catálogo puro |
| `perfil.html` | A após DTO/aprovação | `perfil.js` | Telefone autorizado; relacionados aprovados; retirar CTA Agendar; sem avaliação não comprovada |
| `cadastro.html` | A condicional | `conta.js` | 404 enquanto cadastro fechado; não permitir token de convite contornar confirmação |
| `entrar.html` | A/Conta | `conta.js` | Destino pós-login e `next` devem respeitar capacidades; admin tem destino restrito A |
| `recuperar.html` | A/Conta | `recuperar.js` | Recuperação e reset próprios, sem ativar perfil/papel |
| `senha.html` | A/segurança | `senha.js` | Troca de senha própria preservada; nunca depender de portal B |
| `admin.html` | A restrito/AdmCat | `session-exit.js`, `admin-ui.js`, `workspace.js` | Só moderação/catálogo; eliminar navegação para B/C na renderização, preservando bloqueio servidor |
| `convites.html` | A restrito/Conv, fechado | `convites.js`, `workspace.js` | Depende de Conv + admin, não de cadastro aberto |
| `agendar.html` | B, 404 | `conta.js` | Não servir formulário/horários |
| `agendar-local.html` | B, 404 | `agendar-local.js`, `app.js` | Parece perfil de clínica, mas faz fetch de availability por profissional |
| `agendamentos.html` | B+C misturados, **404 no MVP** | `session-exit.js`, `patient-tools.js`, `conta.js` | Contém conta básica, porém também polling de agenda, registros, vínculo e impressão. Criar futura página de conta isolada do A, sem liberar esta página inteira |
| `agenda-admin.html` | B, 404 | `session-exit.js`, `agenda-admin.js`, `workspace.js` | Publicação/bloqueio de horários |
| `equipe.html` | B, 404 | `session-exit.js`, `equipe.js`, `workspace.js` | Concessão de acessos operacionais |
| `atendimento.html` | B, com transições para C; 404 | `session-exit.js`, `atendimento.js`, `atendimento-extras.js`, `workspace.js`, `reception-patients.js` | Recepção, fila, cadastro e agendamento manual |
| `programacao.html` | B, 404 | `session-exit.js`, `programacao.js`, `workspace.js` | Regras/preview/publicação automática |
| `profissional.html` | B+C, 404, qualquer aba | `session-exit.js`, `profissional.js`, `workspace.js` | Conta/relatórios/agenda e início clínico; `?aba=conta` não vira exceção |
| `consulta.html` | C, 404 | `session-exit.js`, `consulta.js`, `consulta-modelos.js`, `workspace.js` | Registros/modelos/histórico e `window.print` |
| `operacao.html` | Misto, **404 em todas as abas no MVP** | `session-exit.js`, `workspace.js`, `operations-ui.js` | Indicadores/pacientes/comunicação/auditoria/unidades/usuários misturados; suporte A exige tela separada, não exceção por query string |

A linha `/` é alias de index, não uma página adicional. Páginas futuras de conta, captação, confirmação e moderação ainda não têm arquivo/rota existente; nomes devem ser definidos na implementação e incluídos no inventário antes de liberar.

### 5.1 Scripts compartilhados e scripts não publicados

| Script/família | Uso atual | Decisão |
| --- | --- | --- |
| `app.js`, `home-discovery.js`, `buscar.js`, `perfil.js` | A com links/dependências de B | Adaptar para capacidades públicas; não inferir capacidades só pelo papel |
| `conta.js` | Login/cadastro + disponibilidade/reserva/agenda/conta em branches por página | Manter apenas entradas A na allowlist ou separar recursos por página; branches B não podem rodar em conta básica |
| `workspace.js` | Menu por papel com links B/C e identidade privada | Renderizar só destinos permitidos; identidade apenas na própria área autenticada |
| `privacy-guard.js`, `session-exit.js` | Logout entre abas/BFCache e saída | Preservar; limpar telas após perda de sessão e após mudança de release/capacidade |
| `service-worker.js`, `manifest.webmanifest` | PWA e cache de estáticos | Manifest/worker permanecem A; precache não pode depender de scripts bloqueados; não cachear HTML/API/dados privados |
| `patient-tools.js` | Dashboard, prontuário/receita, impressão, ICS e código de vínculo | B+C, não carregar/servir no MVP |
| `profissional.js`, `consulta.js`, `consulta-modelos.js` | Relatórios/atendimento/receita e impressão | B/C, não carregar/servir no MVP |
| `atendimento.js`, `atendimento-extras.js`, `reception-patients.js`, `programacao.js`, `agenda-admin.js`, `agendar-local.js`, `equipe.js` | B, com ligações C | Não carregar/servir no MVP |
| `operations-ui.js` | Misto A restrito/B/C | Fechado no MVP; futura UI A independente |
| `admin-ui.js`, `convites.js`, `recuperar.js`, `senha.js` | A restrito/condicional/segurança | Servir de acordo com capacidade; scripts não transportam autorização |
| `homologation.css` e CSS por página | Apresentação | Não são barreira; bloquear CSS B/C é higiene de pacote, não requisito suficiente |
| `admin.js`, `auth.js`, `account.js`, `appointments.js`, `profiles.js`, `discovery.js`, `team*.js`, `consultations.js`, `operations.js`, `clinical-templates.js` | Backend | Não estão na allowlist pública; manter privados, inclusive se nome parecer script de UI |
| `specialties.js`, `city-filter.js`, `patient-registry.js`, `schedule-*.js`, `whatsapp-confirmation.js`, `invitation-*.js`, `access-policy.js`, config/DB/backup/operational/lifecycle | Serviços backend | Nunca publicar como arquivo estático; classificar execução por recurso chamador |

Bloquear entrega de JS exclusivo de B/C é proposto para reduzir superfície e evitar execução de telas antigas. Mesmo que um cliente já possua o JS em cache, a API deve negar. Não basta renomear assets ou modificar o service worker.

## 6. Dependências e dados que atravessam grupos

| Origem → destino | Dependência comprovada | Decisão |
| --- | --- | --- |
| A busca → B disponibilidade | `server.js:/api/professionals` consulta MIN(inicio_em), ordena por disponibilidade; `discovery.js` usa subquery de slots e HAVING | Criar caminho SQL de catálogo que não leia tabelas B; omitir `next_available_at` e retirar ordem/filtro de disponibilidade |
| A perfil → B UI | `perfil.js` constrói links para `agendar.html`/`agendar-local.html` | Só contato público ou navegação de diretório; nenhum CTA operacional |
| A conta → B/C | `agendamentos.html`, `conta.js`, `patient-tools.js`; código de vínculo em `operations.js` | Conta A isolada; nenhuma chamada de agenda, record ou link-code |
| A administração → B | `operations.js` monta users/state junto com indicadores e recepção; workspace abre todas as abas por papel | Separar montagem/guardas e UI por capacidade, preservando requireAdmin |
| A profissional → conta privada | `admin.js:saveProfessional` altera `usuarios`; `profiles.js` publica `u.telefone` | DTO público explícito e revisão de alterações de identidade; conta não equivale a perfil |
| B → C | Remarcação verifica registro clínico; relatório lê finalizado_em; estados de agenda consultam registros | Ao reativar B futuramente, revisar dependências de integridade sem divulgar/produzir C. Não simplesmente apagar checagem clínica necessária à integridade de dados legados |
| C → B | Salvar/finalizar consulta muda fluxo/status e grava agenda_eventos | C precisa de B habilitado e validado; flag C sozinha não é configuração válida |
| C vínculo → conta/recepção | Código e mesclagem atualizam cadastros, unidades e todos os agendamentos do cadastro | C + operações + conta, além de escopos; fechado inicialmente |
| A convites → papel/cadastro | `invitation-service.consume` cria usuário com papel de convite | Não pode conceder acesso operacional ou contornar e-mail; preservar mecanismo fechado até validação própria |
| Homologação → catálogo | Middleware pode responder cedo e repassar `next_available_at`/slots fictícios | Guardas anteriores e DTO A também na homologação quando modo MVP estiver ativo |
| Backup → todas as tabelas | Dump completo inclui B/C se já existirem | Proteção técnica privilegiada, não exposição nem execução de negócio; preservar cópia/restauração sem dar API de download |

### 6.1 Endpoints anônimos com dependência/exposição B/C atual

1. **GET `/api/professionals/:id/availability` — B:** publica slots, IDs, horários, preço e local/endereço. Fechar integralmente.
2. **GET `/api/professionals` — A/B:** `next_available_at` e ordenação por MIN da agenda; remover consulta e campo no caminho A, não apenas substituir o valor por null.
3. **GET `/api/discovery` — A/B:** `next_available_at`, filtros `disponibilidade=hoje|semana|primeiro`, pagamento/convênio dependentes de agenda e ordenação por próximo horário. No MVP, aceitar apenas busca de diretório; parâmetro operacional não vazio recebe 400 genérico antes de SQL. Não ignorar silenciosamente nem retornar lista vazia que pareça disponibilidade real.
4. **GET `/api/profiles/:type/:id` — privacidade A:** não retorna prontuário no código inspecionado, mas retorna telefone cadastral do profissional; corrigir conforme seção 9.

Nenhuma rota anônima retornando evolução/receita foi identificada. Isso não prova ausência de falha dinâmica. Perfis relacionados, lista de cidades, assets, conteúdo estático e resultado por ID também precisam do mesmo controle de publicação; não existe aprovação formal hoje, só `ativo` e exclusão parcial de contas demonstrativas.

## 7. Workers, tarefas, manutenção e ações no navegador

| Entrada | Grupo | Execução atual | Política proposta |
| --- | --- | --- | --- |
| `server.js → schedule-service.startWorker` | B | Inicia fora de testes/porta 0; tick imediato via `background-task.js`, depois a cada 15 min | Não instanciar timer nem executar primeiro tick se B/worker fechados |
| `schedule-service.runRolling/processRule/publish/preview/changeState/withdraw` | B | Chamáveis internamente, com locks/transações | Guardas no serviço e nas entradas; negar chamada direta antes de conexão/lock/escrita |
| `scripts/run-scheduling.js` / `npm run schedule:run` | B | Execução manual alternativa ao worker | Mesma política, saída não zero sem tocar DB quando fechado; não basta bloquear HTTP |
| `server.js → backup-service.start` | Tec | Tick imediato/checagem horária; backup conforme idade/falha | Preservar quando configurado; alertar ausência/falha; não desligar com B/C |
| `scripts/backup.js`, `restore-backup.js` | Tec | Backup/verify e ensaio de restore separado | Não publicar na API; execução apenas em procedimento autorizado; sem rodar nesta fase |
| `auth.js` cleanup de attempts | Segurança | Intervalo de limpeza do limitador | Preservar; não é job B |
| `operational-health.js` probe/timeout/cache | Tec | SELECT 1 sob demanda | Preservar; sem consultas à agenda/prontuário |
| `server-lifecycle.js`, `background-task.js` | Tec | Drenagem/deadline/repetição | Encerrar somente tarefas realmente iniciadas; não acionar módulo B ao desligar |
| `scripts/sync-patients.js` | **C por vinculação potencial** | Sincronização de contas com cadastro de recepção | Bloquear no perfil MVP; validar efeitos de acesso antes de futura autorização |
| `scripts/setup-{journey,team,experience,scheduling,operations,consultations}.js` | B/C | DDL/cargas/setup operacional ou clínico | Fora do processo de startup/deploy MVP; política de CLI e confirmação própria em fase futura |
| `setup-database.js`, `setup-profiles.js`, `setup-admin.js`, `setup-specialties.js`, SQL legado/dados iniciais | Misto, risco de carga | Setup legado pode carregar fixtures e chamar outros setups | Não usar em produção; flags não bastam para neutralizar scripts legados que abrem DB diretamente |
| `initialize-empty.js`, baseline 001/002 | Tec/schema misto | Cria estrutura inclusive B/C, sem dados de negócio | Existir tabela não libera funcionalidade. Planejar schema separadamente; não executar agora |
| `seed-fixtures.js` | Teste | Barreiras para test/staging | Nunca produção; não alterar para facilitar lançamento |
| `bootstrap-admin.js`, `grant-admin.js`, `setup-access.js`, `setup-auth.js` | Credenciais/admin, alguns efeitos B | Scripts privilegiados, alguns legados | Procedimento separado e revisado; não são caminho público nem bypass de flags |
| `migrate-invitations.js`, `migrate-to-portuguese.js` | Migração | Alteração persistente | Sem execução nesta fase; produção requer plano próprio |
| `run-tests.js`, `validate-mysql-isolated.js` | Teste | Suítes e provisionamento descartável | Só em fase autorizada; não usar banco existente para provar isolamento |
| `conta.js`, `atendimento.js`, `profissional.js` | B | Polling de agenda aproximadamente a cada 30 s | Não criar timer nem requests em tela A; parar ao perder capacidade/sessão |
| `patient-tools.js` | B/C | ICS/relatório de atendimentos; print registro; geração de link-code | Fechar ações e não fornecer dados de origem |
| `consulta.js`, `profissional.js` | C/B | Impressão/exportação local de registro ou relatório | Sem rota própria; manter bloqueio de página/API e limpar DOM em logout |
| `service-worker.js` | Tec/A | Instala/atualiza caches de estáticos | Compatibilizar precache com flags; nenhum B/C via cache/offline/BFCache |

Desativação de B não altera regras de programação persistidas para pausadas nem remove dados. O worker deve simplesmente não executá-las. Mudança de flags por configuração requer reinício/drenagem controlados; nenhuma escrita fica autorizada apenas por estar em voo. Jobs externos de Windows Task Scheduler/serviços **NÃO VERIFICADO**: não há inventário do host nesta fase; exigir conferência antes de publicar.

## 8. Proposta de flags e estratégia de isolamento

Todos os nomes são propostas novas, ainda inexistentes. Valores estritos `true|false`; ausente = false; valor inválido impede startup. As configurações abaixo são globais por implantação, sem alteração por query/header/cookie, usuário ou banco. Não inferir ativação a partir de NODE_ENV, presença de credencial, `ativo` ou existência de dados.

| Flag proposta | Alias | Default | Condição para habilitar |
| --- | --- | --- | --- |
| `FEATURE_PUBLIC_CATALOG` | Cat | false | DTO/predicado de aprovação/contatos e consultas A isoladas aprovados |
| `FEATURE_CATALOG_ADMIN` | AdmCat | false | Admin autenticado; moderação/auditoria de A disponíveis |
| `FEATURE_AUTH` | Auth | false | Login/recuperação/admin validados; logout/revogação permanecem disponíveis como controle de segurança |
| `FEATURE_PATIENT_ACCOUNT` | Conta | false | Auth + confirmação de e-mail validada, conta A isolada |
| `FEATURE_EMAIL_VERIFICATION` | Email | false | Serviço de verificação implementado, entrega e tokens validados; flag não substitui testes |
| `FEATURE_PUBLIC_PATIENT_REGISTRATION` | Reg | false | Auth + Conta + Email; criação pendente e sem sessão de acesso até confirmar |
| `FEATURE_PROFESSIONAL_INTEREST` | CapP | false | Formulário mínimo, confirmação/limites, revisão e retenção |
| `FEATURE_CLINIC_INTEREST` | CapL | false | Mesmas condições, responsável identificado privadamente |
| `FEATURE_INVITATIONS` | Conv | false | Fluxo independente de INVITE_ONLY aprovado; não concede B/C ou publicação |
| `FEATURE_SCHEDULING` | B master | false | Fora do lançamento inicial; futuro aceite do Grupo B |
| `FEATURE_TEAM_OPERATIONS` | B equipe | false | Scheduling + Auth + escopos e isolamento validados |
| `FEATURE_OPERATIONAL_COMMUNICATION` | B comunicação | false | Scheduling + Team; envio/privacidade validados |
| `FEATURE_OPERATIONAL_REPORTS` | B relatórios | false | Scheduling + Auth; DTO sem conteúdo C se C fechado |
| `FEATURE_SCHEDULE_WORKER` | B worker | false | Scheduling + Team; serviço/CLI protegidos |
| `FEATURE_CLINICAL_RECORDS` | C master | false | Scheduling + Auth + aprovação específica C |
| `FEATURE_PATIENT_RECORD_LINKING` | C vínculos | false | Clinical + Team + Conta; identidade e escopos de todos os efeitos validados |

Perfil do lançamento: institucional sempre disponível; Cat/AdmCat/Auth/CapP/CapL só explicitamente true após aceite correspondente. Conta/Email/Reg permanecem false enquanto confirmação não for implementada/validada. Todas as flags B/C ficam false. Conv permanece false, preservado para futura opção aprovada. Não existe fase em que ligar flag compense código ausente ou inseguro.

Combinações incoerentes devem falhar na configuração, com nomes de variáveis e sem valores secretos: Reg sem Email/Conta/Auth; Conta sem Email/Auth; Team/worker sem Scheduling; Comunicação sem Team; Clinical sem Scheduling/Auth; vínculos sem Clinical/Team/Conta. `FEATURE_PUBLIC_CATALOG=true` **não depende de Scheduling**. Backup/health/logs são controles separados, sem dependência de B.

### 8.1 Aplicação das barreiras

1. Centralizar capacidades e classificação método/caminho/recurso. Validar configuração antes de iniciar listener/tarefas. Nenhum toggle fornecido pelo cliente é confiável.
2. Manter headers/logs/no-store; negar recurso desativado antes do handler, leitura de sessão do módulo, consultas SQL, envio de e-mail ou agendamento de tarefa. O classificador precisa seguir as mesmas regras de matching do Express (case, barra final, encoding e aliases), sem regex divergente que deixe bypass.
3. Colocar guarda antes de `homologation.catalogMiddleware`, allowlist HTML/JS e autorização que consulta o banco para B/C. Após passar a flag, manter integralmente Origin, requireUser/requireAdmin, papel, escopo, propriedade e troca obrigatória. Guardar flag não autoriza acesso.
4. Em recursos mistos, montar handlers A independentes e consultas/DTOs explícitos; nunca montar `operations.js` inteiro para conseguir users/state, ou `team.js` inteiro para conta. Manter as funcionalidades originais disponíveis em perfis futuros devidamente autorizados.
5. Aplicar guardas também em serviços que produzem efeitos e em CLIs; bloquear timers antes do tick imediato. Função chamada diretamente deve recusar execução antes de adquirir conexão ou lock.
6. UI recebe somente capacidades necessárias à apresentação; não expor diagnóstico interno ou flags operacionais. Ocultar ações e impedir polling/requests; API continua barreira decisiva contra cliente antigo ou modificado.
7. Manter backup/monitoramento e a integridade dos dados existentes. Não deletar B/C, não zerar registros nem carregar fixtures. Bloqueio de negócio não impede um backup técnico privilegiado das tabelas protegidas.
8. Tratar rollback/worker antigo/caches: só publicar versão que entenda o perfil fechado, reiniciar todos os processos e revisar agendamentos externos. Instância antiga fora da política invalida o aceite.

### 8.2 Contrato HTTP proposto

| Situação | Resultado |
| --- | --- |
| API B/C ou capacidade A desligada | **404**, JSON estável `{"error":"Recurso não encontrado."}`, `Cache-Control: no-store`; mesmo resultado para anônimo e todos os papéis |
| Página/JS exclusivo de módulo desligado | **404**, página genérica ou corpo vazio em HEAD; sem redirecionar para login, sem HTML protegido, sem fallback 200 |
| HEAD/OPTIONS/método alternativo no recurso fechado | 404; HEAD sem corpo; OPTIONS não anuncia Allow de rota desativada; não usar 405/501/redirect como desvio |
| Recurso ativo sem autenticação | API 401; páginas privadas podem redirecionar ao login seguro, preservando política atual |
| Recurso ativo com papel/escopo inválido | 403 ou 404 de objeto conforme política existente; não relaxar autorização |
| Perfil não aprovado/inativo/suspenso ou relação não publicável | Detalhe 404; busca/cidades/relacionados omitem sem contagem que revele pendentes |
| Filtro operacional em endpoint A (`disponibilidade`, `pagamento`, `convenio` não vazios no contrato atual de discovery) | 400 genérico de filtro indisponível, antes de SQL B; UI não envia tais filtros |
| Falha transitória de infraestrutura em recurso ativo | 503 apropriado, sem fingir capacidade desligada; 429 para limites, preservando Retry-After |
| Conta pendente no fluxo futuro de confirmação | Confirmação/reenvio com resposta genérica; tentativa de acesso a conta protegida negada, sem sessão autenticada concedida por pendência |

Malformed URL/JSON e limites de transporte podem produzir 400/413 antes de matching; isso não pode executar negócio ou revelar existência. Testes de 404 uniforme usam requisições sintaticamente válidas. Origin é obrigatório nas escritas ativas; negar antecipadamente uma rota fechada não deve transformar nenhuma escrita em rota ativa sem CSRF.

## 9. Contrato de dados públicos e privados

Allowlist de saída, não blacklist. Campos desconhecidos vindos do banco não entram automaticamente via spread/SELECT *. Identificadores públicos de perfil/local/taxonomia são necessários, mas não concedem propriedade. Não retornar `usuario_id`, pacientes, slots ou IDs de registros/eventos.

| Recurso | Campos anônimos permitidos após aprovação | Campos excluídos/restritos |
| --- | --- | --- |
| Profissional em lista | `id`, nome público (`name`/`nome`), título (`specialty`/`titulo`), `avatar_url` revisada, taxonomia pública | `next_available_at`, `distancia_km` sem cálculo validado, rating/review_count/avaliacao/quantidade_avaliacoes sem origem validada; IDs de usuário e dados de conta |
| Perfil profissional | Lista + `tipo_perfil`, biografia/descricao revisada, registro profissional público revisado, contatos explicitamente autorizados (`whatsapp`, `email_publico`, `site`, futuro telefone público), relacionados publicáveis | `usuarios.telefone`, `usuarios.email`, senha/hash, tokens, documentos/evidências de identidade, decisões/notas internas, dados de pacientes |
| Clínica/local em lista | `id`, `nome`, `tipo`, cidade/UF, endereço comercial aprovado; taxonomia pública | Agenda/horários/preços de slots, contatos de responsável, `next_available_at`, dados de recepção |
| Perfil clínica/local | Lista + descrição, CEP/endereço/numero/complemento/bairro revisados, contato público autorizado e relacionados aprovados | Endereço residencial/privado não autorizado, documentos, telefone/email do responsável, status/notas internas |
| Cidades | `cidade`, `uf` provenientes só de locais publicados | Cidade de rascunho/reprovado ou contagem de candidatos |
| Taxonomia | `id`, `nome`, `slug`, `grupo`, áreas com `id`, `nome`, `especialidade_id` | Opções inativas/não revisadas; não usar taxonomia para insinuar título verificado sem revisão |
| Relacionados | Profissional: id/nome/título/avatar/taxonomia aprovados; local: id/nome/endereço comercial aprovado | Relações com perfil suspenso/pendente; IDs de conta, contatos não autorizados, agenda |
| Interesse profissional/clínica | Apenas confirmação genérica de recebimento na própria submissão | Nenhuma lista pública de candidatos; nome de contato, e-mail, telefone e conselho ficam privados para revisão |
| Conta própria | `/auth/me`: identidade mínima própria; `/account`: nome/e-mail/telefone próprios | Nunca catálogo; não devolver senha, tokens hash, escopos desnecessários ou informações de outras contas |
| Health/environment | Status/capacidades públicas indispensáveis | Host/DB/porta interna, caminhos de backup, credenciais, estado de pacientes/agenda, lista interna de flags |

`particular`/`convenios` podem futuramente ser informação institucional aprovada, mas ficam fora do DTO inicial desta matriz para não reutilizar os filtros operacionais atuais. Horário comercial de estabelecimento, se necessário, é dado de diretório distinto de disponibilidade de consulta; não existe contrato aprovado aqui para divulgá-lo. Ratings/avaliações também ficam fora do MVP.

### 9.1 Exposição confirmada do telefone cadastral

Fluxo: **`usuarios.telefone → profiles.js:20–22 (SELECT com u.telefone) → res.json({...profile,...}) → GET /api/profiles/profissional/:id → perfil.js`**. Na tela, o bloco `if(data.telefone)` cria contato `tel:` e botão Ligar. Logo, a correção precisa alcançar seleção/DTO e renderização; esconder botão mantém a exposição na resposta.

`/api/places`, `/api/places/:id`, perfil de local e discovery de locais também retornam `locais_atendimento.telefone`; exigir evidência de autorização comercial para esse campo. Não presumir autorização porque um campo é chamado whatsapp/email_publico. O schema atual não registra autorização por campo. Dados privados continuam disponíveis apenas em handlers administrativos/conta com finalidade e permissão, sem migrar automaticamente para contato público.

## 10. Aprovação, revisão e publicação de perfis

### 10.1 Critérios obrigatórios

1. Candidatura identifica contato responsável e confirma titularidade do e-mail. Formulário inicial mínimo: tipo profissional/clínica, nome profissional/estabelecimento, e-mail de contato e cidade/UF; telefone opcional; sem anamnese, pacientes ou documentos sensíveis em campo livre.
2. Profissional: verificar identidade por processo documentado e registro/conselho/UF/situação quando aplicável; conferir especialidades/títulos divulgados. Categorias sem conselho precisam de critério explícito, não aprovação automática por ausência de registro.
3. Clínica: verificar existência/identidade do estabelecimento e legitimidade do responsável, endereço de divulgação e vínculos profissionais. Documentos e dados de responsável permanecem privados.
4. Revisor administrativo autorizado registra decisão, data, versão revisada e evidência mínima restrita; não publicar automaticamente após cadastro ou e-mail confirmado.
5. Contatos/endereço/foto/biografia/taxonomia têm revisão e autorização de divulgação por campo/finalidade; recusa/retirada elimina divulgação em todos os endpoints e relacionados.
6. Publicar somente versão aprovada e explicitamente marcada como publicada. Conta ativa e `perfil.ativo` continuam condições necessárias, mas insuficientes. Suspensão/revogação precisa retirar busca, detalhe, cidades e relacionados consistentemente.
7. Alteração sensível de identidade, registro, especialidade, responsável, contato, endereço ou biografia gera revisão. Preferir snapshot público da última versão aprovada enquanto rascunho é analisado; suspensão de segurança deve ocultar imediatamente até revisão. Não vazar o rascunho via join de `usuarios`.
8. Associação a clínica só aparece quando ambos os perfis e o vínculo estiverem aprovados. Publicação de perfil não cria equipe, agenda ou autorização clínica.

### 10.2 Estados propostos

`rascunho → pendente → aprovado → publicado`; rejeição leva a `reprovado` com motivo privado; revogação/suspensão remove publicação. Separar **estado de revisão** de **estado de publicação**, para evitar que `ativo=true` signifique verificado. Critério público central: conta ativa + perfil ativo + versão pública aprovada + publicação autorizada + sem suspensão; relacionados também satisfazem seus critérios.

Para quem já está cadastrado, ausência de evidência equivale a **não aprovado**, sem backfill automático de publicado a partir de `ativo=1`. Inventário/mapeamento desses registros será tarefa futura, sem usar dados reais nesta fase.

## 11. Mudanças de schema candidatas — não executadas

| Necessidade | Proposta a detalhar em migração futura | Regra segura de transição |
| --- | --- | --- |
| Confirmação de e-mail | Data de confirmação/estado de conta; tabela de verificações com token_hash único, finalidade/usuário, expiração, uso/revogação e índices | Existentes sem prova não ganham confirmação automática; não reutilizar reset/convite como comprovação implícita |
| Captação de interesse | Tabela própria para profissional/clínica, dados mínimos, estado, confirmação, responsável pela revisão, timestamps e retenção | Não criar diretamente perfil ativo/usuário com papel elevado; acesso privado |
| Revisão profissional/local | Estado de revisão, publicação/suspensão, aprovado_por/em, versão revisada e motivo privado | Default rascunho/não publicado; separar dos booleanos atuais |
| Snapshot/rascunho | Versões de conteúdo público aprovadas e rascunhos separados | Consultas públicas leem snapshot aprovado, inclusive nome e contatos; não JOIN em campos privados editáveis |
| Contatos autorizados | Telefone público separado de telefone cadastral; autorização por campo/valor/versão, origem/data/revogação | Sem autorização = omitido; não copiar automaticamente telefone cadastral |
| Conselho/identidade | Conselho, UF, número, status de verificação, evidência mínima restrita e revisor | Não expor documentos, data de nascimento ou identificadores desnecessários |
| Clínica/responsável/vínculos | Responsável privado; verificação do local e estado/revisão de associação profissional-local | Nenhum novo acesso de equipe/saúde decorrente da associação |
| Auditoria A | Eventos de candidatura, aprovação/publicação/suspensão, edição e autorização de contato | Não depender exclusivamente de agenda_eventos nem expor auditoria B/C no A |
| Convites opcionais | Avaliar se schema 003 atende finalidade/titularidade/consumo desejados | Preservar; separar flags/regras antes de ampliar produção |

Flags de implantação não precisam de tabela; mantê-las em configuração validada evita ativação acidental por UI/dado. Não é necessário remover tabelas B/C para isolá-las. Compatibilidade das migrations/checksums/backfill, rollback, FKs, índices, privilégios e retenção requer revisão posterior em banco descartável. Não editar baseline aplicada para introduzir novo schema.

## 12. Casos de teste obrigatórios para a implementação futura

Não executados nesta fase. Usar mocks para provar ausência de chamadas e integração em banco/instância descartável explicitamente isolada para provar ausência de efeitos. Testes existentes de autorização/negócio continuam válidos com capacidades explicitamente habilitadas em ambientes apropriados; não relaxar asserts para fazer o perfil MVP passar.

| ID | Caso | Evidência exigida |
| --- | --- | --- |
| T01 | Config ausente/false/valor inválido; combinações incompatíveis | Todas as capacidades de negócio fechadas por default; inválido falha antes de listener/worker |
| T02 | Cada método/caminho B/C desta matriz, todos os papéis e sessão legada | 404 uniforme; handler de negócio, DB do módulo e envio de mensagem não chamados; incluir admin |
| T03 | Aliases e matching | HEAD, OPTIONS, barras finais, case aceito pelo Express, encoding válido, query, `:id`, método inesperado e aliases P/T não contornam guardas; respostas sem Allow de módulos fechados |
| T04 | Montagens internas | `/api/account/link-code`, `/api/appointments/:id/history|record`, `/api/admin/operations|audit|place-settings|team-access`, `/api/templates` cobertos mesmo com AdmCat/Auth ativos |
| T05 | Cat ativo com B/C false | Busca/profissionais/discovery funcionam sem consultar disponibilidades/agendamentos/registros; SQL spy acusa qualquer consulta proibida; ordem e resultados independem de slots de teste |
| T06 | Filtros B em busca A | Parâmetros operacionais não vazios recusados antes de SQL B; sem semântica silenciosamente enganosa |
| T07 | DTO anônimo exato | Chaves permitidas por recurso; campos sentinela privados nunca saem; nem `next_available_at:null`, slots, códigos, dados clínicos ou campos novos de SELECT * |
| T08 | Telefone cadastral | Telefone privado distinto do público; API e DOM só mostram o público autorizado; revogação remove ambos os canais de divulgação; local também exige autorização |
| T09 | Aprovação/publicação | Pendente, reprovado, inativo, suspenso, não publicado e edição em revisão invisíveis por lista/ID/relacionados/cidades; snapshot aprovado permanece coerente |
| T10 | Conta/cadastro fechado | Register público e página cadastro negados; login admin, logout e troca de senha próprios continuam seguros; `next` não leva a B/C |
| T11 | Confirmação futura | Conta pendente sem acesso; token expirado/reutilizado/revogado ou de outro usuário recusado; reenvio limitado; reset não ativa e-mail; alteração de e-mail invalida comprovação; nenhuma publicação automática |
| T12 | Convites preservados | Conv false fecha emissão/lista/consumo aplicável; cenário de teste com convites habilitados mantém assinatura de finalidade, papel fixado, uso único, expiração/revogação; não ignora confirmação ou flags B/C |
| T13 | Worker desligado | Nenhum timer/tick imediato, conexão, GET_LOCK, SELECT ou INSERT de agenda; reinício/stop não aciona job; chamadas diretas de service/CLI recusadas com saída controlada |
| T14 | Worker futuramente habilitado | Só combinação válida inicia; preserva locks, transações, idempotência, escopos e drenagem; desligar não apaga/pausa dados por efeito implícito |
| T15 | Controles transversais | Backup/health/logs permanecem disponíveis conforme política técnica com B/C false; não expõem status/dados via rota B de indicadores |
| T16 | Páginas e scripts | Todas as páginas B/C e scripts exclusivos fechados; `/operacao.html?aba=usuarios` e `/profissional.html?aba=conta` não abrem exceção; root/estáticos não expõem backend/.env/SQL |
| T17 | Navegador A | Sem fetch/polling de B/C; nenhum botão de agenda, vínculo, print/ICS clínico; API nega mesmo com script antigo/modificado; navegação/refresh/deep-link seguros |
| T18 | PWA/cache/BFCache | Instalação não falha por precache de JS fechado; API/HTML/privados não aparecem offline, após logout, botão Voltar, outra aba ou rollback; cache antigo não restaura funcionalidade |
| T19 | Autorização de A | Anônimo/paciente/profissional/equipe não administram catálogo/usuários; admin não lê dados fora do A; propriedade da conta e CSRF/Origin/rate limit/cookies preservados |
| T20 | Efeitos persistentes | Antes/depois com fixtures em DB descartável: nenhum dado B/C muda por requests A/negados, reinício, CLI negada ou worker fechado; nenhuma mensagem operacional enviada |
| T21 | Não regressão futura B sem C | Endpoints mistos de histórico/relatório/status não devolvem evolução/receita ou ativam início/vínculo C; checagens de integridade clínica não são eliminadas por conveniência |
| T22 | Cobertura do inventário | Manifesto de rotas extraído/registrado com método/prefixo/alias; nova rota/página/job não classificada falha no check; comparação automatizada da matriz com montagem real em isolamento |
| T23 | Homologação | Matriz MVP também válida com middleware de catálogo fictício ativo; nenhuma resposta antecipada contorna flag, nenhuma disponibilidade fictícia vaza no A |
| T24 | Captação | Dados mínimos, limites e confirmação; resposta não revela candidato existente; sem autopublicação/elevação de papel, spam ou coleta clínica em campos livres |

## 13. Critérios de aceite

### Aceite desta P02.1 documental

- Rotas registradas diretamente, router `/api/admin`, aliases, submontagens de `team.js`, estáticos e métodos implícitos inventariados.
- Todas as páginas HTML, scripts associados, dependências mistas, workers/CLI e ações locais de impressão/exportação mapeados.
- Grupo A separado de disponibilidade operacional e dados privados; cadastro condicional e B/C fechados definidos sem exceção de administrador.
- Flags, contrato HTTP, DTOs, aprovação/publicação, testes e necessidades de schema definidos como propostas, sem implementação.
- Só este documento criado; aplicação, banco, credenciais, convites e Railway preservados.

### Aceite da futura implementação do isolamento

1. T01–T24 aprovados nos cenários aplicáveis, com inventário cobrindo todas as rotas/telas/jobs; nenhum endpoint novo sem classificação.
2. Perfil MVP com todas as flags B/C false: nenhuma execução de negócio B/C por HTTP, serviço, job ou CLI; backup técnico e health são exceções explícitas de proteção, não consultas de negócio.
3. Nenhum dado B/C ou contato privado nas respostas, ordem/filtros da busca, DOM, caches, logs públicos ou relacionados.
4. Moderar/publicar catálogo sem conceder acesso operacional, sem servir módulos mistos e sem depender de dados da agenda.
5. Cadastro fechado até verificação implementada/validada; conta A em tela própria sem agenda/vínculo; redirects seguros por capacidade.
6. Recursos desativados retornam contrato 404; autenticação, papel, propriedade, escopo, Origin e troca de senha continuam exigidos para os recursos ativos.
7. Evidências de ausência de efeito em banco descartável e em chamadas mockadas, além de testes reais de navegador/PWA; não aceitar só ocultação visual ou testes estáticos.
8. Nenhuma remoção de funcionalidade/dados/convites ou alteração Railway; reativação B/C exige nova aprovação e validação específica.

Passar no isolamento não autoriza produção: os demais bloqueadores Windows/IIS, banco, privacidade, backup e operação do relatório de auditoria continuam aplicáveis.

## 14. Ordem sugerida de implementação — após aprovação

1. **P02.2a:** criar manifesto central de recursos e configuração fail-closed; testar defaults, dependências e contrato HTTP.
2. **P02.2b:** aplicar guardas a rotas/páginas/scripts, submontagens e funções/CLI; impedir startup/tick do worker de agenda. Preservar logout, troca de senha, health/backup.
3. **P02.2c:** separar montagem administrativa A de `operations.js`/portal B, criar navegação/tela básica adequadas e eliminar redirects para B/C.
4. **P02.3a:** substituir consultas/DTOs públicos mistos por diretório puro; remover telefone cadastral e disponibilidade também de relacionados/ordenação/filtros.
5. **P02.3b:** detalhar schema aditivo/versionado de revisão, snapshot e autorização de contato; implementar aprovação consistente sem publicar registros existentes automaticamente.
6. **Etapa de contas/captação:** detalhar e implementar confirmação de e-mail, conta A e candidaturas mínimas; manter Reg/Conta/Cap false até validação de cada fluxo.
7. **Validação de isolamento:** executar matriz em mocks, DB descartável e navegador/PWA; revisar manifesto com montagem real e registrar evidências antes do laboratório IIS/publicação.

As etapas de schema, conta e captação podem exigir fases próprias do plano geral; não são autorizadas por este documento. Convites permanecem preservados e fechados por default até seu desacoplamento aprovado. Grupos B e C não serão ativados nesta sequência.

## 15. Encerramento

P02.1 entrega a definição de escopo e o contrato verificável para o isolamento. O código atual ainda não atende à matriz: busca depende de agenda, telefone cadastral é público, conta/telas administrativas misturam grupos e os módulos/jobs continuam montados. Nenhuma dessas mudanças foi aplicada nesta fase.

**Aguardar aprovação antes de iniciar P02.2 ou qualquer implementação.**
