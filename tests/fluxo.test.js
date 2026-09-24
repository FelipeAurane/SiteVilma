'use strict';

/**
 * Fluxo completo: login -> cookie -> escrita autenticada -> leitura pública.
 * Usa um Postgres falso em memória no lugar do driver pg, então exercita
 * os handlers de verdade sem precisar de banco.
 */

const crypto = require('crypto');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SENHA = 'senha-de-teste-bem-longa-123';

process.env.SESSION_SECRET = crypto.randomBytes(32).toString('base64url');
process.env.DATABASE_URL = 'postgresql://fake:fake@localhost/fake';
process.env.ADMIN_PASSWORD_HASH = require(path.join(RAIZ, 'lib/auth')).hashPassword(SENHA);

// ------------------------------------------------- Postgres em memória

const store = { content: new Map(), media: new Map(), tentativas: [] };

class FakePool {
  constructor() {}
  on() {}

  async query(text, params = []) {
    const sql = text.trim();

    if (sql.startsWith('CREATE TABLE') || sql.includes('CREATE TABLE IF NOT EXISTS')) {
      return { rows: [] };
    }

    if (sql.includes('count(*)::int AS failures')) {
      const [ip] = params;
      const falhas = store.tentativas.filter((t) => t.ip === ip && !t.ok).length;
      return { rows: [{ failures: falhas }] };
    }

    if (sql.includes('INSERT INTO login_attempts')) {
      store.tentativas.push({ ip: params[0], ok: params[1] });
      return { rows: [] };
    }

    if (sql.includes('DELETE FROM login_attempts')) {
      return { rows: [] };
    }

    if (sql.includes('SELECT value, version, updated_at FROM content')) {
      const linha = store.content.get(params[0]);
      return { rows: linha ? [linha] : [] };
    }

    if (sql.includes('INSERT INTO content')) {
      const [key, valorJson] = params;
      const anterior = store.content.get(key);
      const linha = {
        value: JSON.parse(valorJson),
        version: anterior ? anterior.version + 1 : 1,
        updated_at: new Date()
      };
      store.content.set(key, linha);
      return { rows: [{ version: linha.version, updated_at: linha.updated_at }] };
    }

    if (sql.includes('INSERT INTO media')) {
      const [id, mime, bytes, size] = params;
      store.media.set(id, { mime, bytes, byte_size: size });
      return { rows: [] };
    }

    if (sql.includes('SELECT mime, bytes, byte_size FROM media')) {
      const linha = store.media.get(params[0]);
      return { rows: linha ? [linha] : [] };
    }

    throw new Error(`query não prevista no fake: ${sql.slice(0, 80)}`);
  }
}

// Injeta o fake no lugar do driver antes que lib/db o carregue.
const caminhoPg = require.resolve('pg', { paths: [RAIZ] });
require.cache[caminhoPg] = { id: caminhoPg, filename: caminhoPg, loaded: true, exports: { Pool: FakePool } };

// ------------------------------------------------------------ mocks HTTP

function mockRes() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    headersSent: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    send(p) { this.body = p; this.headersSent = true; return this; },
    end() { this.headersSent = true; return this; }
  };
}

function mockReq({ method = 'GET', headers = {}, body, query = {}, ip = '203.0.113.9' } = {}) {
  return {
    method,
    url: '/',
    headers: { host: 'site.vercel.app', 'x-forwarded-proto': 'https', 'x-forwarded-for': ip, ...headers },
    body,
    query,
    socket: { remoteAddress: ip }
  };
}

// ------------------------------------------------------------- handlers

const login = require(path.join(RAIZ, 'api/auth/login.js'));
const content = require(path.join(RAIZ, 'api/content.js'));
const media = require(path.join(RAIZ, 'api/media.js'));
const servirMidia = require(path.join(RAIZ, 'api/media/[id].js'));

const passos = [];
function passo(nome, fn) { passos.push({ nome, fn }); }
function assert(c, m) { if (!c) throw new Error(m); }

let cookie = null;

passo('login com senha errada -> 401', async () => {
  const res = mockRes();
  await login(mockReq({ method: 'POST', body: { password: 'errada' } }), res);
  assert(res.statusCode === 401, `veio ${res.statusCode} ${res.body}`);
  assert(!res.headers['set-cookie'], 'não podia emitir cookie');
});

passo('login com senha certa -> cookie HttpOnly', async () => {
  const res = mockRes();
  await login(mockReq({ method: 'POST', body: { password: SENHA } }), res);
  assert(res.statusCode === 200, `veio ${res.statusCode} ${res.body}`);

  const set = res.headers['set-cookie'];
  assert(/HttpOnly/.test(set), `faltou HttpOnly: ${set}`);
  assert(/Secure/.test(set), `faltou Secure: ${set}`);
  assert(/SameSite=Strict/.test(set), `faltou SameSite=Strict: ${set}`);

  cookie = set.split(';')[0];
});

passo('9 senhas erradas seguidas -> bloqueia com 429', async () => {
  for (let i = 0; i < 9; i++) {
    const res = mockRes();
    await login(mockReq({ method: 'POST', body: { password: 'errada' }, ip: '198.51.100.7' }), res);
    if (i === 8) {
      assert(res.statusCode === 429, `na 9ª tentativa esperava 429, veio ${res.statusCode}`);
    }
  }
});

passo('escrita autenticada grava o conteúdo', async () => {
  const res = mockRes();
  await content(mockReq({
    method: 'PUT',
    headers: { cookie },
    body: { key: 'siteData', value: { hero: { title: 'Vilma Silva' }, services: [] } }
  }), res);
  assert(res.statusCode === 200, `veio ${res.statusCode} ${res.body}`);
  assert(JSON.parse(res.body).version === 1, `versão inesperada: ${res.body}`);
});

passo('leitura pública devolve o que foi gravado', async () => {
  const res = mockRes();
  await content(mockReq({ method: 'GET', query: { key: 'siteData' } }), res);
  assert(res.statusCode === 200, `veio ${res.statusCode}`);

  const payload = JSON.parse(res.body);
  assert(payload.value.hero.title === 'Vilma Silva', `conteúdo errado: ${res.body}`);
  assert(/s-maxage/.test(res.headers['cache-control']), 'leitura pública deveria ser cacheável');
});

passo('segunda escrita incrementa a versão', async () => {
  const res = mockRes();
  await content(mockReq({
    method: 'PUT',
    headers: { cookie },
    body: { key: 'siteData', value: { hero: { title: 'Vilma Silva Fotografia' } } }
  }), res);
  assert(JSON.parse(res.body).version === 2, `esperava v2, veio ${res.body}`);
});

passo('upload de JPEG autenticado devolve URL do nosso domínio', async () => {
  const res = mockRes();
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(128, 7)]).toString('base64');

  await media(mockReq({ method: 'POST', headers: { cookie }, body: { mime: 'image/jpeg', data: jpeg } }), res);
  assert(res.statusCode === 201, `veio ${res.statusCode} ${res.body}`);

  const { url, id } = JSON.parse(res.body);
  assert(url === `/api/media/${id}`, `url inesperada: ${url}`);

  // E a imagem tem que ser servível sem login.
  const resGet = mockRes();
  await servirMidia(mockReq({ method: 'GET', query: { id } }), resGet);
  assert(resGet.statusCode === 200, `servir imagem falhou: ${resGet.statusCode}`);
  assert(resGet.headers['content-type'] === 'image/jpeg', `tipo errado: ${resGet.headers['content-type']}`);
  assert(/immutable/.test(resGet.headers['cache-control']), 'imagem deveria ter cache imutável');
  assert(resGet.headers['x-content-type-options'] === 'nosniff', 'faltou nosniff');
});

passo('id de mídia inventado -> 404', async () => {
  const res = mockRes();
  await servirMidia(mockReq({ method: 'GET', query: { id: crypto.randomUUID() } }), res);
  assert(res.statusCode === 404, `veio ${res.statusCode}`);
});

passo('id de mídia malformado -> 400 (não chega ao banco)', async () => {
  const res = mockRes();
  await servirMidia(mockReq({ method: 'GET', query: { id: "1' OR '1'='1" } }), res);
  assert(res.statusCode === 400, `veio ${res.statusCode}`);
});

// ---------------------------------------------------------------- vídeo

/** MP4 mínimo: tamanho da caixa + "ftyp" nos bytes 4..8. */
function mp4Falso(tamanho = 4096) {
  const buf = Buffer.alloc(tamanho, 3);
  buf.writeUInt32BE(24, 0);
  buf.write('ftypisom', 4, 'latin1');
  return buf;
}

let idVideo = null;

passo('upload de MP4 autenticado -> 201', async () => {
  const res = mockRes();
  await media(mockReq({
    method: 'POST',
    headers: { cookie },
    body: { mime: 'video/mp4', data: mp4Falso().toString('base64') }
  }), res);
  assert(res.statusCode === 201, `veio ${res.statusCode} ${res.body}`);
  idVideo = JSON.parse(res.body).id;
});

passo('HTML disfarçado de MP4 -> 415', async () => {
  const res = mockRes();
  const html = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
  await media(mockReq({
    method: 'POST',
    headers: { cookie },
    body: { mime: 'video/mp4', data: html }
  }), res);
  assert(res.statusCode === 415, `veio ${res.statusCode} ${res.body}`);
});

passo('vídeo acima do teto -> 413', async () => {
  const res = mockRes();
  await media(mockReq({
    method: 'POST',
    headers: { cookie },
    body: { mime: 'video/mp4', data: mp4Falso(3.2 * 1024 * 1024).toString('base64') }
  }), res);
  assert(res.statusCode === 413, `veio ${res.statusCode} ${res.body}`);
});

passo('vídeo responde a pedido de faixa com 206', async () => {
  const res = mockRes();
  await servirMidia(mockReq({
    method: 'GET',
    query: { id: idVideo },
    headers: { range: 'bytes=0-99' }
  }), res);

  assert(res.statusCode === 206, `esperava 206, veio ${res.statusCode}`);
  assert(res.headers['content-range'] === 'bytes 0-99/4096', `Content-Range errado: ${res.headers['content-range']}`);
  assert(res.headers['content-length'] === '100', `Content-Length errado: ${res.headers['content-length']}`);
  assert(res.body.length === 100, `mandou ${res.body.length} bytes em vez de 100`);
});

passo('faixa sem fim ("bytes=100-") devolve até o final', async () => {
  const res = mockRes();
  await servirMidia(mockReq({ method: 'GET', query: { id: idVideo }, headers: { range: 'bytes=100-' } }), res);
  assert(res.statusCode === 206, `veio ${res.statusCode}`);
  assert(res.headers['content-range'] === 'bytes 100-4095/4096', `Content-Range errado: ${res.headers['content-range']}`);
});

passo('faixa inválida cai para a resposta inteira', async () => {
  const res = mockRes();
  await servirMidia(mockReq({ method: 'GET', query: { id: idVideo }, headers: { range: 'bytes=99999-' } }), res);
  assert(res.statusCode === 200, `faixa fora do arquivo deveria virar 200, veio ${res.statusCode}`);
  assert(res.headers['accept-ranges'] === 'bytes', 'deveria anunciar Accept-Ranges');
});

(async () => {
  let falhas = 0;
  for (const { nome, fn } of passos) {
    try {
      await fn();
      console.log(`  ok    ${nome}`);
    } catch (err) {
      falhas++;
      console.log(` FALHA  ${nome}\n          ${err.message}`);
    }
  }
  console.log(`\n${passos.length - falhas}/${passos.length} passaram`);
  process.exit(falhas === 0 ? 0 : 1);
})();
