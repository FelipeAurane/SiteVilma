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
});
