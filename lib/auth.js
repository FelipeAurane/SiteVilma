'use strict';

const crypto = require('crypto');
const { requiredEnv, optionalEnv } = require('./env');

/**
 * Autenticação do painel /config: PIN de 4 caracteres, único do admin.
 *
 * - O PIN fica na variável de ambiente ADMIN_PIN, fora do código-fonte.
 * - A sessão é um token assinado com HMAC-SHA256 (SESSION_SECRET) dentro de
 *   um cookie HttpOnly — JavaScript da página não consegue lê-lo, então um
 *   XSS não rouba a sessão.
 * - SameSite=Strict + conferência de Origin barram CSRF.
 *
 * PIN curto é credencial fraca por natureza (10.000 combinações), então a
 * comparação é em tempo constante e o limite de tentativas por IP em
 * api/auth/login.js é a defesa principal.
 */

const COOKIE_NAME = 'vf_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 horas
const PIN_LENGTH = 4;

// ------------------------------------------------------------------ PIN

/** O PIN configurado no ambiente, ou '' se ninguém configurou. */
function adminPin() {
  const pin = optionalEnv('ADMIN_PIN', '');
  return typeof pin === 'string' ? pin.trim() : '';
}

/**
 * Confere o PIN informado contra o ADMIN_PIN.
 * Sempre devolve false quando o PIN não foi configurado: sem PIN, ninguém
 * entra — nunca "entra qualquer um".
 */
function verifyPin(pin) {
  if (typeof pin !== 'string' || pin.length !== PIN_LENGTH) return false;

  const esperado = adminPin();
  if (esperado.length !== PIN_LENGTH) return false;

  // timingSafeEqual exige mesmo tamanho; o length já foi casado acima.
  return crypto.timingSafeEqual(Buffer.from(pin, 'utf8'), Buffer.from(esperado, 'utf8'));
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
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
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
  PIN_LENGTH,
  adminPin,
  verifyPin,
  createSessionToken,
  verifySessionToken,
  parseCookies,
  sessionCookie,
  clearedSessionCookie,
  getSession
};
