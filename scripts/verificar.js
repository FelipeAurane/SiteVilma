#!/usr/bin/env node
'use strict';

/**
 * Confere se o ambiente está pronto antes de publicar.
 *
 *   node scripts/verificar.js
 *
 * Testa as três variáveis obrigatórias e a conexão com o banco.
 * Não imprime nenhum valor de segredo — só se está presente e válido.
 */

require('dotenv').config();

const { verifyPassword } = require('../lib/auth');

const resultados = [];

function checar(nome, ok, detalhe) {
  resultados.push({ nome, ok, detalhe });
}

async function principal() {
  // --------------------------------------------------------- variáveis
  const url = process.env.DATABASE_URL;
  checar(
    'DATABASE_URL',
    Boolean(url) && /^postgres(ql)?:\/\//.test(url),
    url ? 'presente' : 'ausente — pegue a connection string no painel do banco'
  );

  const hash = process.env.ADMIN_PASSWORD_HASH;
  const hashValido =
    Boolean(hash) && hash.startsWith('scrypt$') && hash.split('$').length === 6;
  checar(
    'ADMIN_PASSWORD_HASH',
    hashValido,
    hash ? (hashValido ? 'formato válido' : 'formato inesperado') : 'ausente — rode: npm run hash'
  );

  const segredo = process.env.SESSION_SECRET;
  checar(
    'SESSION_SECRET',
    Boolean(segredo) && segredo.length >= 32,
    segredo
      ? segredo.length >= 32
        ? `${segredo.length} caracteres`
        : 'curto demais — rode: npm run secret'
      : 'ausente — rode: npm run secret'
  );

  // O hash tem que rejeitar senha errada; se aceitar, algo está corrompido.
  if (hashValido) {
    const falsoPositivo = verifyPassword('senha-obviamente-errada-' + Date.now(), hash);
    checar('Hash rejeita senha errada', !falsoPositivo, falsoPositivo ? 'ACEITOU — regere o hash' : 'ok');
  }

  // -------------------------------------------------------------- banco
  if (url) {
    try {
      const { query } = require('../lib/db');
      const { rows } = await query('SELECT version() AS versao');
      checar('Conexão com o banco', true, rows[0].versao.split(',')[0]);

      const { rows: tabelas } = await query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN ('content', 'media', 'login_attempts')
          ORDER BY table_name`
      );
      checar(
        'Tabelas criadas',
        tabelas.length === 3,
        tabelas.map((t) => t.table_name).join(', ') || 'nenhuma'
      );

      const { rows: conteudo } = await query('SELECT key, version FROM content ORDER BY key');
      checar(
        'Conteúdo no banco',
        true,
        conteudo.length > 0
          ? conteudo.map((c) => `${c.key} (v${c.version})`).join(', ')
          : 'vazio — rode: node scripts/semear.js --gravar'
      );
    } catch (err) {
      checar('Conexão com o banco', false, err.message);
    }
  }

  // ---------------------------------------------------------- relatório
  console.log('');
  let falhas = 0;
  for (const { nome, ok, detalhe } of resultados) {
    if (!ok) falhas++;
    console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome.padEnd(26)} ${detalhe}`);
  }

  console.log('');
  if (falhas === 0) {
    console.log('Tudo pronto. Pode publicar.');
  } else {
    console.log(`${falhas} item(ns) pendente(s). Veja .env.example.`);
  }
  process.exit(falhas === 0 ? 0 : 1);
}

principal().catch((err) => {
  console.error('Erro inesperado:', err.message);
  process.exit(1);
});
