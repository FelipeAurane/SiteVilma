'use strict';

const crypto = require('crypto');
const sharp = require('sharp');
const { query } = require('./db');
const { optionalEnv } = require('./env');

/**
 * Sistema avançado de proteção de fotografias e marcas-d'água multicamada.
 *
 * Camada 1: Marca-d'água visível renderizada diretamente nos pixels (mosaico diagonal + selo central + micro-dados).
 * Camada 2: Identificador único, metadados EXIF/XMP e hash SHA-256 persistido no banco e embutido no arquivo.
 * Camada 3: Proteção contra reconstrução por IA (perturbação adversarial de alta frequência / granulação sutil opcional).
 */

const DEFAULT_WATERMARK_CONFIG = {
  enabled: true,
  text: 'Vilma Silva Fotografia',
  secondaryText: 'Prova de Seleção • Todos os direitos reservados',
  opacity: 0.32,
  angle: -26,
  spacing: 240,
  fontSize: 20,
  pattern: 'diagonal_grid', // 'diagonal_grid' | 'mosaic' | 'center_only'
  centerMark: true,
  badgePosition: 'top', // 'top' | 'bottom' | 'center'
  maxPreviewWidth: 1600,
  maxPreviewHeight: 1600,
  quality: 82,
  format: 'webp', // 'webp' | 'jpeg'
  aiProtection: true, // Perturbação adversarial experimental
  aiNoiseStrength: 0.035
};

/**
 * Obtém a configuração de proteção persistida no banco ou retorna os padrões.
 */
async function getWatermarkConfig() {
  try {
    const { rows } = await query('SELECT value FROM content WHERE key = $1', ['watermarkConfig']);
    if (rows && rows.length > 0 && rows[0].value) {
      const saved = rows[0].value;
      return { ...DEFAULT_WATERMARK_CONFIG, ...saved };
    }
  } catch (err) {
    console.warn('[imageProtection] usando configuração padrão:', err.message);
  }
  return { ...DEFAULT_WATERMARK_CONFIG };
}

/**
 * Escapa strings para uso seguro em XML / SVG.
 */
function escapeXml(unsafe) {
  if (typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Gera o SVG dinâmico contendo as camadas de proteção visual adaptadas às dimensões da imagem.
 */
function generateWatermarkSvg(width, height, config, id = '', hash = '') {
  const {
    enabled = true,
    text = 'Vilma Silva Fotografia',
    secondaryText = 'Prova de Seleção • Todos os direitos reservados',
    opacity = 0.32,
    angle = -26,
    spacing = 240,
    fontSize = 20,
    pattern = 'diagonal_grid',
    centerMark = true,
    badgePosition = 'top',
    aiProtection = true,
    aiNoiseStrength = 0.035
  } = config;

  if (!enabled) {
    // Se desativada a marca visível, retorna SVG vazio transparente
    return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"></svg>`);
  }

  const safeText = escapeXml(text);
  const safeSecondary = escapeXml(secondaryText);
  const safeIdShort = escapeXml(id ? id.slice(0, 8) : 'PROVA');
  const safeHashShort = escapeXml(hash ? hash.slice(0, 12) : '');

  const opVal = Math.min(Math.max(opacity, 0.05), 0.95);
  const strokeOp = Math.min(opVal * 0.85, 0.8);
  const fillWhite = `rgba(255, 255, 255, ${opVal.toFixed(3)})`;
  const strokeBlack = `rgba(0, 0, 0, ${strokeOp.toFixed(3)})`;

  // Escala adaptativa conforme o tamanho da imagem
  const menorDimensao = Math.min(width, height);
  const escala = Math.max(0.6, menorDimensao / 1000);
  const tamFonte = Math.round(fontSize * escala);
  const tamEspacamento = Math.round(spacing * escala);

  let gridMarkup = '';

  if (pattern !== 'center_only') {
    // Mosaico / grade diagonal repetida em toda a superfície
    gridMarkup = `
      <defs>
        <pattern id="wm-pattern" width="${tamEspacamento}" height="${tamEspacamento}"
                 patternUnits="userSpaceOnUse"
                 patternTransform="rotate(${angle})">
          <text x="12" y="${tamFonte + 8}"
                fill="${fillWhite}"
                stroke="${strokeBlack}"
                stroke-width="1.2"
                paint-order="stroke fill"
                font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
                font-size="${tamFonte}px"
                font-weight="700"
                letter-spacing="0.08em">${safeText}</text>
          <text x="32" y="${tamFonte * 2 + 18}"
                fill="rgba(255, 255, 255, ${(opVal * 0.75).toFixed(3)})"
                stroke="${strokeBlack}"
                stroke-width="0.8"
                paint-order="stroke fill"
                font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
                font-size="${Math.max(10, Math.round(tamFonte * 0.65))}px"
                font-weight="600"
                letter-spacing="0.06em">${safeSecondary}</text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#wm-pattern)" />
    `;
  }

  // Selo de autoria (topo ou base por padrão, para não cobrir o centro da foto)
  let centerMarkup = '';
  if (centerMark) {
    const cx = width / 2;
    const badgeW = Math.min(width * 0.72, Math.max(300, 420 * escala));
    const badgeH = Math.max(76, 94 * escala);
    const boxX = cx - badgeW / 2;
    const boxY = badgePosition === 'bottom'
      ? height - badgeH - Math.max(28, 38 * escala)
      : badgePosition === 'center'
        ? (height / 2) - (badgeH / 2)
        : Math.max(24, 32 * escala);
    const cy = boxY + badgeH / 2;
    const badgeOp = Math.min(opVal + 0.12, 0.88);

    centerMarkup = `
      <!-- Selo Central Reforçado -->
      <g id="selo-central">
        <!-- Fundo semi-translúcido para impedir que IA use contraste de fundo para remover -->
        <rect x="${boxX}" y="${boxY}" width="${badgeW}" height="${badgeH}" rx="14"
              fill="rgba(10, 10, 12, ${(badgeOp * 0.55).toFixed(3)})"
              stroke="rgba(255, 255, 255, ${(badgeOp * 0.4).toFixed(3)})"
              stroke-width="1.4" />

        <!-- Linha de detalhe interna -->
        <rect x="${boxX + 4}" y="${boxY + 4}" width="${badgeW - 8}" height="${badgeH - 8}" rx="10"
              fill="none"
              stroke="rgba(59, 130, 246, ${(badgeOp * 0.5).toFixed(3)})"
              stroke-width="1" stroke-dasharray="6,4" />

        <!-- Título do Selo -->
        <text x="${cx}" y="${cy - 8 * escala}"
              text-anchor="middle"
              fill="rgba(255, 255, 255, ${badgeOp.toFixed(3)})"
              stroke="rgba(0, 0, 0, 0.7)"
              stroke-width="1.5"
              paint-order="stroke fill"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
              font-size="${Math.max(16, Math.round(22 * escala))}px"
              font-weight="800"
              letter-spacing="0.12em">${safeText}</text>

        <!-- Subtítulo e advertência legal -->
        <text x="${cx}" y="${cy + 18 * escala}"
              text-anchor="middle"
              fill="rgba(147, 197, 253, ${badgeOp.toFixed(3)})"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
              font-size="${Math.max(11, Math.round(12.5 * escala))}px"
              font-weight="600"
              letter-spacing="0.14em">PROVA DE SELEÇÃO • NÃO AUTORIZADO PARA USO</text>
      </g>
    `;
  }

  // Faixa inferior de micro-identificação e rastreabilidade digital
  const rodapéY = height - 12;
  const rodapeInfo = `ID: ${safeIdShort} • ${safeHashShort ? 'SHA256: ' + safeHashShort + ' • ' : ''}LEI Nº 9.610/98`;

  // Camada 3: Perturbação adversarial experimental (ruído de alta frequência sintetizado via SVG filter)
  // Cria micro-textura que quebra superfícies contínuas para inpainting de IA sem degradar a fotografia para o olho humano
  let noiseMarkup = '';
  if (aiProtection) {
    const noiseOp = Math.min(Math.max(aiNoiseStrength, 0.01), 0.08);
    noiseMarkup = `
      <defs>
        <filter id="adv-noise" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" result="noise"/>
          <feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 ${noiseOp.toFixed(3)} 0"/>
        </filter>
      </defs>
      <rect width="100%" height="100%" filter="url(#adv-noise)" pointer-events="none" />
    `;
  }

  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${noiseMarkup}
      ${gridMarkup}
      ${centerMarkup}
      <text x="${width / 2}" y="${rodapéY}"
            text-anchor="middle"
            fill="rgba(255, 255, 255, ${Math.min(opVal + 0.1, 0.7).toFixed(3)})"
            stroke="rgba(0, 0, 0, 0.85)"
            stroke-width="0.8"
            paint-order="stroke fill"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace"
            font-size="${Math.max(10, Math.round(11 * escala))}px"
            font-weight="600"
            letter-spacing="0.1em">${rodapeInfo}</text>
    </svg>
  `;

  return Buffer.from(svg);
}

/**
 * Pipeline completo de processamento:
 * 1. Análise do buffer original (metadados e integridade).
 * 2. Cálculo do hash criptográfico SHA-256.
 * 3. Redimensionamento otimizado para web (limite configurável).
 * 4. Aplicação de marca-d'água visível multicamada diretamente nos pixels.
 * 5. Aplicação de perturbação adversarial de alta frequência (se ativada).
 * 6. Embutimento de metadados invisíveis de autoria (EXIF / IPTC).
 * 7. Compressão WebP ou JPEG de alta eficiência.
 */
async function processImageProtection(originalBuffer, customConfig = {}, extraMeta = {}) {
  const config = { ...DEFAULT_WATERMARK_CONFIG, ...customConfig };

  // 1. Integridade e metadados da imagem original
  const image = sharp(originalBuffer);
  const meta = await image.metadata();

  if (!meta.width || !meta.height) {
    throw new Error('Dimensões da imagem não puderam ser identificadas');
  }

  const originalWidth = meta.width;
  const originalHeight = meta.height;

  // 2. Hash SHA-256 do arquivo original
  const sha256 = crypto.createHash('sha256').update(originalBuffer).digest('hex');
  const mediaId = extraMeta.id || crypto.randomUUID();

  // 3. Cálculo de proporção e redimensionamento para prévia pública
  const maxW = config.maxPreviewWidth || 1600;
  const maxH = config.maxPreviewHeight || 1600;

  let targetW = originalWidth;
  let targetH = originalHeight;

  if (targetW > maxW || targetH > maxH) {
    const ratio = Math.min(maxW / targetW, maxH / targetH);
    targetW = Math.round(targetW * ratio);
    targetH = Math.round(targetH * ratio);
  }

  // Redimensiona o original mantendo orientação correta de EXIF
  let pipeline = sharp(originalBuffer).rotate().resize(targetW, targetH, {
    fit: 'inside',
    withoutEnlargement: true
  });

  // Renderiza a base para saber dimensões finais exatas após rotação/resize
  const resizedBuffer = await pipeline.toBuffer();
  const resizedMeta = await sharp(resizedBuffer).metadata();
  const finalW = resizedMeta.width || targetW;
  const finalH = resizedMeta.height || targetH;

  // 4. Marca-d'água visível multicamada
  const svgOverlayBuffer = generateWatermarkSvg(finalW, finalH, config, mediaId, sha256);

  // 5. Composita diretamente nos pixels da imagem
  let composited = sharp(resizedBuffer).composite([
    {
      input: svgOverlayBuffer,
      blend: 'over'
    }
  ]);

  // 6. Metadados invisíveis embutidos no arquivo (EXIF / XMP)
  const exifPayload = {
    IFD0: {
      Artist: 'Vilma Silva Fotografia',
      Copyright: '© Vilma Silva Fotografia. Prova de seleção protegida por lei nº 9.610/98.',
      ImageDescription: JSON.stringify({
        id: mediaId,
        sha256,
        owner: 'vilma-silva-fotografia',
        publishedAt: new Date().toISOString()
      })
    }
  };

  try {
    composited = composited.withMetadata({
      exif: exifPayload
    });
  } catch (exifErr) {
    // Se o formato não suportar escrita de EXIF completa, prossegue com metadata padrão
    composited = composited.withMetadata();
  }

  // 7. Compressão final
  const formatoDesejado = config.format === 'jpeg' ? 'jpeg' : 'webp';
  const qualidade = Math.min(Math.max(config.quality || 82, 50), 95);

  let previewBuffer;
  let previewMime;

  if (formatoDesejado === 'jpeg') {
    previewBuffer = await composited.jpeg({ quality: qualidade, mozjpeg: true }).toBuffer();
    previewMime = 'image/jpeg';
  } else {
    previewBuffer = await composited.webp({ quality: qualidade, effort: 4 }).toBuffer();
    previewMime = 'image/webp';
  }

  const resultMeta = {
    id: mediaId,
    ownerId: 'vilma-silva-fotografia',
    galleryId: extraMeta.galleryId || 'padrao',
    publishedAt: new Date().toISOString(),
    originalSha256: sha256,
    originalSize: originalBuffer.length,
    originalWidth,
    originalHeight,
    previewSize: previewBuffer.length,
    previewWidth: finalW,
    previewHeight: finalH,
    watermarkApplied: Boolean(config.enabled),
    aiProtectionEnabled: Boolean(config.aiProtection),
    format: formatoDesejado
  };

  return {
    id: mediaId,
    previewBytes: previewBuffer,
    previewMime,
    previewSize: previewBuffer.length,
    width: finalW,
    height: finalH,
    sha256,
    metadata: resultMeta
  };
}

/**
 * Cria token assinado temporário para download autorizado do arquivo original.
 */
function createSignedDownloadToken(mediaId, expiresInSeconds = 3600) {
  const secret = optionalEnv('SESSION_SECRET') || 'vilma-secret-download-key-fallback';
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${mediaId}:${expiresAt}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${expiresAt}.${sig}`;
}

/**
 * Valida o token assinado de download para um ID específico.
 */
function verifySignedDownloadToken(token, mediaId) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [expiresAtStr, sig] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (now > expiresAt) return false; // Token expirado

  const secret = optionalEnv('SESSION_SECRET') || 'vilma-secret-download-key-fallback';
  const payload = `${mediaId}:${expiresAt}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch {
    return false;
  }
}

module.exports = {
  DEFAULT_WATERMARK_CONFIG,
  getWatermarkConfig,
  generateWatermarkSvg,
  processImageProtection,
  createSignedDownloadToken,
  verifySignedDownloadToken
};
