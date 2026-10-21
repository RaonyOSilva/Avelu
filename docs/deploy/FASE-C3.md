# Fase C.3 — Homologação e acesso por convidados

## Escopo e situação

Implementação preparada para homologação; **não houve deploy**. O banco de desenvolvimento,
seu `.env`, as regras de agendamento e as rotinas de backup não foram alterados nesta fase.
Não houve commit ou push. A Fase C.4 depende de nova autorização.

## Funcionalidades

- `APP_ENV=staging` exige `HOMOLOGATION_MODE=true`. Produção recusa homologação,
  convites desta fase e listas de catálogo de homologação. Desenvolvimento mantém os padrões anteriores.
- Todas as páginas HTML servidas em homologação recebem o aviso
  **AVELU — HOMOLOGAÇÃO | Ambiente de testes. Não utilize dados reais.**
- Cabeçalho `X-Robots-Tag`, meta robots e `/robots.txt` bloqueiam indexação.
  Isso não substitui autenticação. O service worker de homologação não armazena páginas offline
  e remove caches antigos com prefixo `avelu-`.
- Administrador acessa `convites.html`: autoriza e-mail e perfil paciente, profissional ou equipe,
  acompanha situação e revoga convites. Não é possível convidar administradores.
- Token aleatório de 256 bits; somente SHA-256 persistido. Validade padrão de 48 horas,
  configurável de 1 a 168. Entrega exclusivamente ao e-mail autorizado via Resend.
  API e painel não devolvem o token. Falha no envio revoga o convite.
- O link usa fragmento `#convite=...`; o cadastro remove o fragmento do endereço e mantém
  o token em memória até o envio ao backend. Ele não entra no caminho HTTP ou no armazenamento local.
- Cadastro valida e-mail, perfil, envio, validade e situação do convite. Consumo e criação/ativação
  da conta ocorrem em transação, com bloqueio de linha. Duas tentativas simultâneas não criam duas contas.
- Perfis profissionais previamente cadastrados sem senha podem ser ativados pelo convite,
  preservando usuário e perfil. Convites não substituem senhas de contas já ativas.
- Equipe convidada começa sem vínculos. O administrador libera locais/profissionais pelo fluxo existente.
  Convite de profissional não concede acesso às agendas de outros profissionais.
- Login, logout, sessões e permissões existentes continuam sendo usados. Cadastro público sem convite
  permanece disponível no desenvolvimento padrão e é recusado na homologação.

## Vitrine pública

`HOMOLOGATION_PROFESSIONAL_IDS` e `HOMOLOGATION_PLACE_IDS` contêm IDs separados por vírgula,
exclusivamente de registros fictícios previamente revisados. Vazios significam vitrine vazia.
Listagens, perfis, relacionados e disponibilidades passam por filtro. Nomes, endereço, descrição
e imagem são substituídos por conteúdo de teste; contatos e registro profissional são removidos.
IDs, especialidades/áreas, cidades e horários permanecem para exercitar a navegação.
Não são devolvidos campos clínicos por esse filtro. APIs clínicas mantêm autorização própria.

O banco de homologação deve conter **somente dados fictícios**: esta projeção não é ferramenta
de anonimização de um banco real. A busca ainda consulta os campos dos registros fictícios originais;
seus termos podem diferir dos nomes substituídos exibidos. A filtragem após o limite da consulta pode
omitir IDs permitidos fora desse limite. Não importar uma cópia do banco local para contornar isso.

## Configuração

Além das variáveis MySQL/HTTPS/proxy documentadas na Fase C.2:

| Variável | Uso |
| --- | --- |
| `APP_ENV` | `staging` para homologação |
| `NODE_ENV` | `production` no servidor hospedado |
| `HOMOLOGATION_MODE` | `true` obrigatório em staging |
| `INVITE_ONLY` | `true`; não pode ser desabilitado na homologação |
| `INVITE_TTL_HOURS` | Validade em horas, padrão 48 |
| `HOMOLOGATION_PROFESSIONAL_IDS` | IDs fictícios permitidos |
| `HOMOLOGATION_PLACE_IDS` | IDs fictícios permitidos |
| `APP_ORIGIN` | Origem HTTPS exata, sem caminho |
| `RESEND_API_KEY` | Segredo de envio, somente no ambiente |
| `MAIL_FROM` | Remetente autorizado no serviço de e-mail |
| `DB_INIT_USER`, `DB_INIT_PASSWORD` | Credenciais temporárias de estrutura, nunca no processo web |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | Somente durante o bootstrap |

Não há fallback que mostre o link no console ou permita aceitar um convite não enviado.
Sem serviço de e-mail configurado, a emissão falha de forma controlada; desenvolvimento padrão
não depende dessas credenciais. Os testes substituem o transporte de e-mail em um processo
explicitamente descartável, sem serviço externo e sem envio real.

## Migração e ordem de preparação futura

Procedimento documentado para execução posterior autorizada em banco novo de homologação:

1. Provisionar banco independente e configurar identidade/credenciais conforme C.2.
2. Aplicar baseline `001-core.sql` e `002-modules.sql` pelo inicializador de banco vazio.
3. Se desejado e explicitamente autorizado, executar a carga fictícia C.2 **antes** de 003.
   A carga recusa banco com dados e exige confirmação. Suas contas técnicas `example.invalid`
   não recebem e-mails; não são contas pessoais de convidados.
4. Com credenciais de estrutura separadas, executar:

   ```text
   npm run db:migrate:invitations -- --confirm-database=avelu_staging
   ```

5. Conceder à conta de aplicação os privilégios DML necessários sobre `convites`, sem DDL.
   Remover `DB_INIT_USER` e `DB_INIT_PASSWORD` do ambiente do processo web.
6. Criar o administrador inicial conforme abaixo; configurar o transporte de e-mail e os IDs fictícios.
7. Iniciar a aplicação, entrar como administrador e emitir os convites. Autorizar vínculos de equipe
   pelo fluxo administrativo existente, depois de o convidado ativar a conta.

Substituir `avelu_staging` pelo nome exato configurado, se houver sufixo. Os scripts não carregam
automaticamente o `.env` local: precisam receber as variáveis no ambiente do processo.

`003-invitations.sql` cria somente `convites`, com chave estrangeira para usuários, hash único,
datas de envio/expiração/uso/revogação e índices. O aplicador verifica marcador de ambiente,
checksums das duas versões anteriores e usa trava de execução. Registra 003 em `avelu_migrations`.
Uma segunda execução válida não reaplica a estrutura. Tabela preexistente sem versão, checksum
divergente ou aplicação incompleta provocam recusa; não há reparo destrutivo automático.
DDL MySQL não é transacional: interrupção exige diagnóstico antes de nova tentativa.
Nenhuma migração é executada automaticamente ao iniciar o Express.

## Administrador inicial

Em processo separado de staging, configurar temporariamente `BOOTSTRAP_ADMIN_EMAIL` e
`BOOTSTRAP_ADMIN_PASSWORD` (senha única de 16 a 128 caracteres, guardada em gerenciador de senhas).
Usar a conta de aplicação, sem credencial administrativa de MySQL:

```text
npm run admin:bootstrap -- --confirm-database=avelu_staging
```

O comando valida ambiente/identidade, usa trava e transação, recusa qualquer administrador já
existente e armazena senha com scrypt. Não cria sessão. Remover imediatamente as duas variáveis
`BOOTSTRAP_ADMIN_*` após sucesso. Fazer login normalmente; nunca distribuir a senha do administrador
para convidados. O cadastro público e os convites não oferecem esse privilégio.

## Segurança e testes

Proteção CSRF continua baseada na origem exata em escritas, juntamente com cookies HttpOnly/SameSite
e Secure no ambiente HTTPS configurado. A autorização de módulos permanece no backend.
O envio é limitado a 30 solicitações/hora por administrador; cadastro usa o limitador existente.
As respostas não incluem hash/token de convite, e o transporte não registra mensagem ou credenciais.

Validações executadas nesta fase:

- `npm test`: **77 testes isolados aprovados**, sem conexão ao banco de desenvolvimento.
- MySQL descartável **8.0.42**, iniciado com `--no-defaults`, diretório temporário e porta exclusivos.
  O executor compara `@@datadir` ao diretório recém-criado **antes de qualquer escrita SQL**.
- Baseline: 29 tabelas; migração 003: 30. Versões/checksums, segunda aplicação sem efeito,
  preservação dos dados fictícios anteriores e recusa de segundo bootstrap validados.
- Persistência/recuperação de datas C.2: 1 teste aprovado no banco temporário.
- Integração C.3/acesso/compatibilidade: **11 testes aprovados**. Abrangem convite válido,
  expirado, revogado, reutilizado, concorrência, e-mail diferente, cadastro sem convite,
  elevação de privilégio, CSRF, sessão/login/logout, limite de tentativas, falha de entrega,
  ativação de perfil preexistente, bloqueios de módulos e cadastro local anterior.
- Profissional recém-convidado recebe 404 ao consultar atendimento de outro profissional
  e lista vazia de atendimentos próprios; paciente novo não recebe agendamentos de outros usuários.
- Projeção pública testada também para relacionados, horários, metadados e URLs codificadas.
- Última execução: diretório temporário `avelu-c2-4wuIxL`, porta exclusiva 57269;
  encerramento da instância confirmado pelo executor. Verificações de sintaxe dos módulos
  principais e `git diff --check` aprovadas (apenas avisos de conversão LF/CRLF do Git).

Comando de reprodução **somente para instância descartável**:

```text
node scripts/validate-mysql-isolated.js --confirm-isolated --phase-c3 --mysqld="C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe"
```

O executor encerra apenas o processo MySQL que criou. Artefatos temporários contêm exclusivamente
dados fictícios. Não executar testes de integração diretamente contra um banco existente.

## Arquivos desta fase

Criados:
`homologation-config.js`, `homologation.js`, `homologation.css`, `invitation-service.js`,
`invitation-routes.js`, `convites.html`, `convites.js`, `database/migrations/003-invitations.sql`,
`database/migrate-invitations.js`, `scripts/migrate-invitations.js`, `scripts/bootstrap-admin.js`,
`tests/invitations-isolated.test.js`, `tests/invitations.test.js`, `tests/registration-compat.test.js`,
`tests/fixtures/invitation-mail.js` e este documento.

Modificados:
`config.js`, `server.js`, `auth.js`, `access-policy.js`, `team-access.js`, `conta.js`, `workspace.js`,
`package.json`, `.env.example`, `config/environments/staging.env.example`, `scripts/run-tests.js`,
`scripts/validate-mysql-isolated.js`, `tests/config-isolated.test.js`,
`tests/database-isolated.test.js` e `README.md`.
O Git também mostra alterações anteriores de C.1/C.2 ainda não commitadas.

## Impactos e pendências

Desenvolvimento padrão continua com cadastro existente e sem banner, tabela de convites ou serviço
de e-mail obrigatórios. Staging passa a exigir a configuração explícita e a migração antes de usar convites.
O servidor local não foi reiniciado e seu banco não foi acessado para estas validações.

Antes de testes online: configurar domínio HTTPS, remetente autorizado, segredos, permissões MySQL,
IDs fictícios e validar entrega real. Não foram criados serviços nem realizados deploys.
A entrega real de e-mail, o proxy/TLS da Railway, a imagem Docker e a versão Node fixada
permanecem sem validação nesse ambiente; testes locais utilizaram Node 22.17.0.
Fazer revisão visual em navegador do banner/painel e regressão completa dos módulos com dados fictícios.

Limitadores em memória são por processo: múltiplas réplicas exigem armazenamento compartilhado antes
de uso amplo. Um link encaminhado pode transferir a prova de controle do e-mail; tratá-lo como segredo,
revogar quando necessário e usar validade curta. Não foi adicionada autenticação multifator.
Não há garantia de anonimização de entradas que um convidado digite: a operação de homologação deve
reforçar o uso de dados fictícios. Nenhum teste utilizou informações pessoais ou clínicas reais.

**Nenhum dado existente foi modificado. A Fase C.4 não foi iniciada.**
