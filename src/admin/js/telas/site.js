/**
 * Tela "Meu site" — editor do site público.
 *
 * Abas: Capa & textos, Portfólio, Serviços, Dúvidas e Visibilidade.
 *
 * Tudo é lido do servidor (nunca do cache do navegador: mostrar um texto velho
 * e salvar por cima seria a pior falha possível) e gravado pelas mesmas chaves
 * que o site lê:
 *   siteData   -> hero, center, banner, categories, services (via DataManager)
 *   faqs       -> [{ question, answer }]
 *   visibility -> mapa data-tag -> boolean (salva a cada clique)
 *
 * Fotos e vídeos sobem na hora em que são escolhidos (/api/media); o que fica
 * pendente até "Salvar" é só a URL dentro do conteúdo.
 */

import { getContent, putContent, uploadImage, uploadMedia, LIMITE_VIDEO_BYTES } from '../../../js/api.js';
import { DataManager, defaultData, isVideoMedia } from '../../../js/dataManager.js';
import { defaultVisibility, normalize, readCache, writeCache } from '../../../js/visibility.js';

// ---------------------------------------------------------------- blocos

/** Nome de cada tag do site, do jeito que a Vilma chamaria. */
const NOMES = {
  'splash-screen': 'Tela de abertura (splash screen)',
  navbar: 'Barra de navegação',
  logo: 'Logo',
  'main-menu': 'Menu principal',
  'menu-inicio': 'Link Início',
  'menu-galeria': 'Link Portfólio',
  'menu-sobre': 'Link Sobre',
  'menu-servicos': 'Link Serviços',
  'menu-duvidas': 'Link Dúvidas',
  'menu-blok': 'Bloco do menu no canto',
  'overlay-fundo': 'Fundo escuro do menu',
  'hero-section': 'Seção principal inteira',
  'title-name': 'Título (seu nome)',
  subtitle: 'Subtítulo',
  'hero-buttons': 'Botão de orçamento',
  'scroll-button': 'Seta de rolar',
  'next-section': 'Grade do portfólio',
  'video-section': 'Vídeo de fundo',
  'cardapio-section': 'Seção do portfólio',
  'cardapio-title': 'Título do portfólio',
  'cardapio-banner': 'Fundo do portfólio',
  'banner-title': 'Chamada',
  'banner-subtitle': 'Legenda',
  'banner-image': 'Imagem do fundo',
  'cardapio-container': 'Cartões de categoria',
  'sobre-section': 'Seção Sobre',
  'footer-section': 'Rodapé'
};

/** Ordem de leitura na tela. */
const GRUPOS = [
  { id: 'abertura', nome: 'Abertura do site', tags: ['splash-screen'] },
  { id: 'navegacao', nome: 'Navegação', tags: ['navbar', 'logo', 'main-menu', 'menu-inicio', 'menu-galeria', 'menu-sobre', 'menu-servicos', 'menu-duvidas', 'menu-blok', 'overlay-fundo'] },
  { id: 'principal', nome: 'Seção principal', tags: ['hero-section', 'title-name', 'subtitle', 'hero-buttons', 'scroll-button'] },
  { id: 'portfolio', nome: 'Portfólio', tags: ['next-section', 'cardapio-section', 'cardapio-title', 'cardapio-banner', 'banner-title', 'banner-subtitle', 'banner-image', 'cardapio-container', 'video-section'] },
  { id: 'sobre', nome: 'Sobre e rodapé', tags: ['sobre-section', 'footer-section'] }
];

/** Tag nova no visibility.js aparece em "Outros" em vez de sumir do painel. */
function gruposCompletos() {
  const conhecidos = new Set(GRUPOS.flatMap((g) => g.tags));
  const faltando = Object.keys(defaultVisibility).filter((tag) => !conhecidos.has(tag));
  return faltando.length ? [...GRUPOS, { id: 'outros', nome: 'Outros', tags: faltando }] : GRUPOS;
}

const ABAS = [
  { id: 'capa', rotulo: 'Capa & textos', chaves: ['hero', 'center', 'banner'] },
  { id: 'portfolio', rotulo: 'Portfólio', chaves: ['categories'] },
  { id: 'servicos', rotulo: 'Serviços', chaves: ['services'] },
  { id: 'duvidas', rotulo: 'Dúvidas' },
  { id: 'visibilidade', rotulo: 'Visibilidade' }
];

// ---------------------------------------------------------------- estado

const dados = new DataManager();
const estado = { site: null, faqs: [] };
let visibilidade = { ...defaultVisibility };
const salvo = {};               // id da aba -> JSON do que está publicado
const enviando = new Set();     // caminhos com upload em andamento
const galeriasAbertas = new Set();
let abaAtual = 'capa';
let raiz, painel, botaoSalvar, statusSalvar, barraAbas;

// ---------------------------------------------------------------- utilidades

const clonar = (v) => JSON.parse(JSON.stringify(v));

function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function lerCaminho(caminho) {
  return caminho.split('.').reduce((obj, chave) => (obj == null ? undefined : obj[chave]), estado);
}

function gravarCaminho(caminho, valor) {
  const partes = caminho.split('.');
  const ultima = partes.pop();
  let obj = estado;
  for (const parte of partes) {
    if (obj[parte] == null || typeof obj[parte] !== 'object') obj[parte] = {};
    obj = obj[parte];
  }
  obj[ultima] = valor;
}

/** O conteúdo guarda caminhos relativos ao site ("./img/x.jpg"); o painel mora em /config. */
function previa(src) {
  const s = String(src || '').trim();
  if (s.startsWith('./')) return `/${s.slice(2)}`;
  if (s.startsWith('../')) return `/${s.slice(3)}`;
  return s;
}

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

function icone(id) {
  return `<svg><use href="#${id}" /></svg>`;
}

function avisar(mensagem, tipo = 'ok') {
  let caixa = document.getElementById('avisos');
  if (!caixa) {
    caixa = document.createElement('div');
    caixa.id = 'avisos';
    caixa.className = 'avisos';
    caixa.setAttribute('aria-live', 'polite');
    document.body.appendChild(caixa);
  }
  const aviso = document.createElement('div');
  aviso.className = `aviso aviso-${tipo}`;
  aviso.textContent = mensagem;
  caixa.appendChild(aviso);
  requestAnimationFrame(() => aviso.classList.add('visivel'));
  setTimeout(() => {
    aviso.classList.remove('visivel');
    setTimeout(() => aviso.remove(), 300);
  }, tipo === 'erro' ? 5000 : 2600);
}

// ---------------------------------------------------------------- sujo / salvo

function fatia(idAba) {
  const aba = ABAS.find((a) => a.id === idAba);
  if (aba.id === 'duvidas') return estado.faqs;
  if (!aba.chaves) return null;
  return Object.fromEntries(aba.chaves.map((k) => [k, estado.site[k]]));
}

function marcarSalvo(idAba) {
  salvo[idAba] = JSON.stringify(fatia(idAba));
}

function estaSujo(idAba) {
  const atual = fatia(idAba);
  return atual !== null && salvo[idAba] !== undefined && JSON.stringify(atual) !== salvo[idAba];
}

function atualizarSujo() {
  for (const aba of ABAS) {
    barraAbas.querySelector(`[data-aba="${aba.id}"]`)?.classList.toggle('sujo', estaSujo(aba.id));
  }
  const temSalvar = abaAtual !== 'visibilidade';
  const sujo = estaSujo(abaAtual);
  botaoSalvar.hidden = !temSalvar;
  botaoSalvar.disabled = !sujo || enviando.size > 0;
  statusSalvar.textContent = !temSalvar
    ? 'Cada mudança é salva na hora'
    : enviando.size > 0 ? 'Enviando arquivo…'
    : sujo ? 'Alterações não salvas' : 'Tudo salvo';
  statusSalvar.classList.toggle('pendente', temSalvar && sujo);
}

// ---------------------------------------------------------------- pedaços de HTML

function campo({ rotulo, caminho, tipo = 'text', dica = '', placeholder = '', linhas = 0, formato = '' }) {
  let valor = lerCaminho(caminho);
  if (formato === 'linhas') valor = Array.isArray(valor) ? valor.join('\n') : String(valor ?? '');
  const atributos = `data-bind="${caminho}" ${formato ? `data-formato="${formato}"` : ''} placeholder="${esc(placeholder)}"`;
  const controle = linhas
    ? `<textarea rows="${linhas}" ${atributos}>${esc(valor)}</textarea>`
    : `<input type="${tipo}" value="${esc(valor)}" ${atributos} ${tipo === 'tel' ? 'inputmode="numeric"' : ''}>`;
  return `
    <label class="campo">
      <span class="campo-rotulo">${rotulo}</span>
      ${controle}
      ${dica ? `<span class="campo-dica">${dica}</span>` : ''}
    </label>`;
}

/** Botão de enviar arquivo: um <label> com <input type=file> escondido dentro. */
function botaoArquivo({ rotulo, upload, caminho = '', aceita = 'image/*', multiplo = false, indice = '', classe = 'botao-secundario' }) {
  const ocupado = enviando.has(caminho || upload);
  return `
    <label class="botao ${classe} ${ocupado ? 'ocupado' : ''}">
      <input type="file" hidden accept="${aceita}" ${multiplo ? 'multiple' : ''}
        data-upload="${upload}" data-caminho="${caminho}" data-indice="${indice}" ${ocupado ? 'disabled' : ''}>
      ${ocupado ? '<span class="girando"></span> Enviando…' : rotulo}
    </label>`;
}

function midia(src, { video = false, poster = '', classe = '' } = {}) {
  if (!src) return `<div class="midia midia-vazia ${classe}">${icone('i-selecao')}<span>Sem mídia</span></div>`;
  if (video) {
    return `<div class="midia ${classe}"><video src="${esc(previa(src))}" ${poster ? `poster="${esc(previa(poster))}"` : ''} muted loop autoplay playsinline></video><span class="selo">Vídeo</span></div>`;
  }
  return `<div class="midia ${classe}"><img src="${esc(previa(src))}" alt="" loading="lazy"></div>`;
}

function acoesItem(lista, i, total) {
  return `
    <div class="item-acoes">
      <button class="icone-mini" type="button" data-acao="subir" data-lista="${lista}" data-indice="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
      <button class="icone-mini" type="button" data-acao="descer" data-lista="${lista}" data-indice="${i}" ${i === total - 1 ? 'disabled' : ''} aria-label="Descer">↓</button>
      <button class="icone-mini perigo" type="button" data-acao="remover" data-lista="${lista}" data-indice="${i}" aria-label="Remover">✕</button>
    </div>`;
}

// ---------------------------------------------------------------- abas

function abaCapa() {
  const { hero, center } = estado.site;
  const temVideo = Boolean(hero.video);
  return `
    <div class="ms-grade">
      <article class="cartao">
        <h3>Textos da capa</h3>
        <p class="cartao-sub">O que aparece em cima da foto principal do site.</p>
        ${campo({ rotulo: 'Etiqueta', caminho: 'site.hero.eyebrow', placeholder: 'Fotografia Gastronômica' })}
        ${campo({ rotulo: 'Título', caminho: 'site.hero.title', placeholder: 'Vilma Silva' })}
        ${campo({ rotulo: 'Subtítulo', caminho: 'site.hero.subtitle', linhas: 3 })}
      </article>

      <article class="cartao">
        <h3>Botão de orçamento</h3>
        <p class="cartao-sub">Abre uma conversa no WhatsApp com a mensagem pronta.</p>
        ${campo({ rotulo: 'Texto do botão', caminho: 'site.hero.button.text', placeholder: 'Solicitar Orçamento' })}
        ${campo({ rotulo: 'WhatsApp', caminho: 'site.hero.button.whatsapp', tipo: 'tel', placeholder: '5581999999999', dica: 'Só números, com 55 e DDD.' })}
        ${campo({ rotulo: 'Mensagem inicial', caminho: 'site.hero.button.message', linhas: 2 })}
      </article>

      <article class="cartao">
        <h3>Mídia da capa</h3>
        <p class="cartao-sub">Foto de fundo ou um vídeo curto em loop. A foto vira a prévia do vídeo enquanto ele carrega.</p>
        ${midia(temVideo ? hero.video : hero.image, { video: temVideo, poster: hero.image, classe: 'midia-larga' })}
        <div class="linha-botoes">
          ${botaoArquivo({ rotulo: 'Trocar foto', upload: 'imagem', caminho: 'site.hero.image' })}
          ${botaoArquivo({ rotulo: temVideo ? 'Trocar vídeo' : 'Usar vídeo', upload: 'video-capa', caminho: 'site.hero.video', aceita: 'video/mp4,video/webm' })}
          ${temVideo ? '<button class="botao botao-fantasma" type="button" data-acao="remover-video">Remover vídeo</button>' : ''}
        </div>
        <p class="campo-dica">Vídeo em MP4 ou WebM de até ${(LIMITE_VIDEO_BYTES / 1024 / 1024).toFixed(0)}MB.</p>
      </article>

      <article class="cartao">
        <h3>Destaque central</h3>
        <p class="cartao-sub">Foto ou vídeo que aparece no meio da seção principal.</p>
        ${midia(center.media, { video: isVideoMedia(center.media, center.tipo), classe: 'midia-larga' })}
        <div class="linha-botoes">
          ${botaoArquivo({ rotulo: center.media ? 'Trocar mídia' : 'Escolher mídia', upload: 'centro', caminho: 'site.center', aceita: 'image/*,video/mp4,video/webm' })}
          ${center.media ? '<button class="botao botao-fantasma" type="button" data-acao="remover-centro">Remover</button>' : ''}
        </div>
      </article>

      <article class="cartao cartao-largo">
        <h3>Banner do portfólio</h3>
        <p class="cartao-sub">Fundo e chamada da seção de categorias.</p>
        <div class="banner-editor">
          <div>
            ${midia(estado.site.banner.image, { classe: 'midia-larga' })}
            <div class="linha-botoes">${botaoArquivo({ rotulo: 'Trocar imagem', upload: 'imagem', caminho: 'site.banner.image' })}</div>
          </div>
          <div>
            ${campo({ rotulo: 'Título da seção', caminho: 'site.banner.titleScreen', placeholder: 'Portfólio' })}
            ${campo({ rotulo: 'Chamada', caminho: 'site.banner.title' })}
            ${campo({ rotulo: 'Legenda', caminho: 'site.banner.subtitle' })}
          </div>
        </div>
      </article>
    </div>`;
}

function abaPortfolio() {
  const categorias = estado.site.categories;
  const itens = categorias.map((cat, i) => {
    const galeria = Array.isArray(cat.gallery) ? cat.gallery : [];
    const aberta = galeriasAbertas.has(i);
    return `
      <article class="cartao item">
        <div class="item-topo">
          <div class="item-capa">
            ${midia(cat.image, { classe: 'midia-quadrada' })}
            ${botaoArquivo({ rotulo: 'Trocar', upload: 'imagem', caminho: `site.categories.${i}.image`, classe: 'botao-mini' })}
          </div>
          <div class="item-campos">
            ${campo({ rotulo: 'Nome', caminho: `site.categories.${i}.name`, placeholder: 'Confeitaria' })}
            ${campo({ rotulo: 'Legenda', caminho: `site.categories.${i}.subtitle`, placeholder: 'Doces e sobremesas' })}
          </div>
          ${acoesItem('categories', i, categorias.length)}
        </div>
        <button class="galeria-alternar" type="button" data-acao="galeria" data-indice="${i}" aria-expanded="${aberta}">
          ${icone('i-selecao')} Galeria · ${galeria.length} ${galeria.length === 1 ? 'foto' : 'fotos'}
          <svg class="seta ${aberta ? 'aberta' : ''}"><use href="#i-seta" /></svg>
        </button>
        ${aberta ? `
          <div class="galeria">
            ${galeria.map((src, f) => `
              <figure class="galeria-foto">
                <img src="${esc(previa(src))}" alt="" loading="lazy">
                <button type="button" data-acao="remover-foto" data-indice="${i}" data-foto="${f}" aria-label="Remover foto">✕</button>
              </figure>`).join('')}
            ${botaoArquivo({ rotulo: `${icone('i-selecao')}<span>Adicionar fotos</span>`, upload: 'galeria', caminho: `galeria-${i}`, indice: i, multiplo: true, classe: 'galeria-add' })}
          </div>` : ''}
      </article>`;
  }).join('');

  return `
    <div class="lista">
      ${itens || '<p class="lista-vazia">Nenhuma categoria ainda.</p>'}
      <button class="adicionar" type="button" data-acao="adicionar" data-lista="categories">+ Nova categoria</button>
    </div>`;
}

function abaServicos() {
  const servicos = estado.site.services;
  const itens = servicos.map((s, i) => `
    <article class="cartao item">
      <div class="item-topo">
        <div class="item-capa">
          ${midia(s.image, { classe: 'midia-quadrada' })}
          ${botaoArquivo({ rotulo: 'Trocar', upload: 'imagem', caminho: `site.services.${i}.image`, classe: 'botao-mini' })}
        </div>
        <div class="item-campos">
          ${campo({ rotulo: 'Nome do serviço', caminho: `site.services.${i}.name` })}
          <div class="campo-dupla">
            ${campo({ rotulo: 'Preço', caminho: `site.services.${i}.price`, placeholder: 'Sob Consulta' })}
            ${campo({ rotulo: 'Duração', caminho: `site.services.${i}.duration`, placeholder: '3 a 5 horas' })}
          </div>
        </div>
        ${acoesItem('services', i, servicos.length)}
      </div>
      <div class="item-corpo">
        ${campo({ rotulo: 'Descrição', caminho: `site.services.${i}.description`, linhas: 3 })}
        ${campo({ rotulo: 'O que inclui', caminho: `site.services.${i}.includes`, linhas: 4, formato: 'linhas', dica: 'Um item por linha.' })}
        <div class="campo-dupla">
          ${campo({ rotulo: 'WhatsApp próprio', caminho: `site.services.${i}.whatsapp`, tipo: 'tel', placeholder: 'Vazio = número do site' })}
          ${campo({ rotulo: 'Mensagem do WhatsApp', caminho: `site.services.${i}.whatsappMessage`, placeholder: 'Olá! Quero esse serviço.' })}
        </div>
      </div>
    </article>`).join('');

  return `
    <div class="lista">
      ${itens || '<p class="lista-vazia">Nenhum serviço ainda.</p>'}
      <button class="adicionar" type="button" data-acao="adicionar" data-lista="services">+ Novo serviço</button>
    </div>`;
}

function abaDuvidas() {
  const itens = estado.faqs.map((d, i) => `
    <article class="cartao item item-duvida">
      <span class="numero">${i + 1}</span>
      <div class="item-campos">
        ${campo({ rotulo: 'Pergunta', caminho: `faqs.${i}.question`, placeholder: 'Quanto tempo leva o ensaio?' })}
        ${campo({ rotulo: 'Resposta', caminho: `faqs.${i}.answer`, linhas: 3 })}
      </div>
      ${acoesItem('faqs', i, estado.faqs.length)}
    </article>`).join('');

  return `
    <div class="lista">
      ${itens || '<p class="lista-vazia">Nenhuma dúvida ainda. Perguntas sem resposta não aparecem no site.</p>'}
      <button class="adicionar" type="button" data-acao="adicionar" data-lista="faqs">+ Nova dúvida</button>
    </div>`;
}

function abaVisibilidade() {
  return `
    <div class="ms-grade">
      ${gruposCompletos().map((grupo) => `
        <article class="cartao">
          <h3>${grupo.nome}</h3>
          <div class="interruptores">
            ${grupo.tags.map((tag) => `
              <label class="interruptor">
                <span>${esc(NOMES[tag] || tag)}</span>
                <input type="checkbox" data-vis="${tag}" ${visibilidade[tag] ? 'checked' : ''}>
                <span class="trilho-chave" aria-hidden="true"></span>
              </label>`).join('')}
          </div>
        </article>`).join('')}
    </div>`;
}

const RENDER = { capa: abaCapa, portfolio: abaPortfolio, servicos: abaServicos, duvidas: abaDuvidas, visibilidade: abaVisibilidade };

function pintar() {
  for (const botao of barraAbas.querySelectorAll('[data-aba]')) {
    const ativa = botao.dataset.aba === abaAtual;
    botao.classList.toggle('ativa', ativa);
    botao.setAttribute('aria-selected', ativa);
  }
  painel.innerHTML = RENDER[abaAtual]();
  atualizarSujo();
}

function trocarAba(id) {
  if (id === abaAtual) return;
  abaAtual = id;
  painel.classList.remove('entrando');
  void painel.offsetWidth; // reinicia a animação
  painel.classList.add('entrando');
  pintar();
}

// ---------------------------------------------------------------- ações

const NOVOS = {
  categories: () => ({ name: '', subtitle: '', image: '', gallery: [] }),
  // WhatsApp próprio vazio: o site cai no número do site.
  services: () => ({ name: '', image: '', price: 'Sob Consulta', duration: '', description: '', includes: [], whatsapp: '', whatsappMessage: '' }),
  faqs: () => ({ question: '', answer: '' })
};

function listaDe(nome) {
  return nome === 'faqs' ? estado.faqs : estado.site[nome];
}

function acao(botao) {
  const { acao: tipo, lista, indice } = botao.dataset;
  const i = Number(indice);

  switch (tipo) {
    case 'aba':
      return trocarAba(botao.dataset.aba);
    case 'salvar':
      return salvar();
    case 'adicionar': {
      listaDe(lista).push(NOVOS[lista]());
      pintar();
      // Leva até o item novo e foca o primeiro campo
      const ultimo = painel.querySelectorAll('.item');
      const alvo = ultimo[ultimo.length - 1];
      alvo?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      alvo?.querySelector('input, textarea')?.focus({ preventScroll: true });
      return;
    }
    case 'remover': {
      const itens = listaDe(lista);
      const nome = itens[i]?.name || itens[i]?.question || 'este item';
      if (!confirm(`Remover "${nome}"? Ele só sai do site depois de salvar.`)) return;
      itens.splice(i, 1);
      galeriasAbertas.clear();
      return pintar();
    }
    case 'subir':
    case 'descer': {
      const itens = listaDe(lista);
      const j = tipo === 'subir' ? i - 1 : i + 1;
      if (j < 0 || j >= itens.length) return;
      [itens[i], itens[j]] = [itens[j], itens[i]];
      galeriasAbertas.clear();
      return pintar();
    }
    case 'galeria':
      galeriasAbertas.has(i) ? galeriasAbertas.delete(i) : galeriasAbertas.add(i);
      return pintar();
    case 'remover-foto':
      estado.site.categories[i].gallery.splice(Number(botao.dataset.foto), 1);
      return pintar();
    case 'remover-video':
      estado.site.hero.video = '';
      return pintar();
    case 'remover-centro':
      estado.site.center = { media: '', tipo: '' };
      return pintar();
  }
}

async function enviarArquivos(input) {
  const arquivos = [...input.files];
  if (!arquivos.length) return;
  const { upload, caminho, indice } = input.dataset;
  const chave = caminho || upload;

  enviando.add(chave);
  pintar();
  try {
    if (upload === 'imagem') {
      gravarCaminho(caminho, await uploadImage(arquivos[0]));
    } else if (upload === 'video-capa') {
      const { url, tipo } = await uploadMedia(arquivos[0]);
      if (tipo !== 'video') throw new Error('Escolha um arquivo de vídeo (MP4 ou WebM).');
      estado.site.hero.video = url;
    } else if (upload === 'centro') {
      const { url, tipo } = await uploadMedia(arquivos[0]);
      estado.site.center = { media: url, tipo };
    } else if (upload === 'galeria') {
      const categoria = estado.site.categories[Number(indice)];
      if (!Array.isArray(categoria.gallery)) categoria.gallery = [];
      for (const arquivo of arquivos) categoria.gallery.push(await uploadImage(arquivo));
    }
    avisar(arquivos.length > 1 ? `${arquivos.length} fotos enviadas. Lembre de salvar.` : 'Arquivo enviado. Lembre de salvar.');
  } catch (erro) {
    avisar(erro.status === 401 ? 'Sua sessão expirou. Entre de novo.' : erro.message || 'Não foi possível enviar.', 'erro');
  } finally {
    enviando.delete(chave);
    pintar();
  }
}

async function mudarVisibilidade(input) {
  const tag = input.dataset.vis;
  const anterior = visibilidade[tag];
  visibilidade = { ...visibilidade, [tag]: input.checked };
  try {
    await putContent('visibility', visibilidade);
    writeCache(visibilidade);
    avisar(`${NOMES[tag] || tag}: ${input.checked ? 'visível' : 'escondido'}`);
  } catch (erro) {
    visibilidade = { ...visibilidade, [tag]: anterior };
    input.checked = anterior;
    avisar(`Não foi possível salvar: ${erro.message}`, 'erro');
  }
}

// ---------------------------------------------------------------- salvar

function validarWhatsapp(numero, onde) {
  if (numero && (numero.length < 10 || numero.length > 13)) {
    throw new Error(`O WhatsApp de ${onde} parece incompleto. Use 55 + DDD + número.`);
  }
}

/** Limpa o rascunho da aba no formato que o site espera. */
function prontoParaSalvar(idAba) {
  const s = estado.site;
  if (idAba === 'capa') {
    const whatsapp = soDigitos(s.hero.button?.whatsapp);
    validarWhatsapp(whatsapp, 'botão de orçamento');
    return {
      hero: {
        ...s.hero,
        eyebrow: String(s.hero.eyebrow ?? '').trim(),
        title: String(s.hero.title ?? '').trim(),
        subtitle: String(s.hero.subtitle ?? '').trim(),
        button: { ...s.hero.button, text: String(s.hero.button?.text ?? '').trim(), whatsapp, message: String(s.hero.button?.message ?? '').trim() }
      },
      center: s.center,
      banner: {
        ...s.banner,
        titleScreen: String(s.banner.titleScreen ?? '').trim(),
        title: String(s.banner.title ?? '').trim(),
        subtitle: String(s.banner.subtitle ?? '').trim()
      }
    };
  }
  if (idAba === 'portfolio') {
    // Campos que a tela não mostra (id, order, featured...) passam intactos.
    return {
      categories: s.categories
        .filter((c) => String(c.name ?? '').trim())
        .map((c) => ({
          ...c,
          name: String(c.name).trim(),
          subtitle: String(c.subtitle ?? '').trim(),
          gallery: Array.isArray(c.gallery) ? c.gallery : []
        }))
    };
  }
  if (idAba === 'servicos') {
    return {
      services: s.services
        .filter((x) => String(x.name ?? '').trim())
        .map((x) => {
          const whatsapp = soDigitos(x.whatsapp);
          validarWhatsapp(whatsapp, `"${x.name.trim()}"`);
          return {
            ...x,
            name: String(x.name).trim(),
            price: String(x.price ?? '').trim(),
            duration: String(x.duration ?? '').trim(),
            description: String(x.description ?? '').trim(),
            includes: (Array.isArray(x.includes) ? x.includes : String(x.includes ?? '').split('\n'))
              .map((item) => String(item).trim()).filter(Boolean),
            whatsapp,
            whatsappMessage: String(x.whatsappMessage ?? '').trim()
          };
        })
    };
  }
  if (idAba === 'duvidas') {
    return estado.faqs
      .map((d) => ({ question: String(d.question ?? '').trim(), answer: String(d.answer ?? '').trim() }))
      .filter((d) => d.question && d.answer);
  }
  return null;
}

async function salvar() {
  const idAba = abaAtual;
  const rotulo = botaoSalvar.textContent;
  botaoSalvar.disabled = true;
  botaoSalvar.textContent = 'Salvando…';
  try {
    const pronto = prontoParaSalvar(idAba);
    if (idAba === 'duvidas') {
      await putContent('faqs', pronto);
      estado.faqs = clonar(pronto);
    } else {
      const publicado = await dados.save(pronto);
      for (const chave of Object.keys(pronto)) estado.site[chave] = clonar(publicado[chave]);
    }
    marcarSalvo(idAba);
    avisar('Salvo! O site já mostra as mudanças.');
  } catch (erro) {
    avisar(erro.status === 401 ? 'Sua sessão expirou. Entre de novo.' : erro.message || 'Não foi possível salvar.', 'erro');
  } finally {
    botaoSalvar.textContent = rotulo;
    pintar();
  }
}

// ---------------------------------------------------------------- montagem

function ligarEventos() {
  raiz.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-acao]');
    if (botao && raiz.contains(botao) && !botao.disabled) acao(botao);
  });

  raiz.addEventListener('input', (evento) => {
    const alvo = evento.target;
    if (!alvo.dataset.bind) return;
    const valor = alvo.dataset.formato === 'linhas' ? alvo.value.split('\n') : alvo.value;
    gravarCaminho(alvo.dataset.bind, valor);
    atualizarSujo();
  });

  raiz.addEventListener('change', (evento) => {
    const alvo = evento.target;
    if (alvo.dataset.upload) enviarArquivos(alvo);
    else if (alvo.dataset.vis) mudarVisibilidade(alvo);
  });

  // Teclas ← → navegam entre as abas
  barraAbas.addEventListener('keydown', (evento) => {
    if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') return;
    const i = ABAS.findIndex((a) => a.id === abaAtual);
    const j = (i + (evento.key === 'ArrowRight' ? 1 : -1) + ABAS.length) % ABAS.length;
    trocarAba(ABAS[j].id);
    barraAbas.querySelector(`[data-aba="${ABAS[j].id}"]`).focus();
  });

  window.addEventListener('beforeunload', (evento) => {
    if (ABAS.some((a) => estaSujo(a.id))) {
      evento.preventDefault();
      evento.returnValue = '';
    }
  });
}

export async function montar(secao) {
  raiz = secao;
  secao.querySelector('.vazio')?.remove();

  const cabeca = secao.querySelector('.tela-cabeca');
  cabeca.insertAdjacentHTML('beforeend', `
    <div class="ms-salvar">
      <span class="ms-status" id="ms-status">Carregando…</span>
      <a class="botao botao-secundario" href="/" target="_blank" rel="noopener">${icone('i-externo')} Ver site</a>
      <button class="botao botao-primario" type="button" data-acao="salvar" id="ms-salvar" disabled>Salvar alterações</button>
    </div>`);
  botaoSalvar = cabeca.querySelector('#ms-salvar');
  statusSalvar = cabeca.querySelector('#ms-status');

  secao.insertAdjacentHTML('beforeend', `
    <div class="ms-abas" role="tablist" aria-label="Partes do site">
      ${ABAS.map((a) => `<button class="ms-aba" type="button" role="tab" data-acao="aba" data-aba="${a.id}">${a.rotulo}<span class="ponto-sujo"></span></button>`).join('')}
    </div>
    <div class="ms-painel" role="tabpanel">
      <div class="carregando"><span class="girando"></span> Carregando o conteúdo do site…</div>
    </div>`);
  barraAbas = secao.querySelector('.ms-abas');
  painel = secao.querySelector('.ms-painel');
  ligarEventos();

  try {
    const [conteudo, faqs, vis] = await Promise.all([
      getContent('siteData'),
      getContent('faqs').catch(() => null),
      getContent('visibility').catch(() => null)
    ]);
    // adopt() normaliza (hero completo, versão a partir do publicado) para o
    // próximo save não nascer com versão menor que a atual.
    const base = dados.adopt({ ...defaultData, ...(conteudo && typeof conteudo === 'object' ? conteudo : {}) });
    estado.site = clonar(base);
    estado.site.center = { media: '', tipo: '', ...(estado.site.center || {}) };
    estado.site.hero.button = { ...defaultData.hero.button, ...(estado.site.hero.button || {}) };
    estado.faqs = Array.isArray(faqs) ? clonar(faqs) : [];
    visibilidade = vis ? normalize(vis) : (readCache() || { ...defaultVisibility });
  } catch (erro) {
    painel.innerHTML = `<div class="carregando erro">Não foi possível carregar o conteúdo: ${esc(erro.message)}</div>`;
    statusSalvar.textContent = 'Erro ao carregar';
    return;
  }

  for (const aba of ABAS) if (aba.id !== 'visibilidade') marcarSalvo(aba.id);
  pintar();
}
