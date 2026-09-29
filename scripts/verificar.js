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

const { verifyPin, PIN_LENGTH } = require('../lib/auth');

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

  const pin = process.env.ADMIN_PIN;
  const pinValido = typeof pin === 'string' && pin.trim().length === PIN_LENGTH;
  checar(
    'ADMIN_PIN',
    pinValido,
    pin
      ? pinValido
        ? `${PIN_LENGTH} caracteres`
        : `tem que ter ${PIN_LENGTH} caracteres`
      : `ausente — configure ADMIN_PIN com ${PIN_LENGTH} caracteres`
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

  // O PIN configurado tem que abrir o painel e rejeitar os vizinhos.
  if (pinValido) {
    // Mesmo tamanho, primeiro dígito virado: tem que recusar.
    const certo = pin.trim();
    const errado = (certo[0] === '0' ? '1' : '0') + certo.slice(1);
    const falsoPositivo = verifyPin(errado);
    checar('PIN rejeita valor errado', !falsoPositivo, falsoPositivo ? 'ACEITOU — corrija ADMIN_PIN' : 'ok');
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
