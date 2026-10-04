'use strict';

/**
 * Servidor local e de produção para o AI Studio / Node.js runtime.
 *
 * Serve os arquivos de src/ e monta as rotas da API em /api.
 */

require('dotenv').config();

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const path = require('path');
const express = require('express');

const app = express();
const port = Number(process.env.PORT) || 3000;
const host = '0.0.0.0';

// As requisições recebem o corpo JSON convertido
app.use(express.json({ limit: '5mb' }));

// ------------------------------------------------------------------ API

const rotas = {
  '/api/content': require('./api/content'),
  '/api/media': require('./api/media'),
  '/api/auth/login': require('./api/auth/login'),
  '/api/auth/logout': require('./api/auth/logout'),
  '/api/auth/session': require('./api/auth/session'),
  '/api/selecao': require('./api/selecao')
};

for (const [rota, handler] of Object.entries(rotas)) {
  app.all(rota, (req, res) => handler(req, res));
}

// Rota dinâmica: entrega o :id em req.query
const servirMidia = require('./api/media/[id]');
app.all('/api/media/:id', (req, res) => {
  req.query = { ...req.query, id: req.params.id };
  return servirMidia(req, res);
});

// ------------------------------------------------------------- estáticos

app.use(express.static(path.join(__dirname, 'src'), { index: false }));

// Arquivos da raiz que o site ou PWA solicitam
for (const arquivo of ['manifest.json', 'manifest.webmanifest', 'manifest-admin.json']) {
  app.get(`/${arquivo}`, (req, res) => res.sendFile(path.join(__dirname, arquivo)));
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'index.html'));
});

app.get(['/config', '/admin', '/painel'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'src', 'config.html'));
});

app.get(['/login', '/entrar'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'src', 'login.html'));
});

app.get(['/catalogo', '/galeria-cliente', '/cliente'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'src', 'catalogo.html'));
});

app.use((req, res) => {
  res.status(404).type('text/plain').send('Não encontrado');
});

const servidor = app.listen(port, host, () => {
  console.log(`Site disponível em  http://${host}:${port}`);
  console.log(`Painel disponível em http://${host}:${port}/config`);

  // Se caiu para banco em memória, quem salvou precisa saber disso agora —
  // não no próximo restart, quando o conteúdo já foi perdido.
  require('./lib/db').avisaSeMock();
});

/**
 * Encerramento limpo: sem isso o Ctrl-C no meio de um PUT pode deixar a
 * conexão do Postgres meio usada e o próximo boot esperar pelo pool.
 */
for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, () => {
    console.log(`\n${sinal} recebido, encerrando...`);
    servidor.close(() => process.exit(0));
  });
}
