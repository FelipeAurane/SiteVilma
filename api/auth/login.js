'use strict';

const { query } = require('../../lib/db');
const { verifyPin, verifyCredentials, createSessionToken, sessionCookie } = require('../../lib/auth');
const { json, fail, methodGuard, sameOriginGuard, handleCors, clientIp, withErrorHandling } = require('../../lib/http');

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 5;

/**
 * Quantas tentativas erradas este IP fez na janela recente.
 * O PIN tem só 10.000 combinações, então este limite é a defesa que mais
 * pesa contra força bruta: 5 palpites a cada 15 minutos por IP.
 */
async function recentFailures(ip) {
  const { rows } = await query(
    `SELECT count(*)::int AS failures
       FROM login_attempts
      WHERE ip = $1
        AND ok = false
        AND at > now() - ($2 || ' minutes')::interval`,
    [ip, String(WINDOW_MINUTES)]
  );
  return rows[0]?.failures ?? 0;
}

async function recordAttempt(ip, ok) {
  await query('INSERT INTO login_attempts (ip, ok) VALUES ($1, $2)', [ip, ok]);
  // Faxina barata: a tabela nunca cresce sem limite.
  if (Math.random() < 0.05) {
    await query(`DELETE FROM login_attempts WHERE at < now() - interval '1 day'`);
  }
}

module.exports = withErrorHandling(async (req, res) => {
  if (!handleCors(req, res)) return;  // responde preflight OPTIONS e adiciona headers CORS
  if (!methodGuard(req, res, ['POST', 'OPTIONS'])) return;
  if (!sameOriginGuard(req, res)) return;

  const ip = clientIp(req);

  if (await recentFailures(ip) >= MAX_FAILURES) {
    await recordAttempt(ip, false);
    return fail(res, 429, `Tentativas demais. Aguarde ${WINDOW_MINUTES} minutos.`);
  }

  const { pin, email, password } = req.body || {};

  let ok = false;
  let erroMensagem = 'Credenciais inválidas';

  if (typeof email === 'string' && typeof password === 'string') {
    ok = verifyCredentials(email, password);
    erroMensagem = 'E-mail ou senha incorretos';
  } else if (typeof pin !== 'undefined') {
    if (typeof pin !== 'string' || pin.length === 0) {
      await recordAttempt(ip, false);
      return fail(res, 400, 'PIN inválido');
    }
    ok = verifyPin(pin);
    erroMensagem = 'PIN incorreto';
  } else {
    await recordAttempt(ip, false);
    return fail(res, 400, 'Credenciais não informadas');
  }

  await recordAttempt(ip, ok);

  if (!ok) {
    return fail(res, 401, erroMensagem);
  }

  // Autenticação bem‑sucedida – gera cookie de sessão e token de retorno
  const token = createSessionToken();
  res.setHeader('Set-Cookie', sessionCookie(token));
  json(res, 200, { authenticated: true, token });
});
