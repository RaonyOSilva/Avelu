# Avelu

PWA com frontend em HTML/CSS/JavaScript, API Node.js/Express e banco MySQL.

## Preparação

1. Instale Node.js 20 ou superior e MySQL 8.
2. Copie `.env.example` para `.env` e informe seu usuário e senha do MySQL.
3. Execute `npm install`.
4. Execute `npm run db:setup` para criar o banco com nomes em português e inserir os dados iniciais.
5. Execute `npm run dev`.
6. Acesse `http://localhost:3000`.

O Live Server ainda pode ser usado para alterações puramente visuais, mas as chamadas `/api` exigem que a página seja aberta pelo servidor Node na porta configurada.

Nunca coloque a senha do MySQL em `app.js`, `index.html` ou em qualquer arquivo servido ao navegador.

## Cadastro e agendamento

- `perfil.html?tipo=local&id=ID` e `perfil.html?tipo=profissional&id=ID`: perfis públicos acessados pelos resultados da busca, com apresentação, especialidades completas, contatos públicos, vínculos e ação de agendamento. O profissional leva à agenda existente; o local leva à equipe e, sem equipe publicada, orienta o contato direto.
- Para instalações existentes, rode `npm run db:setup:profiles`. WhatsApp e e-mail público são campos próprios nos dois formulários administrativos; o e-mail interno da conta não é exposto. O número de WhatsApp deve ser informado explicitamente (o telefone não é convertido automaticamente). Notas ilustrativas não são exibidas; o perfil informa que avaliações de pacientes estarão disponíveis em uma próxima etapa. Esta etapa não implementa envio de avaliações.

- `buscar.html` (menu **Agendar**): descoberta pública com busca única, alternância entre locais e profissionais, filtro de tipo de local e cartões resumidos. Selecionar um local lista apenas os profissionais publicados vinculados a ele. Cada horário disponível pertence a um profissional e a um local publicado, com endereço e valor (ou valor a consultar).
- A pesquisa da página inicial encaminha para essa tela, preservando o termo digitado. As listagens foram removidas da página inicial.
- A cidade é selecionada com UF e vale para locais e profissionais. `/api/cities` lista automaticamente as cidades de locais publicados. Se houver apenas uma, ela vem selecionada; a escolha fica na URL. Profissionais são filtrados pelos locais publicados aos quais estão vinculados. Cadastros sem local não aparecem quando há filtro de cidade. Novas cidades entram no seletor ao publicar unidades nelas, sem alterar o código.

- `cadastro.html`: cadastro de paciente com nome, e-mail, telefone opcional e senha (8 a 128 caracteres), com entrada automática.
- `entrar.html`: login com e-mail e senha.
- `agendar.html?profissional=ID`: consulta pública dos horários. Ao continuar sem sessão, o usuário entra ou se cadastra e retorna ao horário escolhido para confirmar.
- `agendamentos.html` (Minha conta): dados pessoais, próximos atendimentos e histórico, cancelamento e remarcação de reservas futuras, além de saída da conta.

Para um banco já existente, execute `npm run db:setup:auth` uma vez. O comando cria somente a tabela `sessoes` no banco definido pelo `.env`; preserva os dados existentes. Instalações novas com `npm run db:setup` também criam essa tabela.

As senhas usam scrypt com salt individual. As sessões duram sete dias, ficam no MySQL com o token armazenado como hash e usam cookie HttpOnly/SameSite. As reservas exigem sessão válida no servidor e usam transação e bloqueio do horário para impedir duplicidade. Requisições que alteram dados exigem o cabeçalho Origin da aplicação. Nenhuma resposta da API é armazenada pelo service worker.

Em produção, use HTTPS e `NODE_ENV=production` para ativar o cookie Secure. Configure `APP_ORIGIN` com a origem pública exata (por exemplo, `https://avelu.exemplo.com`, sem barra final) ao usar um proxy. O limite de tentativas de autenticação é por instância; uma implantação com múltiplas instâncias precisa de um limitador compartilhado.

A agenda é gerenciada pelo administrador e pelas equipes autorizadas na Área de atendimento. Ainda não há confirmação de e-mail, lembretes automáticos nem pagamento online. Perfis identificados pelo marcador de demonstração original não aparecem na busca pública. Horários vencidos ou sem local publicado e vinculado não podem ser reservados.

## Administração de profissionais e locais

Os dois formulários possuem seleção múltipla de especialidades e especificações, com pesquisa e resumo das escolhas. O catálogo inicial tem 65 especialidades/categorias e 403 detalhamentos, incluindo regiões como braço, perna e coluna em Ortopedia. É uma base ampla, extensível pela própria administração; não é uma lista exaustiva de títulos profissionais. Consulte `database/CATALOGO.md` para referências, estrutura e manutenção.

Para atualizar uma instalação existente, execute `npm run db:setup:specialties`. As opções selecionadas aparecem no site e participam da busca pública (por exemplo, buscar “coluna”). As seleções do local e do profissional são independentes.

Abra `/admin.html` com uma conta de administrador. A área tem dois cadastros independentes:

- **Profissionais:** nome, profissão/título, e-mail interno, telefone, registro, apresentação, especialidades e locais de atendimento. O e-mail é obrigatório e deve ser único. O cadastro administrativo cria um perfil de diretório sem senha de acesso para o profissional.
- **Locais:** clínica, consultório, hospital, laboratório, centro médico ou outro; endereço, cidade/UF, telefone público, site e descrição. Cadastre uma unidade por endereço. O e-mail de contato é interno.

Ambos permitem criar, pesquisar, editar, publicar e despublicar. Novos registros começam como rascunho. Locais e profissionais publicados aparecem na tela Agendar. Cada profissional pode ser vinculado a vários locais, e cada local pode ter vários profissionais. O administrador seleciona um desses locais ao cadastrar cada horário.

Em um banco existente, execute `npm run db:setup:admin` para criar as tabelas sem apagar registros. Novas instalações com `npm run db:setup` já incluem a estrutura. Para liberar um administrador, cadastre primeiro a conta pelo site e execute no servidor:

```powershell
npm run admin:grant -- email-da-conta@exemplo.com
```

Esse comando promove a conta informada a administrador. O formulário público sempre cria pacientes e não aceita definir permissões. A promoção é manual, apenas pelo servidor, e exige uma conta existente. A senha continua sendo aquela escolhida pelo usuário no cadastro.

## Testes da administração

Prepare também `npm run db:setup:admin` antes de `npm test`. Os testes cobrem bloqueio de visitantes e pacientes, validação, publicação e rascunhos, edição, vínculos, reversão de gravações inválidas e e-mail duplicado. Registros de teste são removidos ao final.

Execute `npm test` com o MySQL configurado e a tabela `sessoes` preparada. Os testes iniciam um servidor em porta livre e criam usuários, perfil e horário temporários, removidos ao final. Cobrem busca pública, cadastro, credenciais inválidas, sessão, logout, isolamento entre pacientes, reserva concorrente, limite de tentativas e bloqueio de arquivos privados.

## Jornada de agendamento e conta

Em instalações existentes, execute `npm run db:setup:journey` depois das migrações de autenticação, locais e perfis. A migração é repetível e preserva cadastros e reservas. Acrescenta local/valor aos horários, registra uma cópia do endereço e valor na reserva e permite reservar novamente uma vaga cancelada. Horários antigos sem local permanecem no banco, mas não são oferecidos publicamente.

No painel administrativo, abra **Gerenciar horários**. Selecione profissional e local publicado vinculado, informe início e fim no fuso de Brasília e o valor opcional. Intervalos sobrepostos são recusados; horários disponíveis podem ser bloqueados. A agenda usa o horário de Brasília: configure também o servidor Node e o MySQL nesse fuso ao hospedar.

O paciente vê os dados antes de confirmar. Pode cancelar ou remarcar até o início do atendimento. A remarcação mantém o mesmo profissional e só libera a reserva original se a nova for gravada com sucesso. O endereço e valor reservados não mudam quando o cadastro do local é editado.

A busca guarda filtros na URL e a posição no navegador ao abrir um perfil. A página inicial e os perfis não exibem estatísticas nem avaliações ilustrativas.

## Recuperação por e-mail

A tela **Esqueci minha senha** e a redefinição estão implementadas. Para ativar o envio, configure no servidor `RESEND_API_KEY`, `MAIL_FROM` (remetente verificado) e `APP_ORIGIN` (origem HTTPS pública, sem barra final). Integração conforme [API de envio do Resend](https://resend.com/docs/api-reference/emails/send-email). Não coloque chaves nos arquivos públicos. Sem essas configurações, a tela informa que a recuperação ainda está indisponível.

Links expiram em 15 minutos, são de uso único e ficam armazenados somente como hash. O token é enviado no fragmento do link, removido da URL na abertura e não é retornado pela API. A troca de senha revoga as sessões anteriores. O endpoint não confirma a existência de uma conta; falhas de entrega são registradas no servidor sem tokens ou credenciais. O envio externo requer a configuração acima e não faz parte dos testes automáticos.

Os testes também cobrem vínculo do horário ao local, sobreposição, cancelamento, nova reserva da vaga liberada, remarcação, endereço preservado, dados pessoais e recuperação com token vencido/reutilizado.

## Área de atendimento (profissionais e recepção)

Para atualizar uma instalação existente com as migrações anteriores aplicadas, execute `npm run db:setup:team` e reinicie o servidor. A migração é repetível e mantém reservas existentes. Instalações novas com `npm run db:setup` já incluem essa estrutura.

1. Entre como administrador em `/admin.html` e abra **Acessos da equipe**.
2. Informe o e-mail da pessoa e escolha um vínculo: **profissional**, para sua agenda em todos os locais, ou **local**, para atendimentos somente naquela unidade. É possível conceder vários vínculos ao mesmo e-mail.
3. Se a conta ainda não existe, preencha nome e senha inicial no bloco Primeiro acesso. Para um profissional cadastrado no diretório sem senha, a senha inicial habilita o login. Uma conta existente com senha mantém a senha atual. Perfis de demonstração não recebem acesso.
4. A pessoa entra normalmente em `/entrar.html` e acessa `/atendimento.html`. Pode trocar a própria senha no menu Minha senha. A troca encerra as sessões anteriores. Não são enviados convites automáticos.

Na Área de atendimento é possível:

- Filtrar a agenda por dia, profissional e unidade, com resumo de vagas livres, a confirmar, confirmadas e canceladas.
- Publicar um intervalo de até 12 horas dividido em consultas, por exemplo, 08h–12h em consultas de 30 minutos. O intervalo precisa ser divisível pela duração. Preencha uma data por publicação; recorrência semanal ainda não está incluída.
- Bloquear ou reabrir vagas futuras. Intervalos sobrepostos do mesmo profissional são recusados, inclusive em outra unidade.
- Selecionar **Agendar paciente** em uma vaga livre e registrar nome, telefone e e-mail opcional. A reserva manual usa a mesma proteção contra concorrência da reserva online.
- Confirmar, cancelar com motivo e concluir atendimentos já iniciados. Ao cancelar, a equipe escolhe se libera a vaga novamente ou a mantém bloqueada.

Um agendamento manual não cria uma conta nem é associado automaticamente a um usuário pelo e-mail informado. Ele fica disponível à equipe autorizada; não aparece automaticamente na conta pessoal do paciente. Reservas feitas pelo site continuam aparecendo para o paciente com o status atualizado. A equipe deve comunicar cancelamentos e confirmações por seus canais: não há envio automático de e-mail ou WhatsApp.

As permissões são verificadas no servidor em cada consulta e alteração. Um vínculo de local não permite acessar atendimentos do mesmo profissional em outra unidade. Somente o administrador da Avelu concede ou revoga vínculos; as equipes não podem se promover nem cadastrar permissões. A revogação vale na próxima requisição, mesmo com sessão aberta. Administradores mantêm acesso global. As ações da equipe na agenda são registradas em `agenda_eventos` com usuário, horário e ação.

O banco utiliza `gestao_acessos` para os vínculos e campos próprios para pacientes de reservas manuais. Os testes incluem isolamento entre unidades, controle de permissões, publicação em lote, concorrência manual/online, confirmação, cancelamento, reabertura, revogação e troca de senha.

## Agendamento pelo perfil do local

O botão **Agendar atendimento** no perfil do local abre `agendar-local.html?local=ID`. A tela mostra os profissionais publicados vinculados à unidade e consulta a disponibilidade de cada um com o filtro `local`. Cada cartão apresenta dias e horários selecionáveis, com valor ou indicação de consulta do valor. O paciente escolhe a vaga e continua no fluxo existente de revisão e login, preservando local, profissional e horário. A tela oferece contatos quando não há equipe ou horários e nova tentativa quando a agenda falha. A navegação de volta na confirmação retorna aos profissionais do local. Não foi necessário alterar o banco.


### Registro do atendimento
Em `profissional.html`, **Realizar atendimento** abre `consulta.html?id=...` sem concluir a agenda.
O profissional responsável pode salvar evolução e receita como rascunho e finalizar o atendimento.
Registros finalizados ficam disponíveis em **Realizados → Ver registro e imprimir**, somente para leitura.
A impressão oferece registro completo ou somente receita, com identificação e espaço para assinatura.
Não implementa assinatura digital nem modelos especiais de receituário.
Instalações existentes: execute `npm run db:setup:consultations`.
A API restringe os registros ao profissional titular, valida o horário e evita sobrescrita por abas concorrentes.


### Experiência de pacientes, equipe e profissionais
- Execute `npm run db:setup:experience` em instalações existentes para criar modelos pessoais e lista de espera.
- Recepção: lista compacta, grade por profissional, janela de 7 dias, atualização a cada 30 segundos e remarcação para vaga do mesmo profissional. A remarcação mantém a identidade do agendamento, registra origem/destino e volta a aguardar confirmação; registros clínicos iniciados não são remarcados.
- Lista de espera: cadastre nome, telefone, profissional, local e preferências; registre contato e use **Buscar vaga**. Ao salvar a reserva correspondente, a espera é encerrada na mesma transação. Mensagens não são enviadas automaticamente.
- Paciente: próximo atendimento destacado e orientação conforme o status, com remarcação/cancelamento para horários futuros.
- Profissional: rascunho salvo após uma pausa na digitação; novas edições feitas durante o envio são preservadas. Falhas mantêm o texto na tela, conflitos interrompem tentativas automáticas e não substituem registros de outra aba.
- Histórico: até 50 registros anteriores finalizados pelo próprio profissional para o mesmo paciente identificado. Agendamentos manuais sem paciente vinculado não são associados por nome ou telefone.
- Modelos pessoais de evolução/receita: crie, exclua ou insira ao final do campo, revisando o conteúdo para o paciente atual.
- A atualização automática das agendas é pausada durante formulários, diálogos ou interação com controles, sem atualizar o editor clínico.

### Publicação de agendas por período
Acesse **Área de atendimento → Publicar por período** (`programacao.html`). Escolha profissional e local, intervalo de até 366 dias, dias da semana, até quatro turnos, duração e valor. Cadastre férias e exceções, revise o calendário e gere a prévia antes de confirmar. Conflitos do profissional em qualquer unidade são ignorados e apresentados na prévia; horários passados não são publicados. Sobras menores que uma consulta não geram vagas.

- **Período inteiro:** publica todas as vagas elegíveis de uma vez.
- **Janela móvel:** publica inicialmente os próximos 30, 60, 90 ou 180 dias e avança até o final do período configurado. O servidor processa as programações ao iniciar e a cada 15 minutos; precisa permanecer em execução. Alternativamente, execute `npm run schedule:run` em um agendador externo. Pausar interrompe futuras liberações, sem retirar vagas existentes.
- **Retirar horários livres:** bloqueia somente vagas futuras livres daquela programação no intervalo escolhido, preserva reservas e registra a exceção para impedir novas liberações nesse período.
- Instalações existentes: `npm run db:setup:scheduling`. O setup completo também inclui essas tabelas.

O calendário sugere feriados nacionais e datas móveis. Pontos facultativos são opcionais. As datas municipais de Governador Valadares estão verificadas apenas para 2026, conforme o [Decreto municipal 12.413](https://invista.valadares.mg.gov.br/abrir_arquivo.aspx?arquivo=%7B8DADEA0A-7DAE-CECE-EBAA-DEEC40A62ECE%7D.pdf&cdLocal=12). Para outros anos ou cidades, revise e acrescente feriados estaduais/municipais; a tela avisa quando não há calendário regional verificado. A confirmação dessa revisão é obrigatória.

Na área do profissional, **Todos atendimentos agendados** lista exclusivamente os seus agendamentos com status confirmado, de todas as datas, agrupados por dia e ordenados por horário. Há filtro por local, resumo de atendimentos/dias/locais e paginação de 50 registros. Confirmações pendentes, cancelados e realizados não aparecem nessa visão. A execução do atendimento continua restrita à data agendada.
