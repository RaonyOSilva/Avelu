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
