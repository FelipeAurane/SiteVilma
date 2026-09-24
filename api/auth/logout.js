'use strict';

const { clearedSessionCookie } = require('../../lib/auth');
const { json, methodGuard, sameOriginGuard, handleCors, withErrorHandling } = require('../../lib/http');

module.exports = withErrorHandling(async (req, res) => {
  if (!handleCors(req, res)) return;
  if (!methodGuard(req, res, ['POST', 'OPTIONS'])) return;
  if (!sameOriginGuard(req, res)) return;

  res.setHeader('Set-Cookie', clearedSessionCookie());
  json(res, 200, { authenticated: false });
});
