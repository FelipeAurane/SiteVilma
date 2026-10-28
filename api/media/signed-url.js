'use strict';

const { json, fail, methodGuard, sameOriginGuard, requireAdmin, withErrorHandling } = require('../../lib/http');
const { createSignedDownloadToken } = require('../../lib/imageProtection');

/**
 * Geração de URLs assinadas temporárias para download autorizado de arquivos originais.
 * POST /api/media/signed-url - Somente admin autenticado.
 */
module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, ['POST'])) return;
  if (!sameOriginGuard(req, res)) return;
  if (!requireAdmin(req, res)) return;

  const { id, expiresInSeconds = 3600 } = req.body || {};
  if (!id) return fail(res, 400, 'Identificador da mídia ausente.');

  // Valida tempo de expiração seguro (entre 60 segundos e 7 dias)
  const ttl = Math.min(Math.max(Number(expiresInSeconds) || 3600, 60), 7 * 86400);

  const token = createSignedDownloadToken(id, ttl);
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;

  json(res, 200, {
    id,
    downloadUrl: `/api/media/${id}?action=download&token=${token}`,
    token,
    expiresAt,
    expiresInSeconds: ttl
  }, { 'Cache-Control': 'no-store' });
});
