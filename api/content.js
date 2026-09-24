'use strict';

const { query } = require('../lib/db');
const { json, fail, methodGuard, sameOriginGuard, handleCors, requireAdmin, withErrorHandling } = require('../lib/http');

/**
 * Conteúdo do site.
 *
 *   GET  /api/content?key=siteData   público, cacheado na borda
 *   PUT  /api/content                só admin autenticado
 *
 * A leitura é aberta porque é exatamente o que o visitante vê na página.
 * A escrita exige sessão — é isto que o site não tinha antes.
 */

// Chaves conhecidas. Impede que a API vire um armazenamento genérico para
// quem descobrir o endpoint.
const ALLOWED_KEYS = new Set(['siteData', 'faqs', 'availableDates', 'visibility']);

const MAX_DOCUMENT_BYTES = 512 * 1024;

module.exports = withErrorHandling(async (req, res) => {
  if (!handleCors(req, res)) return;
  if (!methodGuard(req, res, ['GET', 'PUT', 'OPTIONS'])) return;

  if (req.method === 'GET') {
    const key = String(req.query?.key || 'siteData');
    if (!ALLOWED_KEYS.has(key)) return fail(res, 400, 'Chave desconhecida');

    const { rows } = await query(
      'SELECT value, version, updated_at FROM content WHERE key = $1',
      [key]
    );

    if (rows.length === 0) {
      // 200 com value null: o front tem fallback próprio e não deve tratar
      // "ainda não configurado" como erro.
      return json(res, 200, { key, value: null, version: 0, updatedAt: null }, {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300'
      });
    }

    const row = rows[0];
    return json(
      res,
      200,
      {
        key,
        value: row.value,
        version: row.version,
        updatedAt: row.updated_at
      },
      {
        // Cache curto na borda da Vercel: o painel publica e o site reflete
        // em segundos, sem bater no banco a cada visita.
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300'
      }
    );
  }

  // ------------------------------------------------------------ escrita
  if (!sameOriginGuard(req, res)) return;
  if (!requireAdmin(req, res)) return;

  const { key, value } = req.body || {};

  if (!ALLOWED_KEYS.has(key)) return fail(res, 400, 'Chave desconhecida');
  if (value === undefined || value === null) return fail(res, 400, 'Conteúdo ausente');

  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_DOCUMENT_BYTES) {
    return fail(res, 413, 'Conteúdo grande demais. Imagens vão em /api/media, não dentro do JSON.');
  }

  const { rows } = await query(
    `INSERT INTO content (key, value, version, updated_at)
          VALUES ($1, $2::jsonb, 1, now())
     ON CONFLICT (key) DO UPDATE
            SET value      = EXCLUDED.value,
                version    = content.version + 1,
                updated_at = now()
      RETURNING version, updated_at`,
    [key, serialized]
  );

  json(res, 200, { key, version: rows[0].version, updatedAt: rows[0].updated_at }, {
    'Cache-Control': 'no-store'
  });
});
