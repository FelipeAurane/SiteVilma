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
  const { isPlaceholderDbUrl } = require('../lib/db');
  const urlReal = Boolean(url) && /^postgres(ql)?:\/\//.test(url) && !isPlaceholderDbUrl(url);

  checar(
    'DATABASE_URL',
    Boolean(url) && !isPlaceholderDbUrl(url),
    url
      ? isPlaceholderDbUrl(url)
        ? 'placeholder de exemplo (usando banco em memória)'
        : 'presente'
      : 'ausente — pegue a connection string no painel do banco'
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
  if (urlReal) {
    try {
      const { query, avisaSeMock } = require('../lib/db');
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

      // Confere que o banco realmente guarda o que se grava nele. Sem esta
      // escrita de teste, um banco que aceita ler e descarta escrita passaria
      // como saudável — e o painel só descobriria isso depois de publicar.
      const chave = `verificacao:${Date.now()}`;
      await query(
        `INSERT INTO content (key, value, version, updated_at)
              VALUES ($1, '{"ok":true}'::jsonb, 1, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
           RETURNING key`,
        [chave]
      );

      const { rows: lido } = await query('SELECT value FROM content WHERE key = $1', [chave]);
      const gravou = lido.length === 1 && lido[0].value?.ok === true;

      await query('DELETE FROM content WHERE key = $1', [chave]);

      checar(
        'Escrita no banco',
        gravou,
        gravou ? 'ok' : 'O banco aceitou a escrita mas não devolveu o valor gravado.'
      );

      // O servidor cai para banco em memória quando a conexão falha. Com
      // DATABASE_URL preenchida isso não pode acontecer em silêncio.
      const { mockPermitido } = require('../lib/db');
      checar(
        'Banco em memória',
        !mockPermitido(),
        mockPermitido()
          ? 'PERMITIDO com DATABASE_URL preenchida — o servidor pode gravar num banco que se perde ao reiniciar'
          : 'desligado (o servidor falha em vez de fingir que salvou)'
      );
    } catch (err) {
      checar('Conexão com o banco', false, err.message);
    }
  } else {
    try {
      const { query } = require('../lib/db');
      const { rows } = await query('SELECT version() AS versao');
      checar('Conexão com o banco', true, rows[0].versao.split(',')[0]);
      checar('Escrita no banco', true, 'ok (em memória)');
    } catch (err) {
      checar('Conexão com o banco', false, err.message);
      checar('Escrita no banco', false, err.message);
    }
  }

  // ------------------------------------------------------------- frontend
  // Um caminho de asset quebrado só aparece quando alguém abre a página.
  // O build falha nesses casos, mas ele só roda no CI: conferir aqui pega
  // antes do push.
  try {
    const { referenciasDoSite } = require('../scripts/build');
    const { faltando } = referenciasDoSite();
    checar(
      'Assets referenciados',
      faltando.length === 0,
      faltando.length ? `faltando: ${faltando.join(', ')}` : 'todos os CSS e JS existem'
    );
  } catch (err) {
    checar('Assets referenciados', false, err.message);
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
