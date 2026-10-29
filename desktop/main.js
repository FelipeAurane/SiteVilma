'use strict';

/**
 * Luvi — painel de controle do site, app desktop (Electron).
 *
 * O painel (HTML/CSS/JS de src/admin) vem dentro do app e é servido pelo
 * protocolo próprio painel://app. Tudo que é dado vai para o site publicado:
 *
 *   painel://app/admin/...   -> arquivos do painel, no próprio app
 *   painel://app/js/...      -> api.js, dataManager.js, visibility.js do site
 *   painel://app/_luvi/...   -> telas do próprio app (splash), em desktop/ui
 *   painel://app/api/...     -> encaminhado para <servidor>/api/...
 *   qualquer outro caminho   -> encaminhado para <servidor> (fotos do site em /img etc.)
 *
 * Como a página e a "API" têm a mesma origem (painel://app), o código do
 * painel continua chamando /api/... sem saber que existe um app em volta, e
 * não há CORS no caminho. O encaminhamento não manda o cabeçalho Origin, que é
 * o que o sameOriginGuard do servidor espera de quem não é navegador; quem
 * autoriza a escrita é o token de sessão (Authorization: Bearer).
 *
 * Abertura:
 *   1. A splash aparece e sincroniza: confere o servidor, entra com o PIN
 *      guardado neste computador (criptografado pelo Windows via safeStorage)
 *      e baixa o conteúdo do site.
 *   2. Só a primeira vez — ou se o PIN mudar no servidor — a splash pede o PIN.
 *   3. O painel carrega escondido, com o token já entregue pelo preload e as
 *      respostas da sincronização prontas; aparece quando avisa que montou.
 *
 * Servidor, em ordem de prioridade:
 *   --servidor=URL  ->  VILMA_SERVIDOR  ->  config.json na pasta de dados do
 *   usuário  ->  config.json do app  ->  site da Vercel
 */

const { app, BrowserWindow, protocol, net, shell, Menu, ipcMain, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ORIGEM = 'painel://app';
const PADRAO = 'https://vila-fotografia.vercel.app';

// Endereços que abrem o painel, os mesmos do servidor Express
const ROTAS_PAINEL = new Set(['/', '/config', '/painel', '/admin', '/admin/']);

// Pastas do painel servidas do próprio app
const PASTAS_LOCAIS = ['admin', 'js'];

// Cabeçalhos que seguem para o servidor. Origin e Cookie ficam de fora de propósito.
const CABECALHOS_ENCAMINHADOS = ['accept', 'authorization', 'content-type', 'range', 'if-none-match'];

// O que a splash baixa antes de abrir o painel: as mesmas URLs que o painel pede
const SINCRONIA = [
  { rotulo: 'textos e portfólio', url: '/api/content?key=siteData' },
  { rotulo: 'dúvidas', url: '/api/content?key=faqs' },
  { rotulo: 'visibilidade', url: '/api/content?key=visibility' },
  { rotulo: 'agenda', url: '/api/content?key=availableDates' },
  { rotulo: 'seleções', url: '/api/selecao', comToken: true }
];

// A sessão do servidor dura 8h; renova antes disso com o PIN guardado
const RENOVAR_SESSAO_MS = 6 * 60 * 60 * 1000;
const PREPARO_MAXIMO_MS = 15000;
const TEMPO_LIMITE_MS = 15000;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'painel',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
]);

// ---------------------------------------------------------------- configuração

function lerJson(arquivo) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch {
    return null;
  }
}

function descobrirServidor() {
  const argumento = process.argv.find((a) => a.startsWith('--servidor='));
  const candidato =
    (argumento && argumento.slice('--servidor='.length)) ||
    process.env.VILMA_SERVIDOR ||
    lerJson(path.join(app.getPath('userData'), 'config.json'))?.servidor ||
    lerJson(path.join(__dirname, 'config.json'))?.servidor ||
    PADRAO;

  try {
    const url = new URL(candidato);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
    return url.origin;
  } catch {
    console.error(`[painel] servidor inválido "${candidato}", usando ${PADRAO}`);
    return PADRAO;
  }
}

/** Em desenvolvimento lê direto de ../src; empacotado, da cópia em resources/painel. */
function pastaDoPainel() {
  return app.isPackaged ? path.join(process.resourcesPath, 'painel') : path.join(__dirname, '..', 'src');
}

let SERVIDOR = PADRAO;
let PAINEL_DIR = '';

// ---------------------------------------------------------------- PIN guardado

function arquivoCredencial() {
  return path.join(app.getPath('userData'), 'credencial.bin');
}

function lerPin() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(fs.readFileSync(arquivoCredencial()));
  } catch {
    return null;
  }
}

function guardarPin(pin) {
  if (!safeStorage.isEncryptionAvailable()) return false;
  fs.writeFileSync(arquivoCredencial(), safeStorage.encryptString(pin));
  return true;
}

function esquecerPin() {
  fs.rmSync(arquivoCredencial(), { force: true });
}

// ---------------------------------------------------------------- servidor

let token = null;

// Respostas da sincronização, entregues uma vez ao painel quando ele pedir a mesma URL
const preCarregado = new Map();

class ErroServidor extends Error {
  constructor(mensagem, status = 0) {
    super(mensagem);
    this.status = status;
  }
}

async function pedir(caminho, { method = 'GET', corpo, comToken = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (comToken && token) headers.Authorization = `Bearer ${token}`;

  let resposta;
  try {
    resposta = await net.fetch(SERVIDOR + caminho, {
      method,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      credentials: 'omit',
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS)
    });
  } catch {
    throw new ErroServidor('Não foi possível falar com o site. Confira a internet.');
  }

  const texto = await resposta.text();
  let dados = null;
  try {
    dados = JSON.parse(texto);
  } catch {
    // resposta sem JSON
  }
  if (!resposta.ok) throw new ErroServidor(dados?.error || `Erro ${resposta.status}`, resposta.status);
  return { dados, texto, status: resposta.status, tipo: resposta.headers.get('content-type') };
}

async function entrar(pin) {
  const { dados } = await pedir('/api/auth/login', { method: 'POST', corpo: { pin } });
  if (!dados?.token) throw new ErroServidor('O servidor não devolveu a sessão.');
  token = dados.token;
  return token;
}

let renovacao = null;

/** Renova a sessão em segundo plano e entrega o token novo ao painel aberto. */
function agendarRenovacao() {
  if (renovacao) return;
  renovacao = setInterval(async () => {
    const pin = lerPin();
    if (!pin) return;
    try {
      await entrar(pin);
      janelaPainel?.webContents.send('luvi:token', token);
    } catch (erro) {
      console.error('[painel] não foi possível renovar a sessão:', erro.message);
    }
  }, RENOVAR_SESSAO_MS).unref();
}

// ---------------------------------------------------------------- protocolo

function arquivoEm(raiz, relativo) {
  const alvo = path.resolve(raiz, '.' + relativo);
  // Nada fora da pasta, nem com ../ na URL
  if (alvo !== raiz && !alvo.startsWith(raiz + path.sep)) return null;
  try {
    const info = fs.statSync(alvo);
    if (info.isDirectory()) {
      const indice = path.join(alvo, 'index.html');
      return fs.existsSync(indice) ? indice : null;
    }
    return info.isFile() ? alvo : null;
  } catch {
    return null;
  }
}

function arquivoLocal(caminho) {
  if (caminho.startsWith('/_luvi/')) return arquivoEm(path.join(__dirname, 'ui'), caminho.slice('/_luvi'.length));
  const pasta = caminho.split('/')[1];
  if (!PASTAS_LOCAIS.includes(pasta)) return null;
  return arquivoEm(path.join(PAINEL_DIR, pasta), caminho.slice(pasta.length + 1));
}

function respostaDeErro(status, mensagem) {
  return new Response(JSON.stringify({ error: mensagem }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

async function encaminhar(request, url) {
  const destino = SERVIDOR + url.pathname + url.search;
  const headers = new Headers();
  for (const nome of CABECALHOS_ENCAMINHADOS) {
    const valor = request.headers.get(nome);
    if (valor) headers.set(nome, valor);
  }

  const temCorpo = request.method !== 'GET' && request.method !== 'HEAD';

  try {
    return await net.fetch(destino, {
      method: request.method,
      headers,
      body: temCorpo ? await request.arrayBuffer() : undefined,
      redirect: 'follow',
      // A sessão vai no token; cookies do navegador interno não entram na conta.
      credentials: 'omit'
    });
  } catch (erro) {
    console.error(`[painel] ${request.method} ${destino} falhou:`, erro.message);
    return respostaDeErro(502, 'Sem conexão com o servidor do site. Confira a internet e tente de novo.');
  }
}

function registrarProtocolo() {
  protocol.handle('painel', async (request) => {
    const url = new URL(request.url);
    let caminho;
    try {
      caminho = decodeURIComponent(url.pathname);
    } catch {
      return respostaDeErro(400, 'Endereço inválido');
    }

    if (ROTAS_PAINEL.has(caminho)) caminho = '/admin/index.html';

    if (caminho.startsWith('/api/')) {
      const pronto = request.method === 'GET' && preCarregado.get(url.pathname + url.search);
      if (pronto) {
        preCarregado.delete(url.pathname + url.search);
        return new Response(pronto.texto, {
          status: pronto.status,
          headers: { 'Content-Type': pronto.tipo || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      }
      return encaminhar(request, url);
    }

    const local = arquivoLocal(caminho);
    if (local) {
      const resposta = await net.fetch(pathToFileURL(local).toString());
      // O painel é editado em tempo real durante o desenvolvimento
      const headers = new Headers(resposta.headers);
      headers.set('Cache-Control', 'no-store');
      return new Response(resposta.body, { status: resposta.status, headers });
    }

    return encaminhar(request, url);
  });
}

// ---------------------------------------------------------------- janelas

let janelaSplash = null;
let janelaPainel = null;

/** Links do painel que saem dele (ex.: "Ver site") abrem no navegador, no site publicado. */
function abrirFora(endereco) {
  let url;
  try {
    url = new URL(endereco);
  } catch {
    return;
  }
  if (url.protocol === 'painel:') url = new URL(url.pathname + url.search + url.hash, SERVIDOR);
  if (url.protocol === 'https:' || url.protocol === 'http:') shell.openExternal(url.toString());
}

function protegerNavegacao(janela) {
  janela.webContents.setWindowOpenHandler(({ url }) => {
    abrirFora(url);
    return { action: 'deny' };
  });
  janela.webContents.on('will-navigate', (evento, url) => {
    if (!url.startsWith(ORIGEM)) {
      evento.preventDefault();
      abrirFora(url);
    }
  });
}

function criarSplash() {
  janelaSplash = new BrowserWindow({
    width: 440,
    height: 340,
    frame: false,
    resizable: false,
    maximizable: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    center: true,
    title: 'Luvi',
    icon: path.join(__dirname, 'icone.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload-splash.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  protegerNavegacao(janelaSplash);
  janelaSplash.once('ready-to-show', () => janelaSplash.show());
  janelaSplash.on('closed', () => {
    janelaSplash = null;
  });
  janelaSplash.loadURL(`${ORIGEM}/_luvi/splash.html`);
}

function avisarSplash(evento) {
  janelaSplash?.webContents.send('splash:estado', evento);
}

function criarPainel() {
  janelaPainel = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'Luvi',
    // Sem a barra do Windows: o painel desenha a própria (ver .barra-app)
    frame: false,
    backgroundColor: '#2a2a2e',
    icon: path.join(__dirname, 'icone.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });

  protegerNavegacao(janelaPainel);

  const estado = () => janelaPainel?.webContents.send('luvi:maximizada', janelaPainel.isMaximized());
  janelaPainel.on('maximize', estado);
  janelaPainel.on('unmaximize', estado);
  janelaPainel.on('closed', () => {
    janelaPainel = null;
  });

  // F5 recarrega, F12 abre as ferramentas de desenvolvedor
  janelaPainel.webContents.on('before-input-event', (evento, entrada) => {
    if (entrada.type !== 'keyDown') return;
    if (entrada.key === 'F5') janelaPainel.webContents.reload();
    if (entrada.key === 'F12') janelaPainel.webContents.toggleDevTools();
  });

  janelaPainel.loadURL(`${ORIGEM}/config`);
  return janelaPainel;
}

/** Mostra o painel quando ele avisar que montou — ou depois de um tempo, para não travar. */
function prepararPainel() {
  return new Promise((resolve) => {
    let feito = false;
    const concluir = () => {
      if (feito) return;
      feito = true;
      ipcMain.removeListener('luvi:pronto', aoPronto);
      resolve();
    };
    const aoPronto = (evento) => {
      if (evento.sender === janelaPainel?.webContents) concluir();
    };
    ipcMain.on('luvi:pronto', aoPronto);
    setTimeout(concluir, PREPARO_MAXIMO_MS);
    criarPainel();
  });
}

// ---------------------------------------------------------------- sincronia

let sincronizando = false;

async function sincronizar(pinDigitado) {
  if (sincronizando) return;
  sincronizando = true;
  try {
    avisarSplash({ etapa: 'conectar', texto: 'Conectando ao site…', progresso: 0.08 });
    await pedir('/api/auth/session');

    const pin = pinDigitado || lerPin();
    if (!pin) {
      avisarSplash({ etapa: 'pin', texto: 'Digite o PIN do painel uma vez. Ele fica guardado neste computador.' });
      return;
    }

    avisarSplash({ etapa: 'entrar', texto: 'Entrando…', progresso: 0.2 });
    try {
      await entrar(pin);
    } catch (erro) {
      if (erro.status === 401) {
        esquecerPin();
        avisarSplash({ etapa: 'pin', erro: pinDigitado ? 'PIN incorreto.' : 'O PIN mudou no site. Digite o novo.' });
        return;
      }
      if (erro.status === 429) throw new ErroServidor('Tentativas demais. Espere alguns minutos e tente de novo.');
      throw erro;
    }
    if (pinDigitado) guardarPin(pinDigitado);

    preCarregado.clear();
    for (const [i, item] of SINCRONIA.entries()) {
      avisarSplash({ etapa: 'sincronizar', texto: `Sincronizando ${item.rotulo}…`, progresso: 0.25 + (0.55 * i) / SINCRONIA.length });
      const resposta = await pedir(item.url, { comToken: item.comToken });
      preCarregado.set(item.url, resposta);
    }

    avisarSplash({ etapa: 'preparar', texto: 'Preparando o painel…', progresso: 0.85 });
    await prepararPainel();

    avisarSplash({ etapa: 'pronto', texto: 'Tudo sincronizado', progresso: 1 });
    janelaPainel?.show();
    janelaPainel?.focus();
    janelaSplash?.close();
    agendarRenovacao();
  } catch (erro) {
    console.error('[painel] sincronia falhou:', erro.message);
    avisarSplash({ etapa: 'erro', erro: erro.message || 'Algo deu errado ao sincronizar.' });
  } finally {
    sincronizando = false;
  }
}

// ---------------------------------------------------------------- IPC

function ligarIpc() {
  // Splash
  ipcMain.on('splash:iniciar', () => sincronizar());
  ipcMain.on('splash:tentar', () => sincronizar());
  ipcMain.on('splash:pin', (evento, pin) => {
    if (typeof pin === 'string' && /^\d{4}$/.test(pin)) sincronizar(pin);
  });
  ipcMain.on('splash:fechar', () => app.quit());
  ipcMain.on('splash:info', (evento) => {
    evento.returnValue = { servidor: SERVIDOR, oficial: SERVIDOR === PADRAO, versao: app.getVersion() };
  });

  // Painel
  ipcMain.on('luvi:token-agora', (evento) => {
    evento.returnValue = evento.sender === janelaPainel?.webContents ? token : null;
  });
  ipcMain.on('luvi:janela', (evento, acao) => {
    const janela = BrowserWindow.fromWebContents(evento.sender);
    if (!janela) return;
    if (acao === 'minimizar') janela.minimize();
    else if (acao === 'maximizar') (janela.isMaximized() ? janela.unmaximize() : janela.maximize());
    else if (acao === 'fechar') janela.close();
  });
  ipcMain.on('luvi:estado-janela', (evento) => {
    evento.returnValue = BrowserWindow.fromWebContents(evento.sender)?.isMaximized() || false;
  });
  // "Sair": esquece o PIN deste computador e volta para a splash
  ipcMain.on('luvi:sair', async () => {
    try {
      if (token) await pedir('/api/auth/logout', { method: 'POST', corpo: {}, comToken: true });
    } catch {
      // sair funciona mesmo sem internet
    }
    token = null;
    esquecerPin();
    criarSplash();
    janelaPainel?.close();
  });
  ipcMain.on('luvi:info', (evento) => {
    evento.returnValue = { servidor: SERVIDOR, oficial: SERVIDOR === PADRAO };
  });
}

// ---------------------------------------------------------------- ciclo de vida

// Precisa ser antes do "ready": cada servidor guarda a sua própria sessão
// (PIN guardado, tema, rascunhos). Sem isso, o PIN do servidor local seria
// tentado no site publicado.
SERVIDOR = descobrirServidor();
if (SERVIDOR !== PADRAO) {
  app.setPath('userData', `${app.getPath('userData')}-${new URL(SERVIDOR).host.replace(/[^a-z0-9.-]/gi, '_')}`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const janela = janelaPainel || janelaSplash;
    if (janela) {
      if (janela.isMinimized()) janela.restore();
      janela.focus();
    }
  });

  app.whenReady().then(() => {
    PAINEL_DIR = pastaDoPainel();
    console.log(`[painel] servidor: ${SERVIDOR}`);
    console.log(`[painel] arquivos: ${PAINEL_DIR}`);

    Menu.setApplicationMenu(null);
    registrarProtocolo();
    ligarIpc();
    criarSplash();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
