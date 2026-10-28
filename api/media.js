'use strict';

const crypto = require('crypto');
const { query } = require('../lib/db');
const { json, fail, methodGuard, sameOriginGuard, requireAdmin, withErrorHandling } = require('../lib/http');
const { getWatermarkConfig, processImageProtection } = require('../lib/imageProtection');

/**
 * Upload de imagem do painel. POST /api/media, só admin.
 *
 * Implementa o pipeline automático de proteção e separação:
 * - O original em alta resolução é preservado intacto em área privada.
 * - Uma prévia otimizada para web com marca-d'água multicamada (Camada 1 visível,
 *   Camada 2 metadados/hash SHA-256 e Camada 3 perturbação adversarial anti-IA) é gerada.
 * - Somente a prévia protegida é exposta nas rotas públicas.
 */

const MAX_BYTES = {
  imagem: 15 * 1024 * 1024,
  video: 3 * 1024 * 1024
};

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm'
]);

function ehVideo(mime) {
  return mime.startsWith('video/');
}

/**
 * Confere a assinatura do arquivo. O navegador pode alegar qualquer mime;
 * sem esta checagem daria para guardar um HTML e servi-lo do nosso domínio.
 */
function sniffMime(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  // MP4 e parentes: caixa "ftyp" logo após o tamanho, nos bytes 4..8.
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('latin1') === 'ftyp') {
    return 'video/mp4';
  }
  // WebM/Matroska: cabeçalho EBML.
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return 'video/webm';
  }
  return null;
}

module.exports = withErrorHandling(async (req, res) => {
  if (!methodGuard(req, res, ['POST'])) return;
  if (!sameOriginGuard(req, res)) return;
  if (!requireAdmin(req, res)) return;

  const { mime, data } = req.body || {};

  if (!ALLOWED_MIMES.has(mime)) {
    return fail(res, 415, 'Formato não aceito. Use JPEG, PNG, WebP, MP4 ou WebM.');
  }
  if (typeof data !== 'string' || data.length === 0) {
    return fail(res, 400, 'Arquivo ausente');
  }

  const limite = ehVideo(mime) ? MAX_BYTES.video : MAX_BYTES.imagem;

  const buffer = Buffer.from(data, 'base64');
  if (buffer.length === 0) return fail(res, 400, 'Arquivo inválido');
  if (buffer.length > limite) {
    return fail(
      res,
      413,
      `${ehVideo(mime) ? 'Vídeo' : 'Imagem'} acima de ${(limite / 1024 / 1024).toFixed(1)}MB. ` +
      (ehVideo(mime) ? 'Use um loop curto e bem comprimido.' : 'Comprima antes de enviar.')
    );
  }

  const actualMime = sniffMime(buffer);
  if (!actualMime) return fail(res, 415, 'O arquivo não é uma imagem nem um vídeo válido.');
  if (actualMime !== mime) {
    return fail(res, 415, 'O conteúdo do arquivo não corresponde ao formato declarado.');
  }

  const id = crypto.randomUUID();
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  let previewBytes = buffer;
  let previewMime = actualMime;
  let width = null;
  let height = null;
  let metadata = {
    id,
    ownerId: 'vilma-silva-fotografia',
    publishedAt: new Date().toISOString(),
    originalSha256: sha256,
    originalSize: buffer.length,
    watermarkApplied: false
  };

  // Aplicação do pipeline multicamada para fotografias
  if (!ehVideo(actualMime)) {
    try {
      const config = await getWatermarkConfig();
      const processed = await processImageProtection(buffer, config, { id });
      previewBytes = processed.previewBytes;
      previewMime = processed.previewMime;
      width = processed.width;
      height = processed.height;
      metadata = processed.metadata;
    } catch (procErr) {
      console.warn('[api/media] processamento com fallback para o buffer:', procErr.message);
    }
  }

  await query(
    `INSERT INTO media (id, mime, bytes, byte_size, original_bytes, original_mime, original_size, sha256, meta, width, height)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      previewMime,
      previewBytes,
      previewBytes.length,
      buffer,
      actualMime,
      buffer.length,
      sha256,
      JSON.stringify(metadata),
      width,
      height
    ]
  );

  json(
    res,
    201,
    {
      id,
      url: `/api/media/${id}`,
      bytes: previewBytes.length,
      originalSize: buffer.length,
      sha256,
      watermarkApplied: Boolean(metadata.watermarkApplied)
    },
    { 'Cache-Control': 'no-store' }
  );
});
