'use strict';

/**
 * Gera a chave do app (LUVI_APP_KEY) e grava nos dois lugares locais:
 *
 *   desktop/chave.local.json   o app usa para entrar no site (fica fora do git
 *                              e vai junto no executável)
 *   .env (raiz do projeto)     o servidor local aceita a mesma chave
 *
 *   node desktop/scripts/gerar-chave.js            gera só se ainda não existir
 *   node desktop/scripts/gerar-chave.js --nova     troca por uma chave nova
 *
 * A chave não é mostrada na tela. Para o site publicado, o mesmo valor precisa
 * estar na variável LUVI_APP_KEY da Vercel.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ARQUIVO_APP = path.join(__dirname, '..', 'chave.local.json');
const ARQUIVO_ENV = path.join(__dirname, '..', '..', '.env');

let chave = null;
try {
  chave = JSON.parse(fs.readFileSync(ARQUIVO_APP, 'utf8')).chave;
} catch {
  // ainda não existe
}

if (!chave || process.argv.includes('--nova')) {
  chave = crypto.randomBytes(36).toString('base64url');
  fs.writeFileSync(ARQUIVO_APP, JSON.stringify({ chave }, null, 2) + '\n');
  console.log('Chave nova gravada em desktop/chave.local.json');
} else {
  console.log('Chave existente mantida em desktop/chave.local.json');
}

let env = '';
try {
  env = fs.readFileSync(ARQUIVO_ENV, 'utf8');
} catch {
  // sem .env: cria
}
const linha = `LUVI_APP_KEY=${chave}`;
env = /^LUVI_APP_KEY=.*$/m.test(env)
  ? env.replace(/^LUVI_APP_KEY=.*$/m, linha)
  : `${env.replace(/\s*$/, '')}\n\n# Chave do app desktop Luvi (gerada por desktop/scripts/gerar-chave.js)\n${linha}\n`;
fs.writeFileSync(ARQUIVO_ENV, env);
console.log('LUVI_APP_KEY gravada no .env do projeto (reinicie o servidor local)');
