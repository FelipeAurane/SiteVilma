<<<<<<< HEAD
'use strict';

/**
 * Servidor de desenvolvimento local.
 *
 *   npm start   ->  http://localhost:3000
 *
 * Serve os arquivos de src/ e monta as mesmas funções que rodam na Vercel,
 * para o que você testa aqui ser o que vai para o ar. Em produção quem
 * serve é a Vercel; este arquivo não é publicado.
 */

require('dotenv').config();

// Em localhost o navegador recusa cookie Secure, então a sessão só funciona
// aqui se o ambiente estiver marcado como desenvolvimento.
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const path = require('path');
const express = require('express');

const app = express();
const port = Number(process.env.PORT) || 3000;

// As funções da Vercel recebem o corpo já convertido.
app.use(express.json({ limit: '5mb' }));

// ------------------------------------------------------------------ API

const rotas = {
  '/api/content': require('./api/content'),
  '/api/media': require('./api/media'),
  '/api/auth/login': require('./api/auth/login'),
  '/api/auth/logout': require('./api/auth/logout'),
  '/api/auth/session': require('./api/auth/session')
};

for (const [rota, handler] of Object.entries(rotas)) {
  app.all(rota, (req, res) => handler(req, res));
}

// Rota dinâmica: a Vercel entrega o :id em req.query.
const servirMidia = require('./api/media/[id]');
app.all('/api/media/:id', (req, res) => {
  req.query = { ...req.query, id: req.params.id };
  return servirMidia(req, res);
});

// ------------------------------------------------------------- estáticos

app.use(express.static(path.join(__dirname, 'src'), { index: false }));

// Só os arquivos da raiz que o site realmente pede. Servir a raiz inteira
// exporia api/, lib/, scripts/ e package.json.
for (const arquivo of ['manifest.json', 'manifest.webmanifest', 'manifest-admin.json']) {
  app.get(`/${arquivo}`, (req, res) => res.sendFile(path.join(__dirname, arquivo)));
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'index.html'));
});

app.get('/config', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'src', 'config.html'));
});

app.use((req, res) => {
  res.status(404).type('text/plain').send('Não encontrado');
});

app.listen(port, () => {
  console.log(`Site em  http://localhost:${port}`);
  console.log(`Painel em http://localhost:${port}/config`);

  const faltando = ['DATABASE_URL', 'ADMIN_PASSWORD_HASH', 'SESSION_SECRET']
    .filter((nome) => !process.env[nome]);

  if (faltando.length > 0) {
    console.log(`\nSem ${faltando.join(', ')} no .env — a API vai responder erro.`);
    console.log('Rode: npm run verificar');
  }
=======
const express = require('express');
const path = require('path');
const serveStatic = require('serve-static');

const app = express();
const port = 3000;

// Define o diretório onde estão os arquivos estáticos (HTML, CSS, JS)
app.use(serveStatic(path.join(__dirname,)));

// Define a rota raiz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname,'index.html'));
});

// Inicia o servidor
app.listen(port, () => {
  console.log(`Servidor iniciado em http://localhost:${port}`);
>>>>>>> ba2b8d0eeb44a6e511850429271e9d679029bef9
});
