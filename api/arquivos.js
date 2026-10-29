'use strict';

/**
 * Gerenciador de arquivos do painel.
 *
 *   GET    /api/arquivos?path=<rel>        lista um diretorio
 *   GET    /api/arquivos/ler?path=<rel>    le um arquivo de texto
 *   PUT    /api/arquivos                   grava texto { path, conteudo }
 *   POST   /api/arquivos/pasta             cria pasta { path }
 *   POST   /api/arquivos/renomear          move { de, para }
 *   POST   /api/arquivos/enviar            sobe arquivo { path, nome, mime, data }
 *   DELETE /api/arquivos?path=<rel>        apaga { path, tipo }
 *
 * Tudo exige sessao de admin, ate a leitura: um caminho relativo como
 * "../../.env" e um caminho absoluto nao sao a mesma coisa, e quem responde e
 * sempre o servidor.
 *
 * A raiz vem de PAINEL_ARQUIVOS_RAIZ. Todo caminho e resolvido contra ela e
 * conferido depois de resolver: se o resultado cair fora da raiz, e 403. Isso
 * vale para criar link simbolico apontando para fora tambem — a verificacao
 * acontece no caminho real, nao no que foi digitado.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const { optionalEnv } = require('../lib/env');
const {
  json,
  fail,
  methodGuard,
  sameOriginGuard,
  handleCors,
  requireAdmin,
  withErrorHandling
} = require('../lib/http');

// Base64 incha ~33% e o corpo JSON tem teto; 3MB de arquivo vira ~4MB no fio.
const MAX_ENVIO_BYTES = 3 * 1024 * 1024;
const MAX_TEXTO_BYTES = 512 * 1024;

// Escrituras de texto so nestes tipos. Qualquer outro (binario, executavel) vai
// pelo /api/arquivos/enviar, que confere a assinatura do arquivo.
const EXTENSOES_TEXTO = new Set([
  '.txt', '.md', '.markdown', '.json', '.csv', '.xml', '.yml', '.yaml',
  '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.ts',
  '.svg', '.webmanifest', '.map', '.ini', '.conf', '.log'
]);

// Nada aqui entra na lista de acesso. Mesmo com a sessao valida, estes nao sao
// arquivos de site: sao segredo, historico e dependencia.
const BLOQUEADOS = [
  '.git', '.hg', '.svn', 'node_modules', '.env', '.env.local',
  '.env.production', 'id_rsa', 'id_ed25519'
];

let raizReal = null;

function raiz() {
  if (raizReal) return raizReal;

  const configurada = optionalEnv('PAINEL_ARQUIVOS_RAIZ', '');
  // Sem configuracao, o painel gerencia o proprio site: src/. Nunca a pasta
  // do projeto inteira, porque ali moram o .env e o historico do git.
  const alvo = configurada
    ? path.resolve(configurado)
    : path.join(__dirname, '..', 'src');

  const resolvida = fs.realpathSync(alvo);
  if (!fs.statSync(resolvida).isDirectory()) {
    throw new Error(`PAINEL_ARQUIVOS_RAIZ não é um diretório: ${resolvida}`);
  }
  raizReal = resolvida;
  return raizReal;
}

/** Digitao normalizada: barra para frente, sem barra nas pontas. */
function normalizaRel(rel) {
  return String(rel || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .trim();
}

/**
 * Resolve um caminho relativo dentro da raiz, recusando qualquer tentativa de
 * sair dela.
 *
 * `realpath` no dirname (quando existe) fecha o caso do link simbolico: o
 * usuario cria um link para C:\Windows e navega por ele como se fosse uma
 * subpasta comum.
 */
function resolveSeguro(rel, { paraEscrever = false } = {}) {
  const base = raiz();
  const limpo = normalizaRel(rel);

  if (!limpo) return base;

  const absoluto = path.resolve(base, limpo);

  // Fora da raiz: barrado. Este é o teste que pega "../../../etc".
  if (absoluto !== base && !absoluto.startsWith(base + path.sep)) {
    const erro = new Error('Caminho fora da pasta permitida.');
    erro.status = 403;
    throw erro;
  }

  // Sem barra invertida dentro do caminho ( Windows aceita "/" também).
  if (absoluto.includes('\0')) {
    const erro = new Error('Caminho inválido.');
    erro.status = 400;
    throw erro;
  }

  // Se o pai existir, confirma o caminho real dele.
  const pai = path.dirname(absoluto);
  if (fs.existsSync(pai)) {
    const paiReal = fs.realpathSync(pai);
    if (paiReal !== base && !paiReal.startsWith(base + path.sep)) {
      const erro = new Error('Caminho fora da pasta permitida.');
      erro.status = 403;
      throw erro;
    }
  }

  if (!paraEscrever) conferirNome(absoluto);
  return absoluto;
}

/** Recusa nomes que nunca devem aparecer no gerenciador. */
function conferirNome(absoluto) {
  const nome = path.basename(absoluto);
  const relativo = path.relative(raiz(), absoluto).split(path.sep);
  const proibido = relativo.find(parte => BLOQUEADOS.includes(parte));
  if (proibido) {
    const erro = new Error(`"${proibido}" não está disponível no painel.`);
    erro.status = 403;
    throw erro;
  }
  if (nome.startsWith('.env')) {
    const erro = new Error('Arquivos .env não estão disponíveis no painel.');
    erro.status = 403;
    throw erro;
  }
  return nome;
}

function ehDiretorio(absoluto) {
  try {
    return fs.statSync(absoluto).isDirectory();
  } catch {
    return false;
  }
}

function tamanhoLegivel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dataBR(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

/** Lista o conteudo de um diretorio: pastas primeiro, depois por nome. */
async function listar(absoluto) {
  const entradas = await fsp.readdir(absoluto, { withFileTypes: true });

  const itens = [];
  for (const entrada of entradas) {
    const completo = path.join(absoluto, entrada.name);

    // Um link simbolico pode apontar para fora da raiz: ele some da lista em
    // vez de aparecer como atalho para o disco inteiro.
    if (entrada.isSymbolicLink()) {
      let real = null;
      try {
        real = fs.realpathSync(completo);
        const base = raiz();
        if (real !== base && !real.startsWith(base + path.sep)) continue;
      } catch {
        continue;
      }
    }

    let stats;
    try {
      stats = await fsp.stat(completo);
    } catch {
      continue;
    }

    const ehPasta = stats.isDirectory();
    const ext = path.extname(entrada.name).toLowerCase();

    itens.push({
      nome: entrada.name,
      pasta: ehPasta,
      tamanho: ehPasta ? 0 : stats.size,
      tamanhoLegivel: ehPasta ? '—' : tamanhoLegivel(stats.size),
      modificado: stats.mtime.toISOString(),
      modificadoLegivel: dataBR(stats.mtime.toISOString()),
      texto: !ehPasta && EXTENSOES_TEXTO.has(ext),
      linkSimbolico: entrada.isSymbolicLink()
    });
  }

  itens.sort((a, b) => {
    if (a.pasta !== b.pasta) return a.pasta ? -1 : 1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });

  return itens;
}

/** Confere a assinatura do arquivo, como /api/media faz. */
function sniffMime(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x67, 0x69, 0x66, 0x38]))) return 'image/gif';
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('latin1') === 'ftyp') return 'video/mp4';
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'video/webm';
  return null;
}

const MIMES_PERMITIDOS = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm',
  'text/plain', 'text/csv', 'application/pdf',
  'application/zip', 'font/woff2'
]);

module.exports = withErrorHandling(async (req, res) => {
  if (!handleCors(req, res)) return;
  if (!methodGuard(req, res, ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'])) return;
  if (!sameOriginGuard(req, res)) return;
  if (!requireAdmin(req, res)) return;

  const acao = req.query?.acao || '';
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // resolveSeguro() recusa caminho fora da raiz com erro.status 403. O
  // withErrorHandling transformaria qualquer erro em 500, e "vc tentou sair da
  // pasta" viraria "erro interno" — que e exatamente o que nao quero.
  let seguro;
  try {
    seguro = (rel, opcoes) => resolveSeguro(rel, opcoes);
  } catch (erro) {
    if (erro.status) return fail(res, erro.status, erro.message);
    throw erro;
  }

  try {
    // ---------------------------------------------------------- listar
    if (req.method === 'GET' && !acao) {
      const alvo = seguro(req.query?.path);
      if (!ehDiretorio(alvo)) return fail(res, 400, 'Isso não é uma pasta.');
      const itens = await listar(alvo);
      return json(res, 200, {
        raiz: raiz(),
        path: normalizaRel(req.query?.path),
        itens
      }, { 'Cache-Control': 'no-store' });
    }

    // ------------------------------------------------------- ler texto
    if (req.method === 'GET' && acao === 'ler') {
      const alvo = seguro(req.query?.path);
      if (ehDiretorio(alvo)) return fail(res, 400, 'É uma pasta, não um arquivo.');

      const stats = fs.statSync(alvo);
      if (stats.size > MAX_TEXTO_BYTES) {
        return fail(res, 413, `Arquivo grande demais para abrir no painel (${tamanhoLegivel(stats.size)}).`);
      }

      const conteudo = await fsp.readFile(alvo, 'utf8');
      return json(res, 200, {
        path: normalizaRel(req.query?.path),
        nome: path.basename(alvo),
        bytes: stats.size,
        conteudo
      }, { 'Cache-Control': 'no-store' });
    }

    // ----------------------------------------------------- gravar texto
    if (req.method === 'PUT') {
      const alvo = seguro(body.path, { paraEscrever: true });
      if (ehDiretorio(alvo)) return fail(res, 400, 'É uma pasta, não um arquivo.');

      // Sem esta checagem, gravar num caminho cuja pasta não existe estourava
      // ENOENT do fs e voltava 500 — erro do servidor para um erro de quem
      // digitou o caminho errado.
      const pai = path.dirname(alvo);
      if (!fs.existsSync(pai)) {
        return fail(res, 404, 'A pasta de destino não existe.');
      }
      if (!fs.statSync(pai).isDirectory()) {
        return fail(res, 400, 'O destino não é uma pasta.');
      }

      const conteudo = String(body.conteudo ?? '');
      if (Buffer.byteLength(conteudo, 'utf8') > MAX_TEXTO_BYTES) {
        return fail(res, 413, 'Texto grande demais (máximo 512KB).');
      }
      const ext = path.extname(alvo).toLowerCase();
      if (!EXTENSOES_TEXTO.has(ext)) {
        return fail(res, 415, `Não é um arquivo de texto (${ext || 'sem extensão'}).`);
      }

      await fsp.writeFile(alvo, conteudo, 'utf8');
      return json(res, 200, {
        path: normalizaRel(body.path),
        bytes: Buffer.byteLength(conteudo, 'utf8')
      }, { 'Cache-Control': 'no-store' });
    }

    // ------------------------------------------------------ criar pasta
    if (req.method === 'POST' && acao === 'pasta') {
      const alvo = seguro(body.path, { paraEscrever: true });
      if (fs.existsSync(alvo)) return fail(res, 409, 'Já existe algo com esse nome.');
      await fsp.mkdir(alvo, { recursive: true });
      return json(res, 201, { criado: normalizaRel(body.path) }, { 'Cache-Control': 'no-store' });
    }

    // --------------------------------------------------------- renomear
    if (req.method === 'POST' && acao === 'renomear') {
      const de = seguro(body.de);
      const para = seguro(body.para, { paraEscrever: true });
      if (!fs.existsSync(de)) return fail(res, 404, 'O item original não existe.');
      if (fs.existsSync(para)) return fail(res, 409, 'Já existe algo com o novo nome.');
      await fsp.rename(de, para);
      return json(res, 200, {
        de: normalizaRel(body.de),
        para: normalizaRel(body.para)
      }, { 'Cache-Control': 'no-store' });
    }

    // ----------------------------------------------------------- enviar
    if (req.method === 'POST' && acao === 'enviar') {
      const pasta = seguro(body.path, { paraEscrever: true });
      if (!ehDiretorio(pasta)) return fail(res, 400, 'O destino não é uma pasta.');

      const nome = String(body.nome || '').trim();
      if (!nome || nome.includes('/') || nome.includes('\\') || nome === '.' || nome === '..') {
        return fail(res, 400, 'Nome de arquivo inválido.');
      }
      if (typeof body.data !== 'string' || !body.data) return fail(res, 400, 'Arquivo ausente.');

      const buffer = Buffer.from(body.data, 'base64');
      if (buffer.length === 0) return fail(res, 400, 'Arquivo inválido.');
      if (buffer.length > MAX_ENVIO_BYTES) {
        return fail(res, 413, `Arquivo acima de ${(MAX_ENVIO_BYTES / 1024 / 1024).toFixed(0)}MB.`);
      }

      const detectado = sniffMime(buffer);
      if (!detectado) return fail(res, 415, 'Formato não reconhecido.');
      if (!MIMES_PERMITIDOS.has(detectado)) {
        return fail(res, 415, `Formato não aceito: ${detectado}`);
      }

      const destino = path.join(pasta, nome);
      if (fs.existsSync(destino)) return fail(res, 409, 'Já existe um arquivo com esse nome.');

      await fsp.writeFile(destino, buffer);
      return json(res, 201, {
        nome,
        bytes: buffer.length,
        path: path.relative(raiz(), destino).split(path.sep).join('/')
      }, { 'Cache-Control': 'no-store' });
    }

    // ------------------------------------------------------------ apagar
    if (req.method === 'DELETE') {
      const alvo = seguro(req.query?.path);
      if (alvo === raiz()) return fail(res, 400, 'Não é possível apagar a raiz.');

      if (!fs.existsSync(alvo)) return fail(res, 404, 'O item não existe.');

      const ehPasta = ehDiretorio(alvo);
      await fsp.rm(alvo, { recursive: ehPasta, force: false });

      return json(res, 200, {
        apagado: normalizaRel(req.query?.path),
        tipo: ehPasta ? 'pasta' : 'arquivo'
      }, { 'Cache-Control': 'no-store' });
    }

    return fail(res, 404, 'Operação desconhecida.');
  } catch (erro) {
    if (erro.status) return fail(res, erro.status, erro.message);
    throw erro;
  }
});
