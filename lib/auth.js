'use strict';

const crypto = require('crypto');
const { requiredEnv, optionalEnv } = require('./env');

/**
 * Autenticação do painel /config: senha única de admin.
 *
 * - A senha nunca é guardada, só o hash scrypt (ADMIN_PASSWORD_HASH).
 * - A sessão é um token assinado com HMAC-SHA256 (SESSION_SECRET) dentro de
 *   um cookie HttpOnly — JavaScript da página não consegue lê-lo, então um
 *   XSS não rouba a sessão.
 * - SameSite=Strict + conferência de Origin barram CSRF.
 */

const COOKIE_NAME = 'vf_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 horas
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

// ---------------------------------------------------------------- senha

function hashPassword(password, { N = 16384, r = 8, p = 1 } = {}) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N, r, p, maxmem: SCRYPT_MAXMEM });
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$');
}

function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, rawN, rawR, rawP, saltB64, hashB64] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  if (salt.length === 0 || expected.length === 0) return false;

  let actual;
  try {
    actual = crypto.scryptSync(password, salt, expected.length, { N, r, p, maxmem: SCRYPT_MAXMEM });
  } catch {
    return false;
  }

  // timingSafeEqual exige mesmo tamanho; o length já foi casado acima.
  return crypto.timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------- sessão

function sign(body) {
  return crypto
    .createHmac('sha256', requiredEnv('SESSION_SECRET'))
    .update(body)
    .digest('base64url');
}

function createSessionToken() {
  const payload = {
    sub: 'admin',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    jti: crypto.randomUUID()
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

function verifySessionToken(token) {
  if (typeof token !== 'string') return null;

  const dot = token.indexOf('.');
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = Buffer.from(sign(body), 'utf8');
  const received = Buffer.from(signature, 'utf8');
  if (received.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(received, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!payload || payload.sub !== 'admin') return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;

  return payload;
}

// ---------------------------------------------------------------- cookies

function parseCookies(req) {
  const header = req.headers?.cookie;
  if (!header) return {};

  return header.split(';').reduce((acc, pair) => {
    const eq = pair.indexOf('=');
    if (eq < 0) return acc;
    const name = pair.slice(0, eq).trim();
    if (name) acc[name] = decodeURIComponent(pair.slice(eq + 1).trim());
    return acc;
  }, {});
}

function sessionCookie(token, { maxAge = SESSION_TTL_SECONDS } = {}) {
  // SameSite=None + Secure permite o app Capacitor (capacitor://localhost) enviar
  // o cookie cross-origin para o backend na Vercel. O guard de Origin no servidor
  // garante que só origens autorizadas consigam usar o cookie.
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;
}

function clearedSessionCookie() {
  return sessionCookie('', { maxAge: 0 });
}

/** Devolve o payload da sessão, ou null se não houver sessão válida. */
function getSession(req) {
  return verifySessionToken(parseCookies(req)[COOKIE_NAME]);
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  parseCookies,
  sessionCookie,
  clearedSessionCookie,
  getSession
};
