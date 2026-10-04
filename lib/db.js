'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { optionalEnv } = require('./env');

/**
 * Camada de banco. Conecta ao Postgres via DATABASE_URL se configurado,
 * ou recorre a um banco falso em memória com dados pré-semeados de
 * src/cache/data.json para ambiente sem banco configurado.
 *
 * O banco em memória é para desenvolvimento, e só quando não há
 * DATABASE_URL. Se a variável existe e a conexão falha, a query é rejeitada:
 * cair para um Map em memória com o banco configurado faria o painel
 * responder "publicado" para uma gravação que se perde no próximo restart.
 * Falar é feio; fingir que gravou é pior.
 */

let pool = null;
let useMock = false;

/**
 * Sódevelopment aceita banco em memória, e apenas sem DATABASE_URL
 * configurada. `ALLOW_MEMORY_DB=1` libera mesmo assim, para rodar os testes
 * de ponta a ponta sem um Postgres por perto.
 */
function mockPermitido() {
  if (!optionalEnv('DATABASE_URL')) return true;
  return optionalEnv('ALLOW_MEMORY_DB') === '1';
}

/** Repete uma vez: falha de conexão costuma ser transitória na borda. */
async function comRetry(tarefa, tentativas = 2) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      return await tarefa();
    } catch (erro) {
      ultimoErro = erro;
      if (tentativa < tentativas) {
        console.warn(`[db] falhou (${erro.message}), tentando de novo...`);
      }
    }
  }
  throw ultimoErro;
}

const store = {
  content: new Map(),
  media: new Map(),
  loginAttempts: []
};

// Pré-semeia com o conteúdo original de src/cache/data.json
function seedInitialData() {
  try {
    const dataPath = path.join(__dirname, '..', 'src', 'cache', 'data.json');
    if (fs.existsSync(dataPath)) {
      const raw = fs.readFileSync(dataPath, 'utf8');
      const parsed = JSON.parse(raw);
      store.content.set('siteData', {
        key: 'siteData',
        value: parsed,
        version: 1,
        updated_at: new Date()
      });
    }
  } catch (err) {
    console.warn('[db:mock] aviso ao carregar data.json:', err.message);
  }
}
seedInitialData();

function executeMockQuery(text, params = []) {
  const sql = text.trim();

  // DDL
  if (sql.startsWith('CREATE TABLE') || sql.includes('CREATE TABLE IF NOT EXISTS') || sql.startsWith('CREATE INDEX')) {
    return { rows: [] };
  }

  // Falhas recentes de login para limitação de taxa
  if (sql.includes('count(*)::int AS failures')) {
    const [ip] = params;
    const failures = store.loginAttempts.filter(t => t.ip === ip && !t.ok).length;
    return { rows: [{ failures }] };
  }

  // Registrar tentativa de login
  if (sql.includes('INSERT INTO login_attempts')) {
    store.loginAttempts.push({ ip: params[0], ok: Boolean(params[1]), at: new Date() });
    return { rows: [] };
  }

  // Limpar tentativas antigas
  if (sql.includes('DELETE FROM login_attempts')) {
    const oneDayAgo = Date.now() - 86400000;
    store.loginAttempts = store.loginAttempts.filter(t => t.at.getTime() >= oneDayAgo);
    return { rows: [] };
  }

  // Consulta de conteúdo
  if (sql.includes('SELECT value, version, updated_at FROM content')) {
    const key = params[0];
    const row = store.content.get(key);
    return { rows: row ? [{ value: row.value, version: row.version, updated_at: row.updated_at }] : [] };
  }

  // Gravação de conteúdo
  if (sql.includes('INSERT INTO content')) {
    const [key, valRaw] = params;
    let value = valRaw;
    if (typeof valRaw === 'string') {
      try { value = JSON.parse(valRaw); } catch { value = valRaw; }
    }
    const prev = store.content.get(key);
    const version = prev ? prev.version + 1 : 1;
    const updated_at = new Date();
    store.content.set(key, { key, value, version, updated_at });
    return { rows: [{ version, updated_at }] };
  }

  // Gravação de mídia
  if (sql.includes('INSERT INTO media')) {
    const [id, mime, bytes, size] = params;
    store.media.set(id, { id, mime, bytes, byte_size: size, created_at: new Date() });
    return { rows: [] };
  }

  // Consulta de mídia
  if (sql.includes('SELECT mime, bytes, byte_size FROM media')) {
    const id = params[0];
    const row = store.media.get(id);
    return { rows: row ? [{ mime: row.mime, bytes: row.bytes, byte_size: row.byte_size }] : [] };
  }

  // Checagem de versão
  if (sql.includes('SELECT version()')) {
    return { rows: [{ versao: 'PostgreSQL 16.0 (Mock em memória AI Studio)' }] };
  }

  if (sql.includes('SELECT key, version FROM content')) {
    const rows = Array.from(store.content.values()).map(c => ({ key: c.key, version: c.version }));
    return { rows };
  }

  if (sql.includes('information_schema.tables')) {
    return {
      rows: [
        { table_name: 'content' },
        { table_name: 'login_attempts' },
        { table_name: 'media' }
      ]
    };
  }

  return { rows: [] };
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS content (
    key        text PRIMARY KEY,
    value      jsonb       NOT NULL,
    version    integer     NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS media (
    id         text PRIMARY KEY,
    mime       text        NOT NULL,
    bytes      bytea       NOT NULL,
    byte_size  integer     NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS login_attempts (
    id         bigserial PRIMARY KEY,
    ip         text        NOT NULL,
    ok         boolean     NOT NULL,
    at         timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS selecoes (
    id           bigserial PRIMARY KEY,
    cliente      text        NOT NULL,
    cliente_email text,
    fotos        jsonb       NOT NULL,
    total        integer     NOT NULL,
    status       text        NOT NULL DEFAULT 'enviada',
    created_at   timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS login_attempts_ip_at_idx ON login_attempts (ip, at DESC);

  CREATE INDEX IF NOT EXISTS selecoes_cliente_idx ON selecoes (cliente, created_at DESC);
`;

function getPool() {
  if (useMock) return mockPool();

  if (pool) return pool;

  const dbUrl = optionalEnv('DATABASE_URL');
  if (!dbUrl) {
    if (!mockPermitido()) {
      throw new Error('DATABASE_URL não configurado e banco em memória desabilitado.');
    }
    useMock = true;
    console.warn('[db] sem DATABASE_URL: usando banco em memória. O conteúdo salvo aqui se perde ao reiniciar.');
    return getPool();
  }

  const insecure = optionalEnv('DATABASE_SSL_INSECURE') === '1';
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

  pool = new Pool({
    connectionString: dbUrl,
    ssl: local && insecure ? false : { rejectUnauthorized: !insecure },
    max: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 3000
  });

  if (typeof pool.on === 'function') {
    pool.on('error', (err) => {
      // Ocorre quando o Postgres hiberna (plano gratuito) ou a conexão cai.
      // O pool se reconecta sozinho; o erro no console é o registro disso.
      console.error('[db] erro no pool:', err.message);
    });
  }

  return pool;
}

function mockPool() {
  return {
    query: async (text, params) => executeMockQuery(text, params),
    on: () => {}
  };
}

let schemaReady = null;

async function ensureSchema() {
  if (useMock) return;

  if (!schemaReady) {
    // Não memoiza a rejeição: uma falha ao subir o schema (banco ainda
    //starting, por exemplo) tem de permitir nova tentativa na próxima
    // requisição, e não deixar o site quebrado para sempre.
    schemaReady = comRetry(() => getPool().query(SCHEMA))
      .catch((erro) => {
        schemaReady = null;
        console.error('[db] não foi possível garantir o schema:', erro.message);
        throw erro;
      });
  }
  return schemaReady;
}

async function query(text, params) {
  if (useMock) return executeMockQuery(text, params);
  await ensureSchema();
  return comRetry(() => getPool().query(text, params));
}

async function rawQuery(text, params) {
  if (useMock) return executeMockQuery(text, params);
  return comRetry(() => getPool().query(text, params));
}

/**
 * Ligar o servidor avisa na hora quando está em memória, para ninguém achar
 * que salvou algo que vai sumir.
 */
function avisaSeMock() {
  if (useMock) {
    console.warn('[db] ATENÇÃO: banco em memória. Tudo que for salvo agora se perde ao reiniciar o servidor.');
  }
}

module.exports = { query, rawQuery, ensureSchema, getPool, avisaSeMock, mockPermitido };
