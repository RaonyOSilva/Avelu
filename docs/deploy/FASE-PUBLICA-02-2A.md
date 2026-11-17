# AVELU — P02.2a: manifesto central e configuração fail-closed

Data: 17/11/2026. Referências obrigatórias: [auditoria](FASE-PUBLICA-01-AUDITORIA-IIS.md) e [matriz P02.1](FASE-PUBLICA-02-1-MATRIZ-MVP.md). Base do checkout: `71e8abd`.

**Infraestrutura central implementada e testada isoladamente. Guardas não integrados à montagem da aplicação. O sistema atual continua sem isolamento A/B/C efetivo e não está autorizado para publicação.**

## 1. Escopo entregue

- Manifesto explícito de **93 pares método/caminho**, expandindo aliases e prefixo `/api/admin`.
- **65 entradas de arquivos/caminhos estáticos**, incluindo `/`, 20 páginas HTML, scripts, estilos, manifest/worker e seis assets existentes. Nenhum wildcard autoriza assets novos.
- Seis entradas de tarefa: worker de agenda, serviço de agenda, sincronização de pacientes, backup, health e limpeza do limitador de autenticação.
- Dezesseis flags `FEATURE_*` com defaults fechados, validação estrita, dependências e resultado imutável.
- Classificação, avaliação de capacidade, middleware reutilizável de negação HTTP, guarda de tarefa e auditoria de registros desconhecidos.
- Testes sem banco ou serviços externos, incluindo transporte HTTP local e comparação com o Express instalado.

Nenhum handler de negócio, rota, navegação, página, convite, worker existente, SQL, credencial ou configuração Railway foi modificado. Não houve instalação de dependências, migration, conexão com banco, deploy, commit ou push. Os dois relatórios anteriores já estavam não rastreados e foram preservados.

## 2. Arquivos criados e modificados

| Arquivo | Alteração |
| --- | --- |
| `feature-config.js` | Novo: catálogo das flags/dependências e `loadFeatures(env)` puro |
| `resource-manifest.js` | Novo: recursos HTTP/estáticos e tarefas, com grupos, requisitos, origem e notas de revisão |
| `capability-control.js` | Novo: matcher limitado à gramática inventariada, avaliação, guardas HTTP/tarefa e auditoria de pendências |
| `tests/features-isolated.test.js` | Novo: 13 testes, com verificações parametrizadas de configuração, inventário e HTTP |
| `config.js` | Valida flags no início de `loadConfig` e retorna `config.features`; nenhuma guarda de rota foi montada |
| `scripts/run-tests.js` | Inclui a nova suíte na lista de testes isolados; lista de integração não alterada |
| `docs/deploy/FASE-PUBLICA-02-2A.md` | Este relatório |

Não foram alterados `server.js`, `.env`, exemplos de ambiente, package/lockfile, páginas, módulos de negócio, Dockerfile ou `railway.toml`.

## 3. Arquitetura do manifesto

`resource-manifest.js` exporta `resources` e `tasks`. Cada recurso contém `id`, `kind` (`api` ou `file`), `method`, `path`, `group`, `requires`, `source` e, onde necessário, `review`. Arrays e entradas são congelados; IDs duplicados impedem importação do manifesto.

Os 93 pares explícitos incluem infraestrutura, autenticação/conta, catálogo/admin, agendamentos, equipe/profissional, submódulos internos, comunicação, relatórios, clínico, vínculos e convites. Os caminhos de `router` já incluem `/api/admin`. Um alias é entrada própria, não uma regra implícita que libere o prefixo inteiro.

`source` indica os módulos de origem para revisão; não importa esses módulos nem carrega o banco. A classificação **não significa que o handler já esteja seguro para ativação**. Notas de revisão registram, entre outros, o catálogo com SQL de disponibilidade, o cadastro com ramo de convite, os scripts compartilhados e as projeções mistas de relatório/auditoria.

Decisões conservadoras para recursos mistos:

- Páginas de paciente/profissional que misturam B/C exigem Scheduling e Clinical; não há exceção por `?aba=conta`.
- `operacao.html` e `operations-ui.js` exigem operações de equipe, relatórios e vínculos clínicos. Permanecem fechados até a separação das telas. `?aba=usuarios` não cria uma alternativa pública.
- `GET /api/admin/users` e POST de estado são classificados como suporte restrito A, mas a montagem atual em `operations.js` ainda precisa ser separada na próxima fase.
- Conta e credenciais não usam a mesma capacidade: autenticação administrativa pode ser habilitada independentemente do cadastro/conta pública de paciente. Logout permanece sem flag de negócio como controle de revogação.
- Convites permanecem inventariados sob flag própria, sem remoção ou mudança de seu mecanismo atual. O ramo de consumo no cadastro ainda exige separação futura; não há bypass de registro público implementado aqui.

Backup/health/limpeza do limitador são tarefas técnicas sem dependência B/C. Essas entradas não constituem endpoints de download, execução remota ou acesso ao banco.

## 4. Flags implementadas

Todas aceitam somente as strings exatas `true` ou `false`; variável ausente resulta em false. String vazia, espaços, capitalização alternativa, números, booleanos JavaScript e null são inválidos. Não há leitura automática de `.env` no módulo novo.

| Flag | Dependências validadas |
| --- | --- |
| `FEATURE_PUBLIC_CATALOG` | Nenhuma dependência de agenda |
| `FEATURE_CATALOG_ADMIN` | AUTH |
| `FEATURE_AUTH` | Nenhuma |
| `FEATURE_PATIENT_ACCOUNT` | AUTH + EMAIL_VERIFICATION |
| `FEATURE_EMAIL_VERIFICATION` | Nenhuma; não implementa o fluxo por si só |
| `FEATURE_PUBLIC_PATIENT_REGISTRATION` | AUTH + PATIENT_ACCOUNT + EMAIL_VERIFICATION |
| `FEATURE_PROFESSIONAL_INTEREST` | Nenhuma; formulário/fluxo ainda ausentes |
| `FEATURE_CLINIC_INTEREST` | Nenhuma; formulário/fluxo ainda ausentes |
| `FEATURE_INVITATIONS` | AUTH |
| `FEATURE_SCHEDULING` | Nenhuma; reativação não autorizada nesta fase |
| `FEATURE_TEAM_OPERATIONS` | SCHEDULING + AUTH |
| `FEATURE_OPERATIONAL_COMMUNICATION` | SCHEDULING + TEAM_OPERATIONS |
| `FEATURE_OPERATIONAL_REPORTS` | SCHEDULING + AUTH |
| `FEATURE_SCHEDULE_WORKER` | SCHEDULING + TEAM_OPERATIONS |
| `FEATURE_CLINICAL_RECORDS` | SCHEDULING + AUTH |
| `FEATURE_PATIENT_RECORD_LINKING` | CLINICAL_RECORDS + TEAM_OPERATIONS + PATIENT_ACCOUNT |

Dependências são verificadas em conjunto, sem ativar automaticamente flags requeridas. `CATALOG_ADMIN → AUTH` e `INVITATIONS → AUTH` explicitam a necessidade de autenticação dessas operações restritas. As condições de negócio, entrega de e-mail, aprovação de perfil, identidade e privacidade continuam dependentes de implementação e aceite próprios.

Variáveis desconhecidas com prefixo `FEATURE_` também são recusadas; o diagnóstico usa `FEATURE_UNKNOWN`, sem imprimir o nome arbitrário ou valor. Erros conhecidos identificam as flags/dependências, sem valores de configuração. Não há exceção para homologação: seus controles de convite/ambiente existentes permanecem válidos, e as novas flags continuam false quando ausentes.

`config.js:loadConfig` chama a validação antes das demais configurações. No startup existente, essa chamada já ocorre antes dos imports de banco, `listen` e início de workers. Assim, valores inválidos impedem o startup, sem montar guardas ou alterar handlers. Flags válidas apenas produzem `config.features`; **não controlam ainda as rotas/workers existentes**.

O módulo mantém a identidade dos objetos validados em WeakSet. Os componentes recusam objetos arbitrários, incluindo cópias de flags ou objetos oriundos do cliente. Isso evita bypass por uma configuração incompleta construída ad hoc. Consumidores futuros devem utilizar o objeto retornado por `loadConfig`/`loadFeatures`, não serializar e reconstruí-lo.

## 5. Componentes e correspondência de caminhos

### 5.1 Interfaces

- `classify(method, target)`: retorna `classified` com recursos ou `pending` com motivo; não executa handlers ou autenticação.
- `evaluate(method, target, flags)`: acrescenta `allowed`; desconhecido, método não classificado, target inválido e configuração não validada resultam em false.
- `createCapabilityGuard(flags)`: exige configuração validada e gera middleware reutilizável. Quando permitido, chama `next()`; isso **não autentica nem autoriza** usuário algum.
- `deny(req, res)`: prepara resposta uniforme 404 e remove `Allow`.
- `assertTask(id, flags)`: recusa tarefa desconhecida/desabilitada com código `FEATURE_DISABLED`, antes de qualquer trabalho do consumidor.
- `auditRegistrations(registrations)`: recebe registros canônicos método/caminho e devolve desconhecidos como pendências. Não cria rotas nem ignora pendências automaticamente.

Nenhum desses guardas foi chamado por `server.js`, workers ou CLIs existentes. As chamadas de demonstração/teste ficam exclusivamente nas suítes isoladas.

### 5.2 Matching

O matcher aceita a gramática atual: segmentos literais e parâmetros nomeados simples. Sintaxe nova como wildcard/grupos opcionais é recusada na compilação e exige revisão, sem ampliar acesso silenciosamente.

- API: case insensitive e uma barra final opcional, como o Express padrão do projeto.
- Parâmetros: aceitam segmentos codificados, inclusive `%2F`, como os parâmetros Express; escapes inválidos não recebem autorização.
- Segmentos estáticos não são decodificados como se fossem parâmetros; `/api/%74emplates` não vira `/api/templates` por normalização inventada.
- Query string não altera classificação. Target com fragmento, barra invertida, controles ou URL absoluta fica pendente.
- Arquivos da allowlist: matching exato/case sensitive, refletindo o handler atual baseado em `Set`/`req.path`. Não aplicar automaticamente a semântica de router Express às páginas.
- Assets: lista explícita; permite decodificação de nome canônico, mas rejeita formas com dot segments/backslash. Essa escolha pode negar formas que o static normalizaria; é uma restrição conservadora documentada, não um caminho alternativo.
- HEAD usa a classificação GET, sem liberar rota exclusivamente POST. OPTIONS considera todos os métodos classificados naquele caminho e exige as respectivas capacidades; com recurso fechado, nega antes do OPTIONS automático do Express. Método não classificado permanece pendente mesmo com todas as flags true.

Não se depende de APIs internas do Express ou de pacote transitivo novo. O comportamento foi comparado ao Express instalado em servidor de teste loopback, para cada um dos 93 pares, com caminho literal, uppercase/barra final e query, além de exemplos de parâmetros codificados e caminhos que não correspondem.

Mudança de `case sensitive routing`, `strict routing`, prefixos, gramática de caminhos ou modo de publicação sob subdiretório exige revalidar o contrato antes de integrar. O guard global deve receber URL original na raiz; montagem sob prefixo diferente não foi autorizada nem comprovada.

### 5.3 HTTP desativado

- API: 404 JSON `{"error":"Recurso não encontrado."}`.
- Páginas/scripts/arquivos não API: 404 texto `Página não encontrada.`.
- Todas as negações: `Cache-Control: no-store`, sem `Allow` e sem redirect/fallback público.
- HEAD: o Express omite o corpo, mantendo status/headers apropriados.
- Papel, cookie ou header de cliente não habilitam capacidade; o guard não consulta identidade.
- Recursos permitidos continuam para os middlewares de autenticação, propriedade, escopo e Origin. Nada nesta fase substitui esses controles.

## 6. Testes executados

Ambiente observado: Node **22.17.0**, Express instalado **5.2.1**. A diferença para o Node 22.23.3 fixado pelo projeto continua pendência de ambiente; nenhuma instalação/atualização foi feita.

| Comando | Resultado |
| --- | --- |
| `node --test tests/features-isolated.test.js` | **13 aprovados, 0 falhas, 0 ignorados** |
| `npm test` | **105 aprovados, 0 falhas, 0 ignorados**, incluindo os 13 novos |
| `git diff --check` | Sem erros de whitespace; Git avisou sobre conversão futura LF/CRLF em `config.js` e `scripts/run-tests.js` |

As suítes existentes classificadas como isoladas foram executadas pelo runner atual. Elas usam memória, mocks, HTTP/HTTPS em loopback e arquivos temporários; não foi acionado o modo de integração com MySQL. O teste TLS existente executou sem skip. Nenhum serviço foi publicado na internet.

Cobertura nova:

1. Defaults false das 16 flags, validação estrita de cada tipo/valor inválido, congelamento e ausência de valores sensíveis nos erros.
2. Cada dependência, configuração válida completa e catálogo independente de Scheduling.
3. Validação via `loadConfig` e compatibilidade dos defaults de homologação/convites.
4. Igualdade dos 93 pares entre registros textuais existentes e manifesto; métodos/aliases/prefixos; unicidade e flags conhecidas.
5. Todos os HTML, arquivos da allowlist e assets existentes representados.
6. Recurso/método novo como pendência e negação, mesmo com todas as flags habilitadas no objeto fictício de teste; gramática não suportada recusada.
7. Case, barra final, query, parâmetros codificados, escapes inválidos e caminhos não canônicos.
8. Comparação diferencial com Express real para todos os pares inventariados.
9. Todas as rotas B/C fechadas com defaults em seus métodos, HEAD, OPTIONS e método alternativo; handler downstream de efeitos nunca chamado.
10. Páginas/scripts mistos, abas via query e arquivos desconhecidos sem redirect, Allow ou corpo em HEAD.
11. Capacidade permitida não contorna autorização downstream; marcador de papel administrador não abre B/C.
12. Tarefas desconhecidas/B/C fechadas; tarefas técnicas independentes e configuração falsa recusada.
13. Ausência de montagem dos novos guardas em `server.js`.

Flags true foram usadas exclusivamente em objetos fictícios dentro dos testes para avaliar dependências/matching. Nenhuma variável persistida ou configuração da aplicação foi habilitada.

## 7. Limitações e riscos

1. **Bloqueio ainda não integrado:** a aplicação real mantém handlers e workers antigos montados. Não interpretar os defaults false retornados pela configuração como bloqueio efetivo das funcionalidades atuais.
2. **Conteúdo misto não corrigido:** SQL de disponibilidade no catálogo, telefone cadastral público, cadastro sem confirmação, DTOs, redirects e navegação permanecem como antes. Ligar uma flag no futuro sem concluir essas correções não será seguro.
3. **Inventário estático tem limites:** o teste reconhece chamadas atuais `app`/`router` com literais/arrays, compara conjuntos, sinaliza nova sintaxe de registro e prefixos literais não revisados. Não é parser JavaScript universal nem inspeção da montagem runtime. Um novo padrão de router, registro por reflexão, alias de variável ou middleware que responde sem `app.get` exige auditoria explícita e atualização da ferramenta. A negação runtime de desconhecidos é a barreira complementar prevista para P02.2b.
4. **Matching propositalmente limitado:** não há suporte automático a wildcard/grupos opcionais ou normalização permissiva. Mudanças de Express/opções precisam repetir a comparação diferencial e revisar variantes.
5. **Configuração vs. aprovação:** flags não verificam identidade profissional, autorização de contato, e-mail entregue, conformidade ou parecer de segurança. Valores true não são aceite de lançamento.
6. **Objeto validado em memória:** cópias/deserialização não são aceitas pelos guardas; consumidores precisam receber a referência validada, inclusive em testes e processos separados.
7. **Convites:** inventariados e preservados; consumo ainda compartilha register e regras de INVITE_ONLY/homologação. Desacoplamento não foi feito.
8. **HTTP/CLI/jobs reais:** ausência de efeitos foi comprovada nos componentes isolados com downstream de teste, não nos handlers ou bancos reais. Worker/CLI ainda não chamam `assertTask`.
9. **Infraestrutura não validada:** nenhum teste com IIS, banco real, serviço Windows, navegador real, jobs externos, DNS ou entrega de e-mail. Esses itens continuam **NÃO VERIFICADOS** nesta fase.
10. **Próxima integração:** o teste que hoje exige ausência de guard no `server.js` deverá ser substituído por prova de ordem de montagem antes de aplicar o isolamento. Não removê-lo sem introduzir a comprovação correspondente.

## 8. Integração planejada para P02.2b — não executada

1. Revisar manifesto como contrato aprovado, preservar autenticação/autorização e decidir montagem separada dos handlers/telas mistos. Não montar `operations.js` inteiro para obter apenas users/state do A.
2. Usar `config.features` já validado. Montar guard global na raiz após controles transversais seguros de headers/logs, **antes** de `homologation.catalogMiddleware`, política que consulta sessão, respostas de estáticos e qualquer handler B/C. Verificar ordem de parser e respostas antecipadas, sem enfraquecer Origin nos recursos ativos.
3. Manter logout/revogação, troca de senha, health e backup técnicos. O guard de capacidade só permite prosseguir: requireAdmin/requireUser, propriedade, escopos e troca obrigatória continuam sendo exigidos.
4. Impedir criação do timer e tick imediato de agenda quando desligado; chamar guarda nas funções de serviço/CLI antes de conexão, lock ou efeito. Não mudar estados persistidos nem apagar dados como efeito de desligar flag.
5. Bloquear todas as páginas/scripts exclusivos e as variantes HEAD/OPTIONS de recursos fechados; ajustar posteriormente precache, navegação e redirects conforme a fase autorizada. Cliente antigo precisa continuar incapaz de executar B/C.
6. Fazer testes de montagem real em ambiente isolado, sem DB existente: guardas precedem respostas de homologação/estáticos/auth de módulo fechado; desconhecidos continuam negados; conjunto real de rotas/middlewares corresponde ao manifesto.
7. Separar DTO/SQL públicos, confirmação de e-mail, moderação e captação nas respectivas fases. Não ativar Cat/Reg/Conta/Cap apenas para tornar telas antigas funcionais. Não criar endpoints futuros fora do inventário para contornar negação.
8. Atualizar critérios de aceite com evidências de ausência de chamadas/efeitos em mocks e, em fase autorizada, banco descartável e navegador/PWA. Ainda serão necessários os demais aceites Windows/IIS/privacidade/recuperação.

## 9. Encerramento

P02.2a concluída no escopo autorizado: manifesto/configuração/componentes reutilizáveis e testes isolados, com validação antecipada das flags. Nenhuma integração do bloqueio às rotas ou tarefas existentes foi iniciada.

**Publicação permanece bloqueada. Aguardar aprovação antes de iniciar P02.2b.**
