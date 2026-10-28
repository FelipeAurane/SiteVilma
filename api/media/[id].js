'use strict';

const { query } = require('../../lib/db');
const { fail, methodGuard, securityHeaders, requireAdmin, withErrorHandling } = require('../../lib/http');
const { verifySignedDownloadToken } = require('../../lib/imageProtection');

/**
 * Serve uma imagem.
 * - GET /api/media/:id -> público, serve EXCLUSIVAMENTE a prévia protegida com marca-d'água.
 * - GET /api/media/:id?action=original -> restrito, exige autenticação de admin.
 * - GET /api/media/:id?action=download&token=... -> download autorizado via token assinado temporário.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'HEAD'])) return;

  const id = String(req.query?.id || '');
  if (!UUID.test(id)) return fail(res, 400, 'Identificador inválido');

  const action = String(req.query?.action || '');
  const token = String(req.query?.token || '');

  // 1. Download do original autorizado via Token Assinado
  if (action === 'download' || token) {
    const tokenValido = verifySignedDownloadToken(token, id);
    const ehAdmin = Boolean(req.headers.cookie?.includes('vf_session') || req.headers.authorization);

    if (!tokenValido && !ehAdmin) {
      return fail(res, 403, 'Acesso não autorizado. Link de download inválido ou expirado.');
    }

    const { rows: origRows } = await query(
      'SELECT original_mime, original_bytes, original_size, sha256 FROM media WHERE id = $1',
      [id]
    );

    if (origRows.length === 0 || !origRows[0].original_bytes) {
      return fail(res, 404, 'Arquivo original não encontrado.');
    }

    const { original_mime: mime, original_bytes: bytes, original_size: byteSize } = origRows[0];
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';

    securityHeaders(res);
    res.setHeader('Content-Type', mime || 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="foto-${id.slice(0, 8)}.${ext}"`);
    res.setHeader('Content-Length', String(byteSize || bytes.length));
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(bytes);
  }

  // 2. Acesso direto ao original em alta resolução (Área Privada - Só Admin)
  if (action === 'original') {
    if (!requireAdmin(req, res)) return;

    const { rows: origRows } = await query(
      'SELECT original_mime, original_bytes, original_size, sha256 FROM media WHERE id = $1',
      [id]
    );

    if (origRows.length === 0 || !origRows[0].original_bytes) {
      return fail(res, 404, 'Arquivo original não encontrado.');
    }

    const { original_mime: mime, original_bytes: bytes, original_size: byteSize } = origRows[0];
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';

    securityHeaders(res);
    res.setHeader('Content-Type', mime || 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="original-${id.slice(0, 8)}.${ext}"`);
    res.setHeader('Content-Length', String(byteSize || bytes.length));
    res.setHeader('Cache-Control', 'private, no-cache');

    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(bytes);
  }

  // 3. Rota pública padrão: entrega EXCLUSIVAMENTE a prévia protegida com marca-d'água
  const { rows } = await query('SELECT mime, bytes, byte_size FROM media WHERE id = $1', [id]);
  if (rows.length === 0) return fail(res, 404, 'Imagem não encontrada');

  const { mime, bytes, byte_size: byteSize } = rows[0];

  securityHeaders(res);
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  // Nunca renderizar como documento, mesmo que algo escape da validação.
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Accept-Ranges', 'bytes');

  // O Safari só toca vídeo se o servidor responder a pedido de faixa; sem
  // isto o hero em vídeo fica parado no iPhone.
  const faixa = pedidoDeFaixa(req.headers.range, byteSize);

  if (faixa) {
    res.setHeader('Content-Range', `bytes ${faixa.inicio}-${faixa.fim}/${byteSize}`);
    res.setHeader('Content-Length', String(faixa.fim - faixa.inicio + 1));
    if (req.method === 'HEAD') return res.status(206).end();
    return res.status(206).send(bytes.subarray(faixa.inicio, faixa.fim + 1));
  }

  res.setHeader('Content-Length', String(byteSize));
  if (req.method === 'HEAD') return res.status(200).end();
  res.status(200).send(bytes);
});

/**
 * Interpreta "Range: bytes=INICIO-FIM". Devolve null quando não há pedido
 * de faixa ou quando ele não faz sentido — aí a resposta vai inteira.
 */
function pedidoDeFaixa(cabecalho, total) {
  if (typeof cabecalho !== 'string') return null;

  const casou = /^bytes=(\d*)-(\d*)$/.exec(cabecalho.trim());
  if (!casou) return null;

  const [, cru1, cru2] = casou;
  if (cru1 === '' && cru2 === '') return null;

  let inicio;
  let fim;

  if (cru1 === '') {
    // "bytes=-500": os últimos 500 bytes.
    const ultimos = Number(cru2);
    if (!Number.isFinite(ultimos) || ultimos <= 0) return null;
    inicio = Math.max(0, total - ultimos);
    fim = total - 1;
  } else {
    inicio = Number(cru1);
    fim = cru2 === '' ? total - 1 : Number(cru2);
  }

  if (!Number.isFinite(inicio) || !Number.isFinite(fim)) return null;
  if (inicio < 0 || inicio >= total || fim < inicio) return null;

  return { inicio, fim: Math.min(fim, total - 1) };
}
