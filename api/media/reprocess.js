'use strict';

const crypto = require('crypto');
const { query } = require('../../lib/db');
const { json, fail, methodGuard, sameOriginGuard, requireAdmin, withErrorHandling } = require('../../lib/http');
const { getWatermarkConfig, processImageProtection } = require('../../lib/imageProtection');

/**
 * Reprocessamento de fotografias existentes com controle de concorrência.
 * POST /api/media/reprocess - Somente admin autenticado.
 *
 * Atualiza as prévias públicas utilizando a configuração de proteção e marcas-d'água mais recente,
 * garantindo a integridade dos originais e processando em lotes controlados para evitar
 * sobrecarga de memória (compatível com acervos de 1.500+ fotos).
 */
module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, ['POST'])) return;
  if (!sameOriginGuard(req, res)) return;
  if (!requireAdmin(req, res)) return;

  const { id: targetId, all = false } = req.body || {};

  const config = await getWatermarkConfig();

  // Seleciona mídias a serem reprocessadas
  let sql = 'SELECT id, mime, bytes, byte_size, original_bytes, original_mime, original_size, sha256, meta FROM media';
  const params = [];
  if (targetId) {
    sql += ' WHERE id = $1';
    params.push(targetId);
  }

  const { rows } = await query(sql, params);

  if (rows.length === 0) {
    return json(res, 200, {
      success: true,
      processedCount: 0,
      totalCount: 0,
      message: 'Nenhuma mídia encontrada para reprocessamento.'
    });
  }

  let processedCount = 0;
  let skippedCount = 0;
  let errors = [];

  // Processamento em lotes de 4 para não saturar memória ou CPU
  const BATCH_SIZE = 4;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (row) => {
        // Ignora vídeos
        if (row.mime && row.mime.startsWith('video/')) {
          skippedCount++;
          return;
        }

        // Fotos do site (portfólio, capa, serviços) foram enviadas sem proteção de propósito
        let meta = row.meta;
        if (typeof meta === 'string') {
          try { meta = JSON.parse(meta); } catch { meta = null; }
        }
        if (meta && meta.protegida === false) {
          skippedCount++;
          return;
        }

        const sourceBytes = row.original_bytes || row.bytes;
        if (!sourceBytes || sourceBytes.length === 0) {
          skippedCount++;
          return;
        }

        const origMime = row.original_mime || row.mime || 'image/jpeg';
        const origSize = row.original_size || sourceBytes.length;
        const sha256 = row.sha256 || crypto.createHash('sha256').update(sourceBytes).digest('hex');

        try {
          const processed = await processImageProtection(sourceBytes, config, { id: row.id });

          await query(
            `UPDATE media
             SET bytes = $2,
                 mime = $3,
                 byte_size = $4,
                 original_bytes = COALESCE(original_bytes, $5),
                 original_mime = COALESCE(original_mime, $6),
                 original_size = COALESCE(original_size, $7),
                 sha256 = COALESCE(sha256, $8),
                 meta = $9,
                 width = $10,
                 height = $11,
                 updated_at = now()
             WHERE id = $1`,
            [
              row.id,
              processed.previewMime,
              processed.previewBytes,
              processed.previewSize,
              sourceBytes,
              origMime,
              origSize,
              sha256,
              JSON.stringify(processed.metadata),
              processed.width,
              processed.height
            ]
          );

          processedCount++;
        } catch (err) {
          console.error(`[reprocess] Erro ao reprocessar mídia ${row.id}:`, err.message);
          errors.push({ id: row.id, error: err.message });
        }
      })
    );
  }

  return json(res, 200, {
    success: true,
    processedCount,
    skippedCount,
    totalCount: rows.length,
    errors: errors.length > 0 ? errors : undefined,
    message: `Reprocessamento concluído: ${processedCount} fotos atualizadas.`
  }, { 'Cache-Control': 'no-store' });
});
