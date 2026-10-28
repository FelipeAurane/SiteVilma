'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { query } = require('../../lib/db');
const { json, fail, methodGuard, sameOriginGuard, requireAdmin, withErrorHandling } = require('../../lib/http');
const {
  getWatermarkConfig,
  processImageProtection,
  DEFAULT_WATERMARK_CONFIG
} = require('../../lib/imageProtection');

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'PUT'])) return;

  // 1. GET: Retorna configuração atual e estatísticas, ou prévia visual ao vivo
  if (req.method === 'GET') {
    const isLivePreview = req.query?.preview === '1' || req.query?.preview === 'true';

    if (isLivePreview) {
      // Visualização prévia dinâmica com os parâmetros fornecidos via query
      const customConfig = {
        enabled: req.query.enabled !== 'false',
        text: req.query.text || 'Vilma Silva Fotografia',
        secondaryText: req.query.secondaryText || 'Prova de Seleção • Todos os direitos reservados',
        opacity: req.query.opacity !== undefined ? Number(req.query.opacity) : 0.35,
        angle: req.query.angle !== undefined ? Number(req.query.angle) : -26,
        spacing: req.query.spacing !== undefined ? Number(req.query.spacing) : 240,
        fontSize: req.query.fontSize !== undefined ? Number(req.query.fontSize) : 20,
        pattern: req.query.pattern || 'diagonal_grid',
        centerMark: req.query.centerMark !== 'false',
        aiProtection: req.query.aiProtection !== 'false',
        aiNoiseStrength: req.query.aiNoiseStrength !== undefined ? Number(req.query.aiNoiseStrength) : 0.035,
        quality: 80,
        format: 'webp'
      };

      // Usa a foto de capa de amostra
      const samplePath = path.join(__dirname, '..', '..', 'src', 'img', 'capa.jpg');
      let sampleBuffer;
      if (fs.existsSync(samplePath)) {
        sampleBuffer = fs.readFileSync(samplePath);
      } else {
        // Fallback: gera um fundo elegante caso o arquivo não exista
        sampleBuffer = await sharp({
          create: {
            width: 800,
            height: 600,
            channels: 3,
            background: { r: 35, g: 30, b: 28 }
          }
        }).jpeg().toBuffer();
      }

      try {
        const processed = await processImageProtection(sampleBuffer, customConfig, { id: 'amostra-previa' });
        res.setHeader('Content-Type', processed.previewMime);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(processed.previewBytes);
      } catch (err) {
        return fail(res, 500, `Falha ao gerar prévia: ${err.message}`);
      }
    }

    // Retorna a configuração atual e o resumo de proteção de dados
    const config = await getWatermarkConfig();

    let totalMedia = 0;
    let originalProtectedCount = 0;
    let watermarkedCount = 0;
    let recentHashes = [];

    try {
      const { rows } = await query('SELECT id, mime, original_size, sha256, meta, created_at FROM media ORDER BY created_at DESC', []);
      totalMedia = rows.length;
      for (const r of rows) {
        if (r.original_size) originalProtectedCount++;
        if (r.sha256) {
          watermarkedCount++;
          if (recentHashes.length < 5) {
            recentHashes.push({ id: r.id, sha256: r.sha256, createdAt: r.created_at });
          }
        }
      }
    } catch (_) {}

    return json(res, 200, {
      config,
      defaults: DEFAULT_WATERMARK_CONFIG,
      stats: {
        totalMedia,
        originalProtectedCount,
        watermarkedCount,
        recentHashes
      }
    }, { 'Cache-Control': 'no-store' });
  }

  // 2. PUT: Atualiza as configurações de proteção (só admin autenticado)
  if (!sameOriginGuard(req, res)) return;
  if (!requireAdmin(req, res)) return;

  const bodyConfig = req.body || {};
  const current = await getWatermarkConfig();
  const merged = { ...current, ...bodyConfig };

  // Validações básicas de intervalo
  merged.opacity = Math.min(Math.max(Number(merged.opacity) || 0.35, 0.05), 0.95);
  merged.angle = Math.min(Math.max(Number(merged.angle) || -26, -90), 90);
  merged.spacing = Math.min(Math.max(Number(merged.spacing) || 240, 80), 600);
  merged.fontSize = Math.min(Math.max(Number(merged.fontSize) || 20, 10), 48);
  merged.maxPreviewWidth = Math.min(Math.max(Number(merged.maxPreviewWidth) || 1600, 600), 2560);
  merged.maxPreviewHeight = Math.min(Math.max(Number(merged.maxPreviewHeight) || 1600, 600), 2560);
  merged.quality = Math.min(Math.max(Number(merged.quality) || 82, 50), 95);
  merged.aiNoiseStrength = Math.min(Math.max(Number(merged.aiNoiseStrength) || 0.035, 0.005), 0.1);

  await query(
    `INSERT INTO content (key, value, version, updated_at)
     VALUES ('watermarkConfig', $1::jsonb, 1, now())
     ON CONFLICT (key) DO UPDATE
     SET value = EXCLUDED.value, version = content.version + 1, updated_at = now()`,
    [JSON.stringify(merged)]
  );

  return json(res, 200, { ok: true, config: merged }, { 'Cache-Control': 'no-store' });
});
