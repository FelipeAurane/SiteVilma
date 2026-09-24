# Site da Vilma

Site estático com painel de administração e uma API própria em Node.

- **Frontend**: HTML/CSS/JS puro em `src/`, sem build.
- **Backend**: funções Node em `api/`, nosso código, rodando na Vercel.
- **Banco**: Postgres, acessado só pelo servidor.

Nenhuma credencial de banco chega ao navegador. O visitante fala com a nossa
API; a API fala com o banco.

---

## Como está organizado

```
api/                 nosso servidor (funções da Vercel)
  content.js           GET público / PUT só admin — conteúdo do site
  media.js             POST só admin — upload de imagem
  media/[id].js        GET público — serve a imagem
  auth/login.js        POST — troca senha por cookie de sessão
  auth/logout.js       POST — encerra a sessão
  auth/session.js      GET — "estou logado?"

lib/                 biblioteca compartilhada pelas funções
  db.js                Postgres + criação das tabelas
  auth.js              hash de senha (scrypt) e cookie assinado (HMAC)
  http.js              respostas, 405, CSRF, exigir admin
  env.js               variáveis de ambiente

src/js/              frontend
  api.js               único ponto que fala com o servidor
  content.js           carrega e pinta o conteúdo do site
  visibility.js        mostra/esconde blocos por data-tag
  admin-auth.js        tela de login do painel
  admin-panel.js       controles do painel

scripts/             ferramentas de linha de comando
tests/               testes de autorização e de fluxo
```

---

## Configuração inicial

São três variáveis. Elas ficam num `.env` local (que o git ignora) e em
**Vercel > Settings > Environment Variables** para produção.

### 1. Banco de dados

Crie um Postgres gratuito e copie a *connection string*.

**Neon** (https://neon.tech) é a recomendação: o plano gratuito hiberna o
compute quando ninguém acessa, mas acorda sozinho na primeira requisição.
Supabase e Railway também servem — confira as condições atuais do plano
gratuito de cada um antes de decidir, elas mudam.

O que importa é ser um Postgres com `sslmode=require`. Trocar de provedor
depois é trocar uma variável.

### 2. Gerar as credenciais

```bash
npm install
npm run secret
npm run hash
```

`npm run hash` pede a senha do painel sem mostrar na tela e devolve só o
hash. A senha em si não é gravada em lugar nenhum.

### 3. Preencher o .env

```bash
cp .env.example .env
```

Cole os três valores. Depois confira:

```bash
npm run verificar
```

Ele testa as variáveis e a conexão, sem imprimir nenhum segredo.

### 4. Semear o conteúdo

O conteúdo antigo está em `src/cache/data.json`. Para levá-lo ao banco:

```bash
npm run semear
```

Isso só mostra o que seria gravado. Para gravar de verdade:

```bash
npm run semear -- --gravar
```

### 5. Rodar local

```bash
npm start
```

Site em http://localhost:3000, painel em http://localhost:3000/config.

### 6. Publicar

Coloque as mesmas três variáveis em Vercel > Settings > Environment
Variables (Production) e faça o deploy. As tabelas são criadas sozinhas na
primeira requisição.

---

## Segurança

**O painel `/config` exige senha.** Antes não exigia nada: qualquer pessoa
que abrisse a URL editava o site.

- A senha nunca é guardada — só o hash scrypt.
- A sessão é um cookie `HttpOnly` + `Secure` + `SameSite=Strict`, assinado
  com HMAC. JavaScript da página não consegue ler o cookie, então um XSS
  não rouba a sessão.
- Oito senhas erradas do mesmo IP em 15 minutos bloqueiam novas tentativas.
- Toda escrita confere a origem da requisição (anti-CSRF).

**O navegador não recebe chave de banco.** Leitura de conteúdo é pública
porque é o que a página mostra mesmo; escrita exige sessão.

**Upload de imagem confere a assinatura do arquivo**, não o que o navegador
alega. HTML e SVG disfarçados de JPEG são recusados — SVG é vetor de XSS.

**Nada de `innerHTML` com dado do servidor.** Os elementos são montados com
`createElement`/`textContent`, então conteúdo malicioso vira texto.

**Cabeçalhos** (em `vercel.json`): CSP, HSTS, `nosniff`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`. O `connect-src 'self'` da CSP
impede a página de mandar dados para qualquer domínio de fora.

### Testes

```bash
npm test
```

Cobre: escrita sem sessão, cookie forjado, sessão vencida, requisição de
outra origem, upload disfarçado, limite de tentativas de login, e o fluxo
completo de login até gravar e ler.

---

## Aplicativo de administração (Android)

O painel também roda como aplicativo. O APK é uma casca nativa que abre o
`/config` do site publicado.

**Por que casca e não app offline:** a sessão é um cookie `SameSite=Strict`.
Se o app servisse os arquivos de dentro do APK, a origem seria
`capacitor://localhost`, o cookie não seria enviado e o login não
funcionaria. Carregando o site direto, a origem é a mesma e a segurança
continua a mesma do navegador.

```bash
npm run app:build
npm run app:instalar
```

O celular precisa estar ligado por USB, com **Depuração USB** ligada nas
Opções do desenvolvedor, e ter aceitado o aviso "Permitir depuração USB".

**Para onde o app aponta:** o endereço está em `capacitor.config.json`, em
`server.url`. Mudou de domínio? Edite ali e rode:

```bash
npm run app:sync && npm run app:build && npm run app:instalar
```

O conteúdo vem do servidor, então mudança no painel ou no site **não** exige
recompilar o app — só mudança de endereço exige.

**Ícones:** gerados por `npm run icones` (anel de diafragma, um lugar-tenente).
Para usar uma arte de verdade, substitua `src/img/icon-192.png`,
`src/img/icon-512.png` e os `ic_launcher*.png` em
`android/app/src/main/res/mipmap-*/`.

O painel também é instalável como PWA: abrindo `/config` no Chrome do
celular, "Adicionar à tela inicial" usa `manifest-admin.json`.

## Manutenção

**Trocar a senha do painel**: `npm run hash`, atualize `ADMIN_PASSWORD_HASH`
na Vercel, redeploy.

**Deslogar de tudo**: `npm run secret`, atualize `SESSION_SECRET`. Todas as
sessões abertas morrem na hora.

**Trocar de banco**: aponte `DATABASE_URL` para o novo Postgres. As tabelas
se criam sozinhas; o conteúdo você migra com um dump ou rodando o seed.

**Backup**: `pg_dump` da `DATABASE_URL`. As imagens estão na tabela `media`,
então o dump leva tudo junto.
