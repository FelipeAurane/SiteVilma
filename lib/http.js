'use strict';

const { getSession } = require('./auth');
const { optionalEnv } = require('./env');

/**
 * Helpers de requisição/resposta compartilhados pelas rotas.
 */

// Origens nativas do Capacitor (app mobile)
const CAPACITOR_ORIGINS = [
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
];

/** Origens autorizadas a fazer escrita. Inclui app nativo + variável ALLOWED_ORIGINS. */
function allowedOrigins() {
  const extra = (optionalEnv('ALLOWED_ORIGINS', '') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return [...CAPACITOR_ORIGINS, ...extra];
}

/** Adiciona headers CORS se a origem for permitida. Retorna false se deve encerrar (OPTIONS). */
function handleCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;

  const allowed = allowedOrigins();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const self = `${proto}://${host}`;

  let originOk = origin === self || allowed.includes(origin);
  if (!originOk && origin) {
    try {
      const originUrl = new URL(origin);
      if (host && (host === originUrl.host || host.startsWith(originUrl.hostname))) {
        originOk = true;
      }
    } catch {}
  }

  if (!originOk) return true;

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return false; // preflight encerrado
  }
  return true;
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Vary', 'Origin, Cookie');
}

function json(res, status, body, headers = {}) {
  securityHeaders(res);
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

function fail(res, status, message, extra = {}) {
  json(res, status, { error: message, ...extra });
}

/**
 * Só aceita métodos declarados. Responde 405 com Allow, como manda o HTTP.
 */
function methodGuard(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader('Allow', methods.join(', '));
  fail(res, 405, 'Método não permitido');
  return false;
}

/**
 * Defesa de CSRF: toda escrita precisa vir da própria origem.
 */
function sameOriginGuard(req, res) {
  const origin = req.headers.origin;

  if (!origin) return true;

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const self = `${proto}://${host}`;

  let match = origin === self || allowedOrigins().includes(origin);
  if (!match && origin) {
    try {
      const originUrl = new URL(origin);
      if (host && (host === originUrl.host || host.startsWith(originUrl.hostname))) {
        match = true;
      }
    } catch {}
  }

  if (match) return true;

  fail(res, 403, 'Origem não autorizada');
  return false;
}

/** Interrompe a rota com 401 se não houver sessão de admin. */
function requireAdmin(req, res) {
  const session = getSession(req);
  if (session) return session;
  fail(res, 401, 'Não autenticado');
  return null;
}

/**
 * IP do cliente.
 */
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'desconhecido';
}

/**
 * Envolve um handler assíncrono para capturar erros não tratados e devolver
 * 500 JSON padronizado.
 */
function withErrorHandling(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(`[api] erro em ${req.method} ${req.url}:`, err);
      if (!res.headersSent) {
        fail(res, 500, 'Erro interno do servidor');
      }
    }
  };
}

module.exports = {
  allowedOrigins,
  handleCors,
  securityHeaders,
  json,
  fail,
  methodGuard,
  sameOriginGuard,
  requireAdmin,
  clientIp,
  withErrorHandling
};
