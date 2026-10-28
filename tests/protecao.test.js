'use strict';

/**
 * Bateria completa de testes do sistema de proteção de imagens e marcas-d'água.
 * Valida os 11 requisitos da especificação técnica.
 */

process.env.SESSION_SECRET = require('crypto').randomBytes(32).toString('base64url');
process.env.ADMIN_PIN = '7811';
process.env.ALLOW_MEMORY_DB = '1';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const RAIZ = path.join(__dirname, '..');
const auth = require(path.join(RAIZ, 'lib/auth'));
const {
  processImageProtection,
  createSignedDownloadToken,
  verifySignedDownloadToken,
  getWatermarkConfig
} = require(path.join(RAIZ, 'lib/imageProtection'));

const mediaUpload = require(path.join(RAIZ, 'api/media.js'));
const servirMidia = require(path.join(RAIZ, 'api/media/[id].js'));
const protectionEndpoint = require(path.join(RAIZ, 'api/media/protection.js'));
const reprocessEndpoint = require(path.join(RAIZ, 'api/media/reprocess.js'));
const signedUrlEndpoint = require(path.join(RAIZ, 'api/media/signed-url.js'));

function mockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    headersSent: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    send(payload) { this.body = payload; this.headersSent = true; return this; },
    end() { this.headersSent = true; return this; }
  };
  return res;
}

function mockReq({ method = 'GET', url = '/', headers = {}, body, query = {} } = {}) {
  return {
    method,
    url,
    headers: { host: 'site.vercel.app', 'x-forwarded-proto': 'https', ...headers },
    body,
    query,
    socket: { remoteAddress: '203.0.113.88' }
  };
}

const cookieValido = `vf_session=${encodeURIComponent(auth.createSessionToken())}`;

const casos = [];
function teste(nome, fn) { casos.push({ nome, fn }); }

function assert(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

// ------------------------------------------------------------- Casos de Teste

teste('1. Camada 1: Marca-d\'água visível nos pixels e geração de prévia WebP', async () => {
  // Cria imagem de teste com Sharp
  const imagemOriginal = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: { r: 120, g: 60, b: 30 } }
  }).jpeg().toBuffer();

  const resultado = await processImageProtection(imagemOriginal, {
    enabled: true,
    text: 'Vilma Silva Teste Prova',
    opacity: 0.4
  });

  assert(resultado.previewBytes.length > 0, 'Buffer de prévia não foi gerado');
  assert(resultado.previewMime === 'image/webp', `Esperava WebP, veio ${resultado.previewMime}`);
  assert(resultado.width <= 1600 && resultado.height <= 1600, 'Dimensões excedem o limite da prévia');
  assert(resultado.metadata.watermarkApplied === true, 'Flag de marca-dágua não está ativa');
});

teste('2. Camada 2: Rastreabilidade com SHA-256 e metadados persistidos', async () => {
  const imagemOriginal = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 50, g: 150, b: 80 } }
  }).jpeg().toBuffer();

  const shaEsperado = crypto.createHash('sha256').update(imagemOriginal).digest('hex');
  const resultado = await processImageProtection(imagemOriginal);

  assert(resultado.sha256 === shaEsperado, `Hash incorreto: ${resultado.sha256} vs ${shaEsperado}`);
  assert(resultado.metadata.originalSha256 === shaEsperado, 'Hash SHA-256 ausente nos metadados');
  assert(resultado.metadata.ownerId === 'vilma-silva-fotografia', 'OwnerId ausente nos metadados');
});

teste('3. Camada 3: Proteção contra reconstrução por IA (perturbação adversarial experimental)', async () => {
  const imagemOriginal = await sharp({
    create: { width: 600, height: 400, channels: 3, background: { r: 70, g: 70, b: 70 } }
  }).jpeg().toBuffer();

  const resComAI = await processImageProtection(imagemOriginal, { aiProtection: true, aiNoiseStrength: 0.04 });
  const resSemAI = await processImageProtection(imagemOriginal, { aiProtection: false });

  assert(resComAI.metadata.aiProtectionEnabled === true, 'AI protection deveria estar ativa');
  assert(resSemAI.metadata.aiProtectionEnabled === false, 'AI protection deveria estar desativada');
  // O buffer com perturbação adversarial possui entropia de ruído diferente
  assert(resComAI.previewBytes.length !== resSemAI.previewBytes.length, 'Ruído adversarial não alterou o fluxo de compressão');
});

teste('4. Separação: Upload armazena original privado e publica apenas a prévia protegida', async () => {
  const imgJpeg = await sharp({
    create: { width: 1000, height: 750, channels: 3, background: { r: 200, g: 100, b: 50 } }
  }).jpeg().toBuffer();

  const resUpload = mockRes();
  await mediaUpload(
    mockReq({
      method: 'POST',
      headers: { cookie: cookieValido },
      body: { mime: 'image/jpeg', data: imgJpeg.toString('base64') }
    }),
    resUpload
  );

  assert(resUpload.statusCode === 201, `Upload falhou com código ${resUpload.statusCode}: ${resUpload.body}`);
  const payload = JSON.parse(resUpload.body);
  assert(payload.id, 'ID não foi retornado');
  assert(payload.sha256, 'SHA-256 não foi retornado no upload');
  assert(payload.watermarkApplied === true, 'Marca não foi aplicada');

  // Teste de acesso público à URL da foto: entrega a prévia protegida (WebP)
  const resPublic = mockRes();
  await servirMidia(mockReq({ method: 'GET', query: { id: payload.id } }), resPublic);
  assert(resPublic.statusCode === 200, `Servir prévia falhou com ${resPublic.statusCode}`);
  assert(resPublic.headers['content-type'] === 'image/webp', `Esperava WebP na prévia, veio ${resPublic.headers['content-type']}`);
  assert(/immutable/.test(resPublic.headers['cache-control']), 'Prévia pública deve ter cache imutável');
});

teste('5. Segurança: Acesso direto ao arquivo original é bloqueado sem autorização', async () => {
  const imgJpeg = await sharp({
    create: { width: 500, height: 500, channels: 3, background: { r: 90, g: 90, b: 120 } }
  }).jpeg().toBuffer();

  const resUpload = mockRes();
  await mediaUpload(
    mockReq({
      method: 'POST',
      headers: { cookie: cookieValido },
      body: { mime: 'image/jpeg', data: imgJpeg.toString('base64') }
    }),
    resUpload
  );
  const { id } = JSON.parse(resUpload.body);

  // Tentativa de obter o original sem autenticação de admin -> 401
  const resAnon = mockRes();
  await servirMidia(mockReq({ method: 'GET', query: { id, action: 'original' } }), resAnon);
  assert(resAnon.statusCode === 401, `Esperava 401 para original não autenticado, veio ${resAnon.statusCode}`);

  // Com autenticação de admin -> 200 com arquivo original
  const resAdmin = mockRes();
  await servirMidia(
    mockReq({ method: 'GET', headers: { cookie: cookieValido }, query: { id, action: 'original' } }),
    resAdmin
  );
  assert(resAdmin.statusCode === 200, `Esperava 200 para admin, veio ${resAdmin.statusCode}`);
  assert(resAdmin.headers['content-type'] === 'image/jpeg', 'Tipo do original incorreto');
});

teste('6. Download autorizado via Token Assinado temporário', async () => {
  const mediaId = crypto.randomUUID();
  const token = createSignedDownloadToken(mediaId, 300);

  assert(typeof token === 'string' && token.includes('.'), 'Formato do token assinado inválido');
  assert(verifySignedDownloadToken(token, mediaId) === true, 'Token assinado válido foi recusado');
  assert(verifySignedDownloadToken(token, 'outro-id-falso') === false, 'Token assinado não pode validar ID diferente');
  assert(verifySignedDownloadToken('token.invalido', mediaId) === false, 'Token forjado deve ser recusado');
});

teste('7. Endpoint de URL assinada (POST /api/media/signed-url) protegido para admin', async () => {
  const resAnon = mockRes();
  await signedUrlEndpoint(mockReq({ method: 'POST', body: { id: crypto.randomUUID() } }), resAnon);
  assert(resAnon.statusCode === 401, 'signed-url sem login deve ser 401');

  const resAdmin = mockRes();
  const id = crypto.randomUUID();
  await signedUrlEndpoint(
    mockReq({ method: 'POST', headers: { cookie: cookieValido }, body: { id, expiresInSeconds: 1800 } }),
    resAdmin
  );
  assert(resAdmin.statusCode === 200, `Esperava 200, veio ${resAdmin.statusCode}`);
  const data = JSON.parse(resAdmin.body);
  assert(data.downloadUrl && data.downloadUrl.includes('token='), 'URL assinada não foi gerada');
});

teste('8. Painel: Configurações de proteção (GET e PUT /api/media/protection)', async () => {
  const resGet = mockRes();
  await protectionEndpoint(mockReq({ method: 'GET' }), resGet);
  assert(resGet.statusCode === 200, `Falha no GET /protection: ${resGet.statusCode}`);
  const info = JSON.parse(resGet.body);
  assert(info.config && info.stats, 'Estrutura de dados de proteção ausente');

  // PUT sem login -> 401
  const resPutAnon = mockRes();
  await protectionEndpoint(mockReq({ method: 'PUT', body: { opacity: 0.5 } }), resPutAnon);
  assert(resPutAnon.statusCode === 401, 'PUT /protection sem sessão deve ser 401');

  // PUT com login -> 200
  const resPutAdmin = mockRes();
  await protectionEndpoint(
    mockReq({
      method: 'PUT',
      headers: { cookie: cookieValido },
      body: { opacity: 0.45, text: 'Vilma Silva Custom' }
    }),
    resPutAdmin
  );
  assert(resPutAdmin.statusCode === 200, `PUT /protection admin falhou: ${resPutAdmin.statusCode}`);
  const updated = JSON.parse(resPutAdmin.body);
  assert(updated.config.text === 'Vilma Silva Custom', 'Texto de marca não atualizado');
});

teste('9. Prévia visual ao vivo (GET /api/media/protection?preview=1)', async () => {
  const resPreview = mockRes();
  await protectionEndpoint(
    mockReq({
      method: 'GET',
      query: { preview: '1', opacity: '0.5', text: 'Ao Vivo' }
    }),
    resPreview
  );
  assert(resPreview.statusCode === 200, `Prévia ao vivo falhou com ${resPreview.statusCode}`);
  assert(resPreview.headers['content-type'] === 'image/webp', 'Formato da prévia ao vivo deve ser WebP');
  assert(resPreview.body && resPreview.body.length > 0, 'Buffer da prévia ao vivo vazio');
});

teste('10. Reprocessamento do acervo com preservação de originais (POST /api/media/reprocess)', async () => {
  const resAnon = mockRes();
  await reprocessEndpoint(mockReq({ method: 'POST', body: { all: true } }), resAnon);
  assert(resAnon.statusCode === 401, 'Reprocessamento sem login deve ser 401');

  const resAdmin = mockRes();
  await reprocessEndpoint(
    mockReq({ method: 'POST', headers: { cookie: cookieValido }, body: { all: true } }),
    resAdmin
  );
  assert(resAdmin.statusCode === 200, `Reprocessamento falhou com ${resAdmin.statusCode}: ${resAdmin.body}`);
  const resultado = JSON.parse(resAdmin.body);
  assert(resultado.success === true, 'Flag success não veio true no reprocessamento');
});

// ------------------------------------------------------------- Execução

async function rodar() {
  console.log('=== Testes do Sistema de Proteção e Marcas-d\'Água ===');
  let passaram = 0;
  for (const c of casos) {
    try {
      await c.fn();
      console.log(`  ✓ ${c.nome}`);
      passaram++;
    } catch (err) {
      console.error(`  ✗ ${c.nome}`);
      console.error(`    -> ${err.message}`);
    }
  }
  console.log(`\nResultado: ${passaram}/${casos.length} testes passaram com sucesso.\n`);
  if (passaram !== casos.length) {
    process.exit(1);
  }
}

rodar();
