# Catálogo de atendimentos do Avelu

Versão inicial pesquisada em 06/10/2026. O seed contém 65 especialidades/categorias e 403 especificações. É um catálogo amplo e extensível de navegação, não uma lista exaustiva de todas as profissões, títulos ou habilitações existentes.

O primeiro nível reúne especialidades médicas e categorias de outras profissões. O segundo detalha regiões anatômicas, serviços, públicos ou campos de atuação. Por exemplo, “Ombro e braço” é uma especificação de atendimento dentro de Ortopedia e Traumatologia, não uma nova especialidade médica oficial. Da mesma forma, Odontologia e Psicologia agrupam campos próprios dessas profissões. A seleção no cadastro não comprova formação, registro ou título de especialista.

Referências consultadas para a nomenclatura:

- CFM, relação de especialidades médicas: https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2024/2380_2024.pdf
- CFO, especialidades odontológicas: https://website.cfo.org.br/estatisticas/quantidade-geral-de-cirurgioes-dentistas-especialistas/
- CFP, especialidades da Psicologia: https://site.cfp.org.br/servicos/titulo-de-especialista/
- COFFITO, especialidades de Fisioterapia: https://www.coffito.gov.br/nsite/?page_id=2350
- CFFa, especialidades e respectivas resoluções: https://fonoaudiologia.org.br/resolucoes/resolucoes_html/CFFa_N_320_06.htm

As associações com regiões do corpo e os rótulos de serviços são organização editorial do Avelu, não reprodução de uma classificação oficial. O catálogo não recomenda tratamentos nem presume que um profissional exerça todos os serviços de sua categoria.

## Manutenção

Execute `npm run db:setup:specialties` para criar as tabelas e inserir opções ausentes. Reexecutar não altera IDs, vínculos, nomes personalizados ou estados de ativação existentes. A instalação completa e `db:setup:admin` também incluem essa preparação.

Administradores podem adicionar categorias e especificações pela opção “Adicionar uma opção ao catálogo de atendimentos”. A seleção de uma especialidade não marca todas as especificações. Selecionar uma especificação marca sua categoria; desmarcar a categoria remove seus detalhes. Profissionais e locais têm seleções independentes.

Os vínculos são gravados em transação e o banco impede associar uma área a uma categoria incorreta. A busca pública consulta apenas especialidades e áreas ativas associadas a cadastros publicados.
