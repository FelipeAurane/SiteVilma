'use strict';

const { query } = require('../../lib/db');
const { fail, methodGuard, securityHeaders, withErrorHandling } = require('../../lib/http');

/**
 * Serve uma imagem. GET /api/media/:id — público, como qualquer imagem do site.
 *
 * O id é aleatório e o conteúdo é imutável, então o cache pode ser eterno:
 * a borda da Vercel responde quase sempre sem tocar no banco.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'HEAD'])) return;

  const id = String(req.query?.id || '');
  if (!UUID.test(id)) return fail(res, 400, 'Identificador inválido');

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
