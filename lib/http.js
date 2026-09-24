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
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const self = `${proto}://${host}`;

  const originOk = origin === self || allowed.includes(origin);
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
  res.setHeader('X-Frame-Options', 'DENY');
  // A API nunca é um recurso compartilhado entre sites.
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
 * O cookie é SameSite=Strict, isto é o segundo cadeado.
 */
function sameOriginGuard(req, res) {
  const origin = req.headers.origin;

  // Requisições sem Origin (curl, server-to-server) não carregam cookie de
  // navegador, logo não são CSRF. O guard de sessão cuida do resto.
  if (!origin) return true;

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const self = `${proto}://${host}`;

  if (origin === self || allowedOrigins().includes(origin)) return true;

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
 * IP do cliente. Na Vercel o header confiável é x-forwarded-for, cujo
 * primeiro elemento é o IP real do visitante.
 */
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'desconhecido';
}

/**
 * Envolve um handler para que qualquer exceção vire 500 sem vazar stack
 * trace nem string de conexão para o cliente.
 */
function withErrorHandling(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(`[api] ${req.method} ${req.url} falhou:`, err);
      if (!res.headersSent) fail(res, 500, 'Erro interno');
    }
  };
}

module.exports = {
  json,
  fail,
  methodGuard,
  sameOriginGuard,
  handleCors,
  requireAdmin,
  clientIp,
  securityHeaders,
  withErrorHandling
};
