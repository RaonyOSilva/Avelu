# Avelu — preparação de execução (Fase C.1)

Esta fase prepara arquivos; não publica o sistema e não executa migrações.

## Execução e configuração

Node fixado em 22.23.3 LTS em package.json, package-lock.json, .nvmrc e Dockerfile.
Os comandos npm start e npm run dev continuam disponíveis. A imagem executa
node server.js diretamente para que o processo receba SIGTERM, sem intermediário npm.
Ela usa usuário não privilegiado e instalação npm ci baseada no lockfile.

loadConfig valida antes de carregar o banco e os serviços. Em desenvolvimento,
os padrões locais anteriores são mantidos. O arquivo .env existente não foi alterado.
APP_ENV aceita development, test, staging, homologacao e production.
Em homologação, produção ou Railway, NODE_ENV deve ser production; DB_HOST,
DB_USER, DB_PASSWORD, DB_NAME, APP_ORIGIN e TRUST_PROXY devem estar explícitos.
O usuário root não é aceito nesses ambientes. Credenciais não são exibidas nos erros.
O usuário de banco de privilégio mínimo deverá ser provisionado em fase autorizada.

PORT é fornecido pela plataforma; HOST assume 0.0.0.0 em hospedagem.
APP_ORIGIN deve ser a origem HTTPS exata, sem caminho ou barra final.
TRUST_PROXY=false mantém a política conservadora. Para habilitar, informe apenas
IPs/CIDRs de proxies efetivamente verificados na infraestrutura. Não presuma que
qualquer endereço privado é confiável. true, número de saltos e redes /0 são rejeitados.
Em desenvolvimento o proxy fica desabilitado. A topologia da Railway deverá ser
validada antes de habilitar confiança; não há configuração universal de CIDRs aqui.

## Encerramento e saúde

SIGINT/SIGTERM interrompem os timers existentes, fecham a escuta HTTP, aguardam
requisições e encerram o pool MySQL. SHUTDOWN_TIMEOUT_MS limita o encerramento
(padrão 20 segundos). Erros ou prazo excedido encerram com código 1.
As funções originais de agenda e backup foram preservadas: tarefas de fundo já
em execução não ganham drenagem adicional nesta fase.

railway.toml usa Dockerfile e o healthcheck existente /api/health, que consulta o banco.
Não configura pre-deploy, migração ou criação de tabelas. O banco provisionado e
compatível é pré-requisito para a saúde passar. Este arquivo não dispara deploy.

## Verificação segura

Execute apenas npm run test:config nesta fase. A suíte usa configuração explícita,
pool/processo simulados e um Express temporário em loopback. Não importa db.js,
não lê .env e não inicia o servidor real nem seus serviços de fundo.
Não execute npm test ou scripts db:* contra o banco de desenvolvimento.

Resultado local: 11 testes aprovados com Node 22.17.0. Verificações de sintaxe de
server.js e db.js e git diff --check aprovadas. O runtime fixado 22.23.3 ainda precisa
de validação na imagem: Docker não está instalado/disponível neste ambiente.
A versão local anterior pode gerar aviso de engines no npm; não foi atualizada automaticamente.

## Pendências para planejamento da Fase C.2

- Construir e validar a imagem com Node fixado em ambiente isolado.
- Provisionar banco de homologação separado, credenciais restritas e segredos da plataforma.
- Validar domínio HTTPS, origem pública, proxy real e cookies na infraestrutura.
- Rever armazenamento persistente, mysqldump e restauração antes de habilitar backup
  no container. A imagem atual não inclui mysqldump e não configura volume.
- Planejar segurança e drenagem das tarefas de fundo e múltiplas réplicas;
  não assumir que escalar réplicas já está liberado.
- Executar regressão funcional em banco descartável, mediante escopo autorizado.

Cadastro por convite, alterações no banco e rotinas de agenda/backup permanecem
fora desta entrega. Nenhum commit, push ou deploy foi realizado.
