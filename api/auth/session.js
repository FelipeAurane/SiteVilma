'use strict';

const { getSession } = require('../../lib/auth');
const { json, methodGuard, handleCors, withErrorHandling } = require('../../lib/http');

/** O painel consulta isto no carregamento para decidir entre login e dashboard. */
module.exports = withErrorHandling(async (req, res) => {
  if (!handleCors(req, res)) return;
  if (!methodGuard(req, res, ['GET', 'OPTIONS'])) return;

  const session = getSession(req);
  json(
    res,
    200,
    { authenticated: Boolean(session), expiresAt: session ? session.exp * 1000 : null },
    { 'Cache-Control': 'no-store' }
  );
});
