'use strict';

const { Pool } = require('pg');
const { requiredEnv, optionalEnv } = require('./env');

/**
 * Camada de banco. Fala Postgres puro via DATABASE_URL, sem SDK de terceiro:
 * serve para Neon, Supabase (só como banco), Railway ou um Postgres nosso
 * numa VPS. Trocar de provedor é trocar a variável de ambiente.
 */

let pool = null;
let schemaReady = null;

function getPool() {
  if (pool) return pool;

  // Validação de certificado ligada por padrão. DATABASE_SSL_INSECURE só
  // existe para um Postgres local com certificado autoassinado.
  const insecure = optionalEnv('DATABASE_SSL_INSECURE') === '1';
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(requiredEnv('DATABASE_URL'));

  pool = new Pool({
    connectionString: requiredEnv('DATABASE_URL'),
    ssl: local && insecure ? false : { rejectUnauthorized: !insecure },
    // Serverless: cada instância trata uma requisição por vez.
    max: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000
  });

  pool.on('error', (err) => {
    console.error('[db] erro no pool ocioso:', err.message);
  });

  return pool;
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

  CREATE INDEX IF NOT EXISTS login_attempts_ip_at_idx ON login_attempts (ip, at DESC);
`;

/**
 * Cria o schema uma vez por cold start. CREATE TABLE IF NOT EXISTS é
 * idempotente, então concorrência entre instâncias não é problema.
 */
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA)
      .catch((err) => {
        schemaReady = null; // permite nova tentativa na próxima requisição
        throw err;
      });
  }
  return schemaReady;
}

async function query(text, params) {
  await ensureSchema();
  return getPool().query(text, params);
}

/** Query sem bootstrap de schema — usada pelo próprio bootstrap e healthcheck. */
async function rawQuery(text, params) {
  return getPool().query(text, params);
}

module.exports = { query, rawQuery, ensureSchema, getPool };
