#!/usr/bin/env node
'use strict';

/**
 * Gera o valor de ADMIN_PASSWORD_HASH.
 *
 *   node scripts/gerar-hash-senha.js
 *
 * A senha é digitada aqui, sem eco na tela, e não é gravada em lugar nenhum:
 * só o hash scrypt sai no terminal. Cole esse hash em
 * Vercel > Settings > Environment Variables > ADMIN_PASSWORD_HASH.
 */

const readline = require('readline');
const { hashPassword } = require('../lib/auth');

function perguntarSenha(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;

    if (!input.isTTY) {
      reject(new Error('Rode este script num terminal interativo.'));
      return;
    }

    const rl = readline.createInterface({ input, output, terminal: true });

    // Esconde o que for digitado.
    const mute = (chunk) => {
      const texto = chunk.toString();
      if (texto !== '\r' && texto !== '\n' && texto !== '\r\n') return;
      output.write(texto);
    };
    const original = output.write.bind(output);
    output.write = (chunk, ...rest) => {
      if (rl.line.length > 0) return mute('') ?? true;
      return original(chunk, ...rest);
    };

    original(prompt);
    rl.question('', (resposta) => {
      output.write = original;
      output.write('\n');
      rl.close();
      resolve(resposta);
    });
  });
}

(async () => {
  const senha = await perguntarSenha('Senha do painel: ');
  const confirmacao = await perguntarSenha('Repita a senha:  ');

  if (senha !== confirmacao) {
    console.error('\nAs senhas não conferem. Nada foi gerado.');
    process.exit(1);
  }
  if (senha.length < 12) {
    console.error('\nUse pelo menos 12 caracteres. Esta é a única credencial do painel.');
    process.exit(1);
  }

  console.log('\nADMIN_PASSWORD_HASH=' + hashPassword(senha));
  console.log('\nCole a linha acima em Vercel > Settings > Environment Variables.');
  console.log('A senha em si não foi gravada em nenhum arquivo.\n');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
