# Fase D — Validação integrada e preparação para Linux/Railway

Data: 20/10/2026. **Validação Windows concluída; validação Linux e visual pendentes. Não liberar publicação com base apenas nestes resultados.**

## 1. Ambiente e limites

- Windows, PowerShell; Node.js 22.17.0 e npm 10.9.2 instalados.
- Oracle MySQL 8.0.42, executado em processo exclusivo, com diretório temporário e porta aleatória.
- Docker ausente no PATH e no caminho padrão verificado. Nenhuma instalação foi realizada.
- Dockerfile aponta para `node:22.23.3-bookworm-slim`. Essa versão/imagem **não foi executada nem construída** nesta fase.
- A ferramenta de navegador retornou inventário vazio. Não houve inspeção visual nem teste em navegador real.
- OpenSSL já disponível com o Git foi usado exclusivamente para gerar certificado temporário de teste HTTPS.
- Nenhum deploy, recurso externo, envio de backup, commit ou push. Nenhum teste conectado ao banco de desenvolvimento.

## 2. Arquivos desta fase

| Arquivo | Alteração |
| --- | --- |
| `scripts/validate-mysql-isolated.js` | Modo `--phase-d`, incorporando C.2–C.4 e seis suítes de regressão; banco e conexão exclusivos por suíte; preparação do catálogo fictício/estático; caminhos explícitos opcionais dos clientes MySQL. |
| `scripts/run-tests.js` | Classifica o novo teste HTTPS como isolado. |
| `tests/https-isolated.test.js` | TLS real local, autenticação real com persistência simulada em memória, flags dos cookies, HSTS, CSP e invalidação da sessão. |
| `docs/deploy/FASE-D.md` | Evidências, limitações e roteiro de homologação Linux e visual. |

Os demais arquivos pendentes no Git já pertenciam às fases anteriores. Nenhuma regra de negócio ou migração foi alterada nesta fase.

## 3. Isolamento e segurança dos testes

O executor inicia `mysqld --no-defaults` com datadir novo, sem utilizar o serviço MySQL instalado. Antes da primeira escrita, compara `@@datadir` com o diretório temporário criado. As conexões de preparação da regressão repetem essa verificação.

Cada banco recebe nome aleatório `avelu_test_*`, `APP_ENV=test`, `NODE_ENV=test`, `DB_DISPOSABLE=true` e confirmação explícita do nome. Credenciais temporárias são geradas em memória. Cada suíte de regressão recebe banco e conta próprios; as contas das suítes antigas têm DDL somente naquele banco porque seus preparadores criam estruturas. Isso **não é** o modelo de privilégios da aplicação em produção. As verificações C.2–C.4 usam separadamente conta de aplicação restrita e comprovam recusa de DDL e alteração de metadados.

A restauração tem banco e usuário exclusivos, valida o datadir, privilégios e banco vazio; uma segunda restauração é recusada. Somente dados fictícios e catálogo de especialidades sem dados pessoais são carregados. Não se utiliza `scripts/setup-database.js` nem dump do desenvolvimento.

O processo MySQL criado pelo executor é encerrado em `finally`. Os diretórios temporários com dados fictícios são mantidos para inspeção; não constituem backups operacionais e não devem ser enviados ao Git. Não foi necessário apagar diretórios de terceiros.

## 4. Resultados executados

Contagens abaixo seguem o TAP do Node, incluindo testes agregadores das suítes.

| Grupo | Aprovados | Reprovados | Ignorados |
| --- | ---: | ---: | ---: |
| `npm test` — isolados, incluindo HTTPS | 90 | 0 | 0 |
| MySQL: persistência de datas/Brasília | 1 | 0 | 0 |
| Convites, acesso e cadastro compatível | 11 | 0 | 0 |
| Operação C.4, backup e HTTP | 6 | 0 | 0 |
| Administração | 13 | 0 | 0 |
| Autenticação e agendamento | 13 | 0 | 0 |
| Experiência: remarcação/histórico/lista de espera | 6 | 0 | 0 |
| Operações: fila/pacientes/administração | 6 | 0 | 0 |
| Publicação e motor de agendas | 6 | 0 | 0 |
| Equipe e permissões | 10 | 0 | 0 |
| **Total** | **162** | **0** | **0** |

### Evidências e reprodução Windows

Comando da regressão completa (somente executável local, nenhum serviço existente):

```powershell
node scripts/validate-mysql-isolated.js --confirm-isolated --phase-d '--mysqld=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe' '--mysql=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' '--mysqldump=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe'
npm test
```

Logs locais da sessão: `%TEMP%\avelu-phase-d-isolated.log`, `%TEMP%\avelu-phase-d.log` e `%TEMP%\avelu-phase-d-final.log`. A rodada completa anterior aos parâmetros opcionais usou `avelu-c2-1JlDVz`, porta 56073, com 72 testes aprovados e encerramento confirmado. O backup fictício dessa rodada tinha 48.588 bytes e a restauração validou 30 tabelas e contagens das entidades principais. Os logs não são necessários à aplicação e não foram adicionados ao repositório.

A rodada final, incluindo os caminhos explícitos de clientes, repetiu as 72 aprovações em `avelu-c2-n00NM3`, porta 62291; o log confirma a checagem de `@@datadir` e o encerramento da instância. `node --check scripts/validate-mysql-isolated.js` e `git diff --check` também concluíram sem erros (somente avisos de conversão LF/CRLF no Git).

### Falhas encontradas e corrigidas

Na primeira execução, a suíte administrativa pressupunha um catálogo de especialidades completo, enquanto a carga mínima C.2 tinha apenas uma especialidade fictícia. O executor agora prepara o catálogo estático antes dessa suíte. Os testes de negócio não foram relaxados.

A reutilização da conexão de preparação entre bancos causou colisão de versão de migração: statements preparados permaneciam associados ao schema anterior. Cada banco agora recebe conexão dedicada. O erro ocorreu exclusivamente em bancos descartáveis.

O modo D foi ajustado para incluir explicitamente a suíte operacional C.4. As três correções foram seguidas de nova regressão completa aprovada. Caminhos opcionais `--mysql` e `--mysqldump` permitem instalações Linux onde o servidor está em `/usr/sbin` e os clientes em `/usr/bin`; a execução em Linux continua pendente.

## 5. HTTP, HTTPS e segurança

- Servidor Express real iniciado em porta atribuída pelo ambiente nos testes de integração.
- Health startup/live/ready, CSP, `nosniff`, `no-store`, API protegida e recusa de `.env`, `server.js` e SQL internos aprovados.
- Validação de configuração verifica portas, interface de rede e confiança restrita em proxy; teste HTTP verifica que somente proxy autorizado influencia `req.secure`.
- Convites e autenticação exercitam origem/CSRF, ausência de autenticação, papéis, reutilização, expiração, revogação e limitação de tentativas.
- O teste HTTPS usa transporte TLS real com certificado temporário e CA explícita no cliente, mantendo `rejectUnauthorized=true`. Não se desativa validação TLS.
- O módulo real de autenticação emite cookies de produção e invalida a sessão após logout. O banco desse teste específico é um objeto em memória; não é prova de integração TLS com MySQL nem do proxy Railway.
- HSTS e CSP foram verificados sobre HTTPS. O tratamento de cookies pelo navegador e a cadeia HTTPS/proxy real ainda precisam de validação online autorizada.
- Encerramento ordenado/deadline e falhas transitórias são testados isoladamente. Encerramento de processos no Windows **não comprova** a semântica de SIGTERM no Linux.

## 6. Backup e rotinas

No Windows, `mysqldump` real, criptografia, integridade, restauração em MySQL vazio, recusa de destino incorreto/não vazio e contagens restauradas passaram. Testes isolados cobrem corrupção, truncamento, chave incorreta, limpeza de saída inválida e falhas no recibo de cópia externa simulada. Nenhum backup foi enviado para serviço externo.

Motor de agenda: execução, concorrência por lock, idempotência, interrupção com rollback, reprocessamento após reinício e suspensão por permissão revogada passaram em MySQL descartável. O worker isolado cobre falha transitória e drenagem. Falha real de rede entre containers e SIGTERM durante trabalho em Linux permanecem pendentes.

**Bloqueio identificado:** o Dockerfile atual não instala clientes Oracle MySQL 8. Não foi verificada disponibilidade de `mysql` ou `mysqldump` dentro de uma imagem construída. Instalar cliente MariaDB por conveniência não comprova compatibilidade com as opções do dump. Antes da publicação, preparar e validar a instalação de clientes MySQL 8, origem e versão dos pacotes e permissões do volume de backup. Isso não foi feito às cegas sem Docker disponível.

## 7. Roteiro posterior em Linux isolado — não executado

Executar somente em máquina/runner autorizado, com cópia do código sem `.env`, dados reais ou credenciais reais. Não usar o banco local nem criar serviços Railway nesta fase.

1. Disponibilizar Node fixado, npm e Oracle MySQL 8 compatível (servidor e clientes), OpenSSL e Docker. Verificar versões e procedência dos binários. Usar usuário Linux sem privilégios para a instância descartável.
2. Instalar dependências com `npm ci`; registrar saída e versão efetiva do Node. Executar:

```sh
npm test
node scripts/validate-mysql-isolated.js --confirm-isolated --phase-d \
  --mysqld=/usr/sbin/mysqld --mysql=/usr/bin/mysql --mysqldump=/usr/bin/mysqldump
```

Os caminhos são exemplos e devem corresponder aos binários Oracle MySQL da máquina. O executor recusa caminhos relativos e verifica o datadir antes das escritas. Não execute como root; o `mysqld` requer usuário apropriado. Confirmar zero testes ignorados, especialmente o HTTPS.

3. Construir a imagem existente; se faltar cliente MySQL, corrigir o empacotamento e repetir a construção:

```sh
docker build --no-cache -t avelu:phase-d .
docker run --rm --entrypoint sh avelu:phase-d -c 'node --version; id; command -v mysql; command -v mysqldump'
docker run --rm --entrypoint sh avelu:phase-d -c 'test ! -e /app/.env && test ! -d /app/.git && test ! -d /app/.backups'
```

Inspecionar também todas as camadas com ferramenta apropriada para segredos: a exclusão de três caminhos não substitui auditoria completa. `.dockerignore` já exclui `.env*`, chaves, dumps, logs e backups; confirmar que nenhum outro arquivo contém dados reais antes do build.

4. Em rede Docker dedicada e bancos fictícios, iniciar a imagem com configuração de teste explicitamente descartável e identidade de ambiente inicializada. Seguir C.2/C.3 para schema, convites e administrador fictício. Não reutilizar credenciais reais. Testar o CMD e `npm start`, porta atribuída, bind `0.0.0.0`, health e acesso negado a arquivos internos.
5. Enviar SIGTERM real ao container durante requisição e processamento; verificar drenagem, saída limitada, rollback e reprocessamento sem duplicação após reinício. Interromper somente o MySQL descartável e verificar readiness 503, liveness independente e recuperação.
6. Montar volume dedicado com propriedade compatível com UID/GID de `node`; validar escrita, backup, restauração em segundo banco vazio, temporários e persistência após recriar o container. Não enviar cópias externas nessa validação.
7. Colocar proxy HTTPS local autorizado à frente do container; configurar somente sua rede em `TRUST_PROXY`, confirmar origem, cookies, CSRF e rejeição de cabeçalhos forjados por outros clientes. Não usar confiança irrestrita para contornar falhas.

Esses comandos constituem um roteiro, não evidência de execução. O Dockerfile exclui testes: as suítes são executadas no checkout isolado; smoke tests e backup também devem ocorrer na imagem final para comprovar seu empacotamento.

## 8. Checklist visual manual — não executado

Usar somente contas e registros fictícios; testar em 360, 768 e 1440 pixels, teclado e zoom de 200%.

| Área | Verificações |
| --- | --- |
| Inicial e busca | Banner de homologação, somente catálogo fictício, cidade/especialidade, estados vazios, imagens e fontes. |
| Perfil e agendamento | Local/data/horário coerentes, login de paciente, confirmação, indisponibilidade concorrente. |
| Cadastro/login/convite | Token válido/inválido/expirado, erros legíveis, origem, e-mail convidado, papel fixado e logout. |
| Cliente | Próximos atendimentos, histórico, somente dados próprios e ausência de menus de equipe. |
| Profissional | Agenda por data/local, agrupamento, relatórios e atendimento clínico fictício; impressão em janela real. |
| Recepção | Publicação, confirmação, cancelamento, remarcação, fila e vínculos autorizados. |
| Administração/convites | Restrições, criação/revogação de convite e respostas de erro. |
| Todas as páginas | Console sem erros; rede sem falhas; CSP sem bloquear scripts legítimos; foco e formulários funcionais; sem rolagem horizontal indevida. |
| PWA e sessão | Atualização do worker, caches antigos, offline sem dados clínicos, logout em múltiplas abas, botão Voltar/BFCache sem reapresentar dados protegidos. |

Em homologação, o worker é deliberadamente substituído por limpeza dos caches Avelu. Testar também o comportamento PWA normal no ambiente de teste correspondente. Testes estáticos/VM existentes não substituem essa verificação visual e de armazenamento no navegador.

## 9. Checklist impeditivo para Railway

- [ ] Construir e executar imagem Linux com a versão Node fixada; comprovar `npm ci`, usuário não root e ausência de segredos.
- [ ] Disponibilizar clientes MySQL 8 na imagem e validar backup/restauração Linux.
- [ ] Concluir roteiro Linux, SIGTERM, falha de rede, volume e checklist visual.
- [ ] Definir volume persistente de backup e seu proprietário; não depender do filesystem efêmero.
- [ ] Definir rede privada, banco independente de homologação, conta runtime mínima e credencial separada de inicialização.
- [ ] Configurar `APP_ENV=staging`, modo homologação/convites, origem HTTPS e proxy restrito conforme C.1–C.3; não copiar `.env` local.
- [ ] Definir TLS do MySQL conforme rede utilizada; não desativar validação para contornar certificados.
- [ ] Criar administrador pelo procedimento separado C.3 somente após autorização, e permitir catálogo exclusivamente fictício.
- [ ] Configurar e validar serviço de e-mail antes de convidar usuários reais; nenhum serviço foi criado nesta fase.
- [ ] Começar com uma réplica: limitadores em memória não são distribuídos. Rever estratégia antes de escalar horizontalmente.
- [ ] Definir monitoramento de readiness além do startup usado pelo `railway.toml`; revisar retenção e cópia externa antes de uso operacional.

## 10. Encerramento

Os testes disponíveis no Windows foram concluídos, com 162 aprovações. Não é possível afirmar que o objetivo de funcionamento fora do Windows foi comprovado. A Fase D permanece com aceite Linux/visual pendente e publicação bloqueada pelos itens acima.

Nenhum dado existente foi alterado: todas as escritas de validação ocorreram em instâncias/bancos descartáveis criados nesta execução ou em memória/arquivos temporários de teste. Não houve migração no desenvolvimento, deploy, serviço externo, commit ou push. A Fase E não foi iniciada e depende de nova autorização.
