'use strict';

/**
 * Testa as rotas sem banco: todas as recusas acontecem ANTES de qualquer
 * query, então dá para provar a autorização sem subir Postgres.
 */

process.env.SESSION_SECRET = require('crypto').randomBytes(32).toString('base64url');
process.env.ADMIN_PASSWORD_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA';

const path = require('path');
const RAIZ = require('path').join(__dirname, '..');

const auth = require(path.join(RAIZ, 'lib/auth'));

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
    socket: { remoteAddress: '203.0.113.5' }
  };
}

const casos = [];
function teste(nome, fn) { casos.push({ nome, fn }); }

function assert(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

const cookieValido = `vf_session=${encodeURIComponent(auth.createSessionToken())}`;

// ------------------------------------------------------------- conteúdo

const content = require(path.join(RAIZ, 'api/content.js'));

teste('PUT /api/content sem sessão -> 401', async () => {
  const res = mockRes();
  await content(mockReq({ method: 'PUT', body: { key: 'siteData', value: { a: 1 } } }), res);
  assert(res.statusCode === 401, `esperava 401, veio ${res.statusCode} ${res.body}`);
});

teste('PUT /api/content com cookie forjado -> 401', async () => {
  const res = mockRes();
  await content(mockReq({
    method: 'PUT',
    headers: { cookie: 'vf_session=eyJzdWIiOiJhZG1pbiJ9.assinaturafalsa' },
    body: { key: 'siteData', value: { a: 1 } }
  }), res);
  assert(res.statusCode === 401, `esperava 401, veio ${res.statusCode} ${res.body}`);
});

teste('PUT /api/content de outra origem -> 403', async () => {
  const res = mockRes();
  await content(mockReq({
    method: 'PUT',
    headers: { origin: 'https://site-malicioso.com', cookie: cookieValido },
    body: { key: 'siteData', value: { a: 1 } }
  }), res);
  assert(res.statusCode === 403, `esperava 403, veio ${res.statusCode} ${res.body}`);
});

teste('PUT /api/content com chave desconhecida -> 400', async () => {
  const res = mockRes();
  await content(mockReq({
    method: 'PUT',
    headers: { cookie: cookieValido },
    body: { key: 'qualquer_coisa', value: {} }
  }), res);
  assert(res.statusCode === 400, `esperava 400, veio ${res.statusCode} ${res.body}`);
});

teste('PUT /api/content acima do limite -> 413', async () => {
  const res = mockRes();
  await content(mockReq({
    method: 'PUT',
    headers: { cookie: cookieValido },
    body: { key: 'siteData', value: { lixo: 'x'.repeat(600 * 1024) } }
  }), res);
  assert(res.statusCode === 413, `esperava 413, veio ${res.statusCode} ${res.body}`);
});

teste('DELETE /api/content -> 405 com header Allow', async () => {
  const res = mockRes();
  await content(mockReq({ method: 'DELETE' }), res);
  assert(res.statusCode === 405, `esperava 405, veio ${res.statusCode}`);
  assert(res.headers.allow === 'GET, PUT', `Allow errado: ${res.headers.allow}`);
});

// ---------------------------------------------------------------- mídia

const media = require(path.join(RAIZ, 'api/media.js'));

teste('POST /api/media sem sessão -> 401', async () => {
  const res = mockRes();
  await media(mockReq({ method: 'POST', body: { mime: 'image/jpeg', data: 'AAAA' } }), res);
  assert(res.statusCode === 401, `esperava 401, veio ${res.statusCode} ${res.body}`);
});

teste('POST /api/media com HTML disfarçado de JPEG -> 415', async () => {
  const res = mockRes();
  const html = Buffer.from('<script>alert(1)</script>').toString('base64');
  await media(mockReq({
    method: 'POST',
    headers: { cookie: cookieValido },
    body: { mime: 'image/jpeg', data: html }
  }), res);
  assert(res.statusCode === 415, `esperava 415, veio ${res.statusCode} ${res.body}`);
});

teste('POST /api/media com SVG (vetor de XSS) -> 415', async () => {
  const res = mockRes();
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
  await media(mockReq({
    method: 'POST',
    headers: { cookie: cookieValido },
    body: { mime: 'image/svg+xml', data: svg }
  }), res);
  assert(res.statusCode === 415, `esperava 415, veio ${res.statusCode} ${res.body}`);
});

teste('POST /api/media com JPEG real passa da validação', async () => {
  const res = mockRes();
  // Assinatura JPEG verdadeira; vai falhar só na gravação (sem banco).
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]).toString('base64');
  await media(mockReq({
    method: 'POST',
    headers: { cookie: cookieValido },
    body: { mime: 'image/jpeg', data: jpeg }
  }), res);
  assert(res.statusCode === 500, `validação deveria passar e falhar no banco; veio ${res.statusCode} ${res.body}`);
  assert(!String(res.body).includes('DATABASE_URL'), 'vazou detalhe de configuração na resposta');
});

// --------------------------------------------------------------- sessão

const session = require(path.join(RAIZ, 'api/auth/session.js'));
const logout = require(path.join(RAIZ, 'api/auth/logout.js'));

teste('GET /api/auth/session sem cookie -> não autenticado', async () => {
  const res = mockRes();
  await session(mockReq({ method: 'GET' }), res);
  assert(res.statusCode === 200, `esperava 200, veio ${res.statusCode}`);
  assert(JSON.parse(res.body).authenticated === false, 'deveria dizer que não está autenticado');
  assert(res.headers['cache-control'] === 'no-store', 'sessão não pode ser cacheada');
});

teste('GET /api/auth/session com cookie válido -> autenticado', async () => {
  const res = mockRes();
  await session(mockReq({ method: 'GET', headers: { cookie: cookieValido } }), res);
  assert(JSON.parse(res.body).authenticated === true, 'deveria reconhecer a sessão');
});

teste('POST /api/auth/logout limpa o cookie', async () => {
  const res = mockRes();
  await logout(mockReq({ method: 'POST', headers: { cookie: cookieValido }, body: {} }), res);
  assert(res.statusCode === 200, `esperava 200, veio ${res.statusCode}`);
  assert(/Max-Age=0/.test(res.headers['set-cookie']), `cookie não foi expirado: ${res.headers['set-cookie']}`);
});

// ---------------------------------------------------------- sessão expirada

teste('Sessão expirada é recusada', async () => {
  const crypto = require('crypto');
  const corpo = Buffer.from(JSON.stringify({
    sub: 'admin',
    iat: 1,
    exp: Math.floor(Date.now() / 1000) - 60,
    jti: 'x'
  })).toString('base64url');
  const assinatura = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(corpo).digest('base64url');

  const res = mockRes();
  await content(mockReq({
    method: 'PUT',
    headers: { cookie: `vf_session=${corpo}.${assinatura}` },
    body: { key: 'siteData', value: {} }
  }), res);
  assert(res.statusCode === 401, `sessão vencida deveria dar 401, veio ${res.statusCode}`);
});

// --------------------------------------------------------------- execução

(async () => {
  let falhas = 0;
  for (const { nome, fn } of casos) {
    try {
      await fn();
      console.log(`  ok    ${nome}`);
    } catch (err) {
      falhas++;
      console.log(` FALHA  ${nome}\n          ${err.message}`);
    }
  }
  console.log(`\n${casos.length - falhas}/${casos.length} passaram`);
  process.exit(falhas === 0 ? 0 : 1);
})();
