# AVELU — P02.2b: integração efetiva do isolamento A/B/C

Data: 17/11/2026. Referências: [auditoria](FASE-PUBLICA-01-AUDITORIA-IIS.md), [matriz P02.1](FASE-PUBLICA-02-1-MATRIZ-MVP.md) e [infraestrutura P02.2a](FASE-PUBLICA-02-2A.md). Base do checkout: `71e8abd`, com alterações anteriores preservadas e sem commit.

**Guard HTTP integrado à aplicação e guardas de tarefas integrados ao serviço de programação e CLIs operacionais. Com flags ausentes, recursos de negócio permanecem fechados. Nenhuma publicação ou ativação pública foi realizada.**

## 1. Resultado e limites do aceite

O servidor usa `createCapabilityGuard(config.features)` antes de qualquer middleware que consulte identidade ou responda catálogo, health, HTML, arquivos ou APIs. Os 93 pares método/caminho foram exercitados na montagem real do servidor, com dependências de infraestrutura substituídas por mocks, cinco identidades fictícias e variações de método/caminho. Requisições negadas não executaram handlers de rota nem SQL.

O worker de agenda não é iniciado com sua flag false: não se chama `startWorker`, não se carrega a fábrica de timers para esse worker e não existe tick imediato. Chamadas diretas ao serviço e CLIs recusam operação antes de carregar banco ou adquirir conexão/lock. O desligamento não atualiza regras persistidas, não cancela reservas e não apaga dados.

**Não significa liberação do MVP:** DTOs públicos, dependências de disponibilidade na busca, confirmação de e-mail, aprovação/publicação de perfis, captação, navegação e PWA ainda têm pendências das fases anteriores. As respectivas flags continuam fechadas por padrão; não habilitá-las para contornar telas que agora retornam 404.

## 2. Arquivos desta fase

| Arquivo | Modificação |
| --- | --- |
| `server.js` | Monta guard global usando exclusivamente `config.features`; condiciona chamada de `startWorker` à flag validada |
| `schedule-service.js` | Torna importação inerte quanto a banco; introduz fábrica injetável e guarda todas as entradas operacionais antes de dependências/efeitos |
| `scripts/run-scheduling.js` | Valida capacidade antes de importar serviço/banco; exporta `main` testável; encerra pool apenas após entrada autorizada |
| `scripts/sync-patients.js` | Guarda `patient-sync` antes de importar banco; preserva sincronização existente para futura execução explicitamente autorizada |
| `tests/features-isolated.test.js` | Substitui teste de ausência de integração por prova da presença/ordem do guard; preserva demais assertions |
| `tests/isolation-mounted.test.js` | Novo: seis testes agregadores de montagem real, identidades, ausência de efeitos, serviço/CLI e configuração explícita dos testes legados |
| `tests/fixtures/app-isolated.js` | Novo: carrega servidor/módulos reais com DB em memória, processo/backup instrumentados, Express real e escuta somente em loopback/porta aleatória |
| `tests/require-test-database.js` | Configuração explícita de capacidades para cenários legados de negócio, somente depois de `assertDisposable` |
| `scripts/run-tests.js` | Inclui a suíte `isolation-mounted` no conjunto sem banco |
| `docs/deploy/FASE-PUBLICA-02-2B.md` | Este relatório |

Os arquivos de P02.2a e seus relatórios já existiam como alterações locais no início desta fase. `config.js`, `feature-config.js`, `resource-manifest.js` e `capability-control.js` não receberam mudanças adicionais nesta fase. Os relatórios anteriores foram preservados.

Não foram alterados handlers de autenticação, autorização ou negócio HTTP, SQL, migrations, schemas, páginas, navegação, `.env`, exemplos de ambiente, dependências, lockfile, Dockerfile ou Railway. A lógica SQL do serviço de programação foi mantida dentro da fábrica, com guardas nas suas entradas. Não houve conexão a banco real, uso de dados reais, deploy, instalação, commit, push ou alteração de DNS/IIS/servidores.

## 3. Ordem efetiva no Express

Ordem relevante em `server.js`:

1. Carregamento/validação de configuração, incluindo as flags fechadas por padrão.
2. Logging de requisição e Helmet.
3. Header de não armazenamento de HTML.
4. **`createCapabilityGuard(config.features)` na raiz da aplicação.**
5. Rotas técnicas de health.
6. Parser JSON e marcação de homologação.
7. Robots/environment e middleware de catálogo de homologação.
8. Política existente de papéis/páginas e consulta de sessão, quando permitidas pela capacidade.
9. No-store das APIs e controle de Origin nas escritas ativas.
10. Assets/allowlist de HTML/JS e demais arquivos.
11. Montagem existente de autenticação, conta, troca obrigatória, módulos administrativos/operacionais/clínicos e catálogo.
12. Fallbacks e tratamento de erros existentes.

Logging e headers permanecem presentes inclusive nas respostas negadas. O guard estabelece `no-store` e remove `Allow` ao negar. A API retorna 404 JSON genérico; arquivos/páginas retornam 404 texto; HEAD não tem corpo. Não há redirect de recurso fechado para login, exceção por administrador ou fallback 200.

O parser fica depois do guard: uma requisição a módulo fechado é negada sem processar seu JSON, mesmo se o corpo estiver malformado. Para capacidades ativas, o parser e o controle de Origin continuam no fluxo normal. Negação antecipada não cria escrita autorizada sem CSRF.

Recursos desconhecidos continuam fechados, inclusive arquivo novo em `/assets`, path/método não inventariado, nome de script backend, `.env` e URLs alternativas não correspondentes. HEAD usa classificação GET; OPTIONS de recurso fechado é negado antes da resposta automática do Express. Matching, aliases e tratamento conservador de encoding/case permanecem os aprovados em P02.2a.

## 4. Administração e módulos mistos

O guard antecede todas as submontagens existentes, incluindo `team.js → team-experience/team-scheduling/operations`. Assim, estar registrado no Express não significa estar acessível: cada método/caminho precisa passar pelo manifesto antes de chegar a qualquer handler ou consulta de sessão do módulo.

- `/api/account/link-code`, `/api/team/patients/:id/link` e `/api/appointments/:id/record` permanecem fechados pelo C.
- `/api/appointments/:id/history`, relatórios, indicadores, comunicação, recepção, disponibilidade e regras de programação permanecem fechados pelas respectivas capacidades B.
- `/api/admin/audit` continua fechado como rota mista operacional. Não foi criado substituto público nem liberado o módulo inteiro para acessar sua parcela administrativa.
- `/api/admin/users` e mudança de estado continuam classificados como A restrito, mas exigem flag de administração e autorização administrativa já existente. Essa classificação não libera nenhuma outra rota de `operations.js`.
- `operacao.html`, `profissional.html`, `agendamentos.html` e seus scripts mistos permanecem fechados com B/C desativados. `?aba=usuarios` ou `?aba=conta` não constitui exceção.
- Páginas institucionais e assets explicitamente inventariados continuam servidos. Não houve reestruturação visual do catálogo ou criação de tela alternativa.

Autenticação e autorização não foram substituídas pelo guard. Um caminho permitido pela capacidade segue exigindo papel, propriedade, escopo, senha atual e Origin conforme o controle original. Login, recuperação e troca de senha exigem `FEATURE_AUTH`; logout permanece como revogação técnica, inclusive quando o login está fechado.

Convites foram preservados, com suas rotas/cadastro ainda sujeitos ao manifesto e às regras existentes. Seu desacoplamento do cadastro/INVITE_ONLY não foi realizado. Nenhum convite foi emitido ou consumido em serviço externo nesta fase.

## 5. Workers, serviço e CLIs

### 5.1 Serviço de programação

`schedule-service.js` agora exporta `createScheduleService({pool, features, scope, startTask})`, sem criar timers ou importar `db` ao carregar o módulo. A fábrica só aceita o objeto validado por `feature-config`. As funções de transformação puras `summary` e `configOf` continuam disponíveis sem acesso a banco.

Entradas protegidas:

| Entrada | Guarda |
| --- | --- |
| `preview`, `publish`, `changeState`, `withdraw`, `location` | `assertTask('schedule-service', features)` |
| `runRolling`, `processRule`, `startWorker` | `assertTask('schedule-worker', features)` |

As dependências da flag worker exigem Scheduling, Team Operations e Auth. A capacidade de programação sozinha não autoriza processamento automático/manual de regras pelo worker.

A API de funções exportadas anteriormente foi preservada. Esses wrappers carregam configuração validada, executam a guarda e só depois resolvem `db`, escopo e `background-task`. Isso impede que chamadas fechadas alcancem `getConnection`, SELECT, GET_LOCK, transação ou gravação. Rejeição de capacidade é síncrona, com código `FEATURE_DISABLED`; os handlers Express tratam o erro no fluxo existente e a CLI usa `main().catch`.

Os métodos internos usam a configuração imutável da instância. Alterações de flags continuam requerendo reinício/drenagem, sem toggle por usuário ou query. A lógica existente de transações, locks, escopos, idempotência e reprocessamento não foi removida; sua execução habilitada em MySQL não foi ensaiada nesta fase.

### 5.2 Startup e comandos operacionais

No startup, `startWorker` só é chamado quando o servidor já satisfaz as condições originais de ambiente/porta e `config.features.FEATURE_SCHEDULE_WORKER === true`. Com false, o stop registrado é uma função inerte. Módulos de rotas podem importar a definição do serviço; isso não inicializa o worker nem seu timer.

`scripts/run-scheduling.js` valida `config.features` e chama `assertTask('schedule-worker', ...)` antes de importar serviço ou banco. Em recusa, termina com saída não zero no caminho CLI, registrando evento genérico sem credenciais; não tenta abrir/fechar pool que não foi inicializado. Em execução autorizada, mantém encerramento em finally.

`scripts/sync-patients.js` também é uma entrada operacional relevante na matriz: pode criar cadastros/unidades e associá-los a agendamentos. Foi integrado `assertTask('patient-sync', config.features)` antes de `require('../db')`. Com C/vínculos fechados, recusa antes de qualquer efeito; não foi executado contra banco.

Scripts privilegiados de instalação, carga, migração e concessão administrativa continuam fora do caminho HTTP/startup e não foram executados ou reestruturados. Não devem ser usados como alternativa aos guardas; permanecem sujeitos às restrições de produção documentadas na auditoria. Esta fase não os transforma em ferramentas de produção aprovadas.

### 5.3 Controles técnicos

- Backup mantém o startup/condições originais e não depende de Scheduling/Clinical.
- Health mantém liveness/startup/readiness; readiness usa probe técnico de conexão, sem consultar agenda/prontuário.
- A limpeza do limitador de autenticação permanece registrada, independente de B/C.
- Não houve escrita para pausar regras, cancelar consultas, desativar usuários ou apagar informações ao fechar capacidades.

Nos testes de montagem, o início do backup foi observado com stub para impedir acesso real; não foi criado backup nem iniciado cliente MySQL. Os testes isolados já existentes de criptografia/integração simulada continuaram passando.

## 6. Testes e evidências

Ambiente: Node 22.17.0 e Express 5.2.1 já instalados. Não houve instalação para igualar o Node fixado em 22.23.3; essa divergência de ambiente permanece registrada.

| Verificação executada | Resultado |
| --- | --- |
| `node --check schedule-service.js` | Aprovado |
| Suíte `tests/isolation-mounted.test.js` | Seis testes agregadores, aprovados no `npm test` final |
| `npm test` — conjunto completo classificado como sem banco | **111 aprovados, 0 falhas, 0 ignorados** |
| `git diff --check` | Sem erros de whitespace; avisos locais de LF/CRLF do Git |

### 6.1 Montagem real sem infraestrutura externa

O fixture carrega o `server.js` e módulos locais reais em um grafo de módulos isolado. Usa Express/Helmet reais, arquivos do checkout e HTTP somente em `127.0.0.1` com porta aleatória. Substitui banco por uma implementação em memória que recusa SQL não previsto, processo/lifecycle por doubles e backup por observador. Nenhuma conexão MySQL, transporte Resend, domínio ou serviço externo é disponibilizado pelo fixture.

O teste principal executa **93 pares × 5 identidades × 5 variantes = 2.325 requisições**, incluindo método original, uppercase/barra final/query, HEAD, OPTIONS e PATCH. As identidades são anônimo, paciente, profissional, equipe e administrador. Sessões fictícias válidas são restauradas entre casos para que a rota de logout, também parte do inventário, não transforme os casos posteriores em sessões expiradas.

Para cada requisição que o manifesto nega com defaults fechados, o teste exige:

- Status 404, sem Location ou Allow, com Cache-Control no-store.
- Corpo JSON genérico de API, texto genérico nos caminhos técnicos não API ou corpo vazio em HEAD.
- Nenhum incremento de chamadas SQL ou execução de handler de rota.
- Headers Helmet e identificador de requisição preservados.

As rotas técnicas sem flag de negócio não são falsamente tratadas como fechadas: health, robots, environment e logout conservam seu comportamento, incluindo a revogação de sessão em memória no logout.

### 6.2 Ordem, páginas e tarefas

- A asserção anterior de ausência de integração foi substituída por verificação da posição do guard antes de health, JSON, catálogo, política de sessão, arquivos e autenticação.
- Com homologação ativa e suas allowlists fictícias, `/api/cities`, perfis e disponibilidade fechados retornam 404 antes de resposta antecipada/consulta do middleware de homologação.
- JSON malformado em `/api/appointments` fechado retorna 404 antes do parser.
- Todas as entradas de arquivo B/C são negadas em GET, HEAD e OPTIONS; páginas mistas não abrem por query string, case alternativo ou barra final.
- Página inicial, sobre, ícone e service worker da homologação continuam retornando 200. Arquivos desconhecidos/backend não são servidos.
- No startup com defaults, não há importação de `background-task` para agenda, timer de 15 minutos ou tick de agenda. Backup é observado iniciado uma vez e o timer de limpeza do limitador continua presente.
- Factory e funções exportadas do serviço recusam entradas fechadas antes de acessar dependências proxy que falhariam em qualquer tentativa de banco/timer.
- CLIs de programação e sincronização recusam antes de importar banco/serviço. Caminhos permitidos da CLI de programação são testados apenas com mocks, incluindo execução e finally após falha.

### 6.3 Regressões de segurança

Com apenas Auth e administração do catálogo explicitamente habilitados no fixture, os módulos reais de autenticação foram testados contra usuários/sessões/senhas fictícios em memória:

- `/api/auth/me` identifica corretamente os quatro papéis autenticados.
- API administrativa ativa exige login (401) e rejeita paciente/profissional/equipe (403).
- Troca obrigatória de senha continua negando acesso administrativo.
- Origin externo em login é recusado; login válido produz cookie HttpOnly/Secure/SameSite=Lax.
- Cadastro público permanece 404 por sua flag false.
- Senha atual incorreta é recusada; troca válida revoga sessões da conta.
- Logout revoga a sessão correspondente e `me` passa a devolver null.
- Nenhuma operação desse cenário consulta tabelas de agenda, recepção ou registro clínico.

As flags true de testes foram usadas só em objetos/env fictícios para cenários explicitamente habilitados; não foi alterada nenhuma configuração persistida da aplicação.

## 7. Compatibilidade dos testes legados

Testes de negócio que exigem banco já começam por `tests/require-test-database.js`. Agora esse helper define explicitamente as capacidades necessárias **somente após** `assertDisposable(process.env)` aprovar NODE_ENV/APP_ENV test, nome/confirmacão de banco descartável, credenciais e demais barreiras existentes.

Não houve alteração de asserts de negócio, autenticação ou autorização dessas suítes para acomodar o bloqueio. Um teste isolado adicional prova que configuração comum é recusada antes de qualquer flag ser definida, e que o ambiente fictício descartável recebe combinação válida.

**As suítes com MySQL não foram executadas.** A alteração de configuração preserva o cenário habilitado para uma execução futura autorizada, mas não equivale a comprovar regressão integrada em banco. O runner sem banco não importa esse helper nos testes comuns; a verificação do helper usa somente objeto de ambiente fictício e validador puro.

## 8. Incompatibilidades e pendências

1. **Defaults agora têm efeito real:** login/conta/catálogo/admin/cadastro/convites e B/C que antes podiam funcionar sem FEATURE_* passam a ser negados quando suas capacidades estão ausentes. Isso é o comportamento fail-closed aprovado, não motivo para ativar flags automaticamente.
2. **Homologação sem flags de negócio também fecha os recursos:** suas allowlists/banner não concedem capacidade. Um cenário futuro de negócio precisa configuração explícita, banco descartável e aprovação correspondentes; não copiar os envs de teste para implantação.
3. **Catálogo ainda não é puro:** se futuramente habilitado antes das correções de DTO/SQL, handlers A ainda têm dependências de disponibilidade e telefone cadastral. Esta fase não os corrigiu nem habilitou; não existe aceite de ativação do catálogo nesta entrega.
4. **Administração visual permanece mista:** a UI atual ainda contém navegação para recursos fechados. Telas operacionais mistas continuam 404; nenhuma nova UI A foi criada para contornar essa restrição.
5. **PWA/cliente antigo:** APIs negam execução mesmo para JS antigo, mas precache/menu/redirects ainda não foram ajustados às capacidades. Em modo normal, precache pode falhar ao tentar obter script compartilhado fechado, como `conta.js`. Isso permanece pendência explícita, sem ativar script/módulo só para eliminar o erro. Cache/offline/BFCache em navegador real não foram validados nesta fase.
6. **Serviço Windows e jobs externos:** não foi inspecionado Windows Task Scheduler nem feita prova de reinício/SCM/IIS. Processos antigos sem o guard não são neutralizados por editar o checkout; uma implantação futura deve garantir uso da versão aprovada e reinício/drenagem de todas as instâncias.
7. **Restauração e backups reais:** observação do startup técnico e testes de componentes não comprovam backup externo/restauração operacional de produção.
8. **Matching/inventário:** continuam os limites da gramática e da extração textual documentados em P02.2a. Nova rota/método/asset não classificado é negado pelo guard; gramática nova requer revisão e atualização do manifesto/testes.
9. **Schema/dados:** nenhum estado persistido foi modificado. A preservação da lógica SQL foi revisada estaticamente; concorrência/idempotência do serviço habilitado em MySQL permanece não reexecutada nesta fase.

## 9. Critérios de aceite desta fase

| Critério | Evidência / estado |
| --- | --- |
| B/C fechados não executam rotas | Matriz montada, identidades fictícias, contador de handlers/SQL inalterado |
| Páginas/scripts B/C não são servidos | GET/HEAD/OPTIONS nas entradas do manifesto |
| Recursos desconhecidos fechados | Requisições de API, health não inventariado, arquivos/backend/assets novos |
| Sem worker/tick de agenda fechado | Startup instrumentado e guardas de serviço antes de timer/DB |
| CLIs operacionais sem efeitos quando fechadas | Mocks recusam importação de DB/serviço; guardas antecipadas comprovadas |
| Controles técnicos preservados | Headers/logging, health, backup observado, limpeza do limitador e revogação |
| Auth/autorização/Origin/senha preservados | Módulos reais com DB em memória; suítes isoladas existentes aprovadas |
| Suíte disponível sem banco aprovada | 111/111, zero skip |
| Sem ativação/publicação/mutação real | Nenhuma configuração persistida, banco ou infraestrutura alterada |

## 10. Encerramento

P02.2b concluída no escopo de integração e testes sem infraestrutura real. O isolamento está conectado aos caminhos HTTP e operacionais descritos; os defaults false agora impedem acesso e execução desses recursos.

Permanecem as pendências de dados públicos, cadastro/confirmacão, aprovação de perfis, navegação/PWA e infraestrutura do plano aprovado. **Não avançar para essas correções nem publicar sem nova aprovação.**
