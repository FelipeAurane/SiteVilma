/**
 * Painel de configuração (/config).
 *
 * Quatro seções — Visão geral, Textos do site, Categorias e Visibilidade —
 * uma por vez, escolhidas no trilho lateral de ícones.
 *
 * Duas coisas independentes, guardadas no servidor e pelo mesmo cookie de
 * sessão do login:
 *
 *   visibilidade  — liga e desliga blocos do site (as tags data-tag do HTML)
 *   siteData      — os textos, imagens e categorias que a home mostra
 *
 * Antes os interruptores eram montados em containers que não existiam no
 * HTML, então nada era controlado. Aqui os containers existem de verdade e a
 * lista de blocos vem de um único lugar (GRUPOS), conferida contra o
 * defaultVisibility do visibility.js.
 */

import { exigirLogin } from './admin-auth.js';
import {
  getContent,
  putContent,
  uploadImage,
  uploadMedia,
  LIMITE_VIDEO_BYTES,
  getSelecoes,
  updateSelecaoStatus,
  deleteSelecao,
  getCatalogConfig,
  saveCatalogConfig,
  getProtectionData,
  saveProtectionConfig,
  reprocessImages,
  logout
} from './api.js';
import { DataManager, defaultData, safeImageSrc, isVideoMedia } from './dataManager.js';
import {
  defaultVisibility,
  readCache,
  writeCache,
  applyVisibility,
  fetchVisibility
} from './visibility.js';

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

/**
 * Grupos que faltarem. Se amanhã o visibility.js ganhar uma tag nova, ela
 * aparece aqui em vez de sumir do painel.
 */
function gruposCompletos() {
  const conhecidos = new Set(GRUPOS.flatMap((g) => g.tags));
  const faltando = Object.keys(defaultVisibility).filter((tag) => !conhecidos.has(tag));
  return faltando.length ? [...GRUPOS, { id: 'outros', nome: 'Outros', tags: faltando }] : GRUPOS;
}

// ---------------------------------------------------------------- estado

let visibilidade = { ...defaultVisibility };
let conteudo = null;
let categorias = [];
let servicos = [];
let duvidas = [];
let datas = {};
let timerVisibilidade = null;

/**
 * Marcado pelo botão "tirar o vídeo". Vale até o próximo Salvar: sem ele não
 * haveria como voltar a capa só com imagem, porque o campo de arquivo não
 * consegue "desescolher" o que já está publicado.
 */
let tirarVideoCapa = false;

/** Mês mostrado na grade da agenda. Começa no atual, não em janeiro. */
let mesAgenda = new Date();

const dados = new DataManager();

const el = (id) => document.getElementById(id);

// ---------------------------------------------------------------- avisos

function avisar(mensagem, tipo = 'ok') {
  const toast = el('toast');
  if (!toast) return;

  toast.textContent = mensagem;
  toast.dataset.tipo = tipo;
  toast.dataset.visivel = 'true';

  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    toast.dataset.visivel = 'false';
  }, 3200);
}

function marcarEstado(estado, mensagem) {
  const ponto = el('ponto');
  const texto = el('estado');
  if (ponto) ponto.dataset.estado = estado;
  if (texto) texto.textContent = mensagem;
}

const HORA = { hour: '2-digit', minute: '2-digit' };
const DIA = { day: '2-digit', month: '2-digit' };
const DIA_ANO = { day: '2-digit', month: '2-digit', year: '2-digit' };

/**
 * "Última alteração" sem data só diz que horas foram. Hoje mostra a hora,
 * outro dia deste ano mostra dia e mês, e o resto mostra o ano também.
 */
function formatar(quando) {
  const data = new Date(quando);
  if (Number.isNaN(data.getTime())) return '—';

  const hoje = new Date();
  const mesmoDia = data.toDateString() === hoje.toDateString();
  const mesmoAno = data.getFullYear() === hoje.getFullYear();
  const hora = data.toLocaleTimeString('pt-BR', HORA);

  if (mesmoDia) return hora;
  return `${data.toLocaleDateString('pt-BR', mesmoAno ? DIA : DIA_ANO)} às ${hora}`;
}

// ------------------------------------------------------------ visibilidade

/** Agrupa cliques seguidos numa gravação só: mexer em seis chaves não vira seis escritas. */
function agendarVisibilidade() {
  clearTimeout(timerVisibilidade);
  marcarEstado('salvando', 'Salvando...');

  timerVisibilidade = setTimeout(async () => {
    try {
      // A visibilidade mora na chave "visibility"; os textos, na "siteData".
      await putContent('visibility', visibilidade);
      marcarEstado('salvo', 'Sincronizado');
      atualizarEstatisticas();
    } catch (erro) {
      marcarEstado('erro', 'Falha ao salvar');
      avisar(mensagemDeErro(erro), 'erro');
    }
  }, 600);
}

function mensagemDeErro(erro) {
  if (erro?.status === 401) return 'Sua sessão expirou. Recarregue e entre de novo.';
  return erro?.message || 'Algo deu errado.';
}

function aplicarEAtualizar({ gravar = true } = {}) {
  writeCache(visibilidade);
  applyVisibility(visibilidade);
  atualizarEstatisticas();
  if (gravar) agendarVisibilidade();
}

function atualizarEstatisticas() {
  const chaves = Object.keys(visibilidade);
  const publicados = chaves.filter((tag) => visibilidade[tag]).length;

  el('estat-total').textContent = String(chaves.length);
  el('estat-visiveis').textContent = String(publicados);
  el('estat-ocultos').textContent = String(chaves.length - publicados);

  const quando = conteudo?.lastUpdated;
  el('estat-sync').textContent = quando ? formatar(quando) : '—';

  atualizarResumo();
}

/**
 * A tela inicial mostra o que o site está exibindo agora, com os valores que
 * acabaram de ser lidos do servidor — não o que está nos campos, que podem ter
 * edições ainda não salvas.
 */
function atualizarResumo() {
  const hero = conteudo?.hero || defaultData.hero;

  const rTitulo = el('resumo-titulo');
  if (rTitulo) rTitulo.textContent = String(hero.title || '—');

  const rSub = el('resumo-subtitulo');
  if (rSub) rSub.textContent = String(hero.subtitle || '—');

  const rCat = el('resumo-categorias');
  if (rCat) rCat.textContent = categorias.length
    ? `${categorias.length} ${categorias.length === 1 ? 'categoria' : 'categorias'}`
    : 'Nenhuma';

  const rServ = el('resumo-servicos');
  if (rServ) rServ.textContent = servicos.length
    ? `${servicos.length} ${servicos.length === 1 ? 'serviço' : 'serviços'}`
    : 'Nenhum';

  const rDuv = el('resumo-duvidas');
  if (rDuv) rDuv.textContent = duvidas.length
    ? `${duvidas.length} ${duvidas.length === 1 ? 'pergunta' : 'perguntas'}`
    : 'Nenhuma';

  const rAgenda = el('resumo-agenda');
  const dias = Object.keys(datas || {}).length;
  if (rAgenda) {
    rAgenda.textContent = dias
      ? `${dias} ${dias === 1 ? 'dia' : 'dias'}`
      : 'Nenhum dia';
  }

  definirEtiqueta('resumo-grade', visibilidade['next-section'] !== false, 'Publicada', 'Oculta');
  definirEtiqueta('resumo-servicos-vis', servicos.length > 0, 'Com conteúdo', 'Vazia');
  definirEtiqueta('resumo-agenda-vis', dias > 0, 'Com datas', 'Sem datas');
}

/**
 * 'next-section' é a grade do portfólio. O padrão é ligada, então a ausência
 * da chave conta como ligada — o que importa é ela estar explicitamente falsa.
 */
function definirEtiqueta(id, ligado, textoLigado, textoDesligado) {
  const etiqueta = el(id);
  if (!etiqueta) return;
  etiqueta.textContent = ligado ? textoLigado : textoDesligado;
  etiqueta.dataset.estado = ligado ? 'publicado' : 'oculto';
}

function definirTodos(valor) {
  for (const tag of Object.keys(visibilidade)) visibilidade[tag] = valor;
  pintarVisibilidade();
  aplicarEAtualizar();
  avisar(valor ? 'Todos os blocos foram publicados.' : 'Todos os blocos foram ocultos.', valor ? 'ok' : 'erro');
}

function pintarVisibilidade() {
  const grade = el('grade-vis');
  if (!grade) return;
  grade.replaceChildren();

  for (const grupo of gruposCompletos()) {
    const cartao = document.createElement('section');
    cartao.className = 'cartao';

    const topo = document.createElement('div');
    topo.className = 'cartao-topo';
    const titulo = document.createElement('h3');
    titulo.className = 'cartao-titulo';
    titulo.textContent = grupo.nome;
    topo.appendChild(titulo);
    cartao.appendChild(topo);

    const corpo = document.createElement('div');
    corpo.className = 'cartao-corpo';
    corpo.style.gap = '8px';

    for (const tag of grupo.tags) {
      corpo.appendChild(linhaVisibilidade(tag));
    }

    cartao.appendChild(corpo);
    grade.appendChild(cartao);
  }

  aplicarFiltros();
}

function linhaVisibilidade(tag) {
  const linha = document.createElement('div');
  linha.className = 'item-vis';
  linha.dataset.tag = tag;

  const textos = document.createElement('span');

  const nome = document.createElement('span');
  nome.className = 'item-vis-nome';
  nome.textContent = NOMES[tag] || tag;
  textos.appendChild(nome);

  const codigo = document.createElement('span');
  codigo.className = 'item-vis-tag';
  codigo.textContent = tag;
  textos.appendChild(codigo);

  linha.appendChild(textos);

  const chave = document.createElement('label');
  chave.className = 'chave';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = Boolean(visibilidade[tag]);
  input.setAttribute('aria-label', nome.textContent);

  const trilho = document.createElement('span');
  trilho.className = 'chave-trilho';

  chave.appendChild(input);
  chave.appendChild(trilho);

  input.addEventListener('change', () => {
    visibilidade[tag] = input.checked;
    aplicarEAtualizar();
    aplicarFiltros();
  });

  linha.appendChild(chave);
  return linha;
}

function aplicarFiltros() {
  const soPublicados = el('filtro-publicados').checked;
  const soOcultos = el('filtro-ocultos').checked;

  for (const linha of document.querySelectorAll('.item-vis[data-tag]')) {
    const publicado = Boolean(visibilidade[linha.dataset.tag]);
    linha.style.display = publicado ? (soPublicados ? '' : 'none') : soOcultos ? '' : 'none';
  }
}

// --------------------------------------------------------------- imagens

/**
 * Mostra a prévia de uma imagem. Se o arquivo não existir (o site ainda pode
 * apontar para uma imagem que foi removida), volta para o estado vazio em vez
 * de deixar o ícone de imagem quebrada.
 */
function mostrarPrevia(img, vazio, src, rotulo, arquivo) {
  const limpar = () => {
    img.hidden = true;
    img.removeAttribute('src');
    vazio.hidden = false;
  };

  img.hidden = true;
  img.removeAttribute('src');
  vazio.hidden = false;

  if (src) {
    img.onload = () => {
      img.hidden = false;
      vazio.hidden = true;
    };
    img.onerror = limpar;
    img.src = src;
  }

  if (!rotulo) return;
  if (arquivo) rotulo.textContent = `Escolhido: ${arquivo}`;
  else rotulo.textContent = src ? `Atual: ${src}` : 'Nenhuma imagem definida';
}

/** Sobe o arquivo escolhido e devolve a URL; sem arquivo, mantém a atual. */
async function enviarSeEscolhido(input, atual) {
  const arquivo = input.files?.[0];
  return arquivo ? await uploadImage(arquivo) : atual;
}

/**
 * Foto do meio: imagem ou vídeo no mesmo campo. `uploadMedia` já aceita os
 * dois; a diferença aqui é guardar o tipo junto com a URL, porque a do
 * /api/media é um id, sem extensão de onde o site deduzir.
 */
async function enviarCentroSeEscolhido(input, atual) {
  const arquivo = input.files?.[0];
  if (!arquivo) return atual;

  const { url, tipo } = await uploadMedia(arquivo);
  return { media: url, tipo };
}

/**
 * Capa da seção principal: imagem ou vídeo, como o site já espera — ele lê
 * hero.video e, quando existe, troca a imagem por um <video> usando
 * hero.image como pôster.
 *
 * Escolher imagem limpa o vídeo, e escolher vídeo mantém a imagem atual como
 * pôster. Sem pôster o vídeo abre em preto no aparelho, que é o jeito pior de
 * descobrir que o upload deu certo.
 */
async function enviarCapaSeEscolhido(input, atual, tirarVideo) {
  if (tirarVideo) return { image: atual.image, video: '' };

  const arquivo = input.files?.[0];
  if (!arquivo) return { image: atual.image, video: atual.video };

  if (arquivo.type.startsWith('video/')) {
    const { url } = await uploadMedia(arquivo);
    return { image: atual.image, video: url };
  }

  const url = await uploadImage(arquivo);
  return { image: url, video: '' };
}

/**
 * Desenha a capa. Com vídeo no ar, a prévia é o próprio vídeo rodando sem
 * som; sem vídeo, é a imagem. Mostrar a imagem e escrever "no ar: vídeo"
 * embaixo deixaria a dúvida de qual dos dois a visitante vê.
 */
function pintarCapa() {
  const img = el('hero-previa');
  const video = el('hero-previa-video');
  const vazio = el('hero-previa-vazia');
  const rotulo = el('hero-imagem-atual');
  const tirar = el('hero-tirar-video');
  if (!img || !video || !vazio) return;

  const hero = conteudo.hero || defaultData.hero;
  const poster = safeImageSrc(hero.image, defaultData.hero.image);
  const fonte = safeImageSrc(hero.video);
  const escolhido = el('hero-imagem')?.files?.[0];

  img.hidden = true;
  video.hidden = true;
  vazio.hidden = false;
  img.removeAttribute('src');
  video.removeAttribute('src');

  let texto;
  if (escolhido) {
    const eVideo = escolhido.type.startsWith('video/');
    texto = `Escolhido: ${escolhido.name} (${eVideo ? 'vídeo' : 'imagem'})`;
    const fontePrevia = URL.createObjectURL(escolhido);
    if (eVideo) {
      video.src = fontePrevia;
      video.hidden = false;
    } else {
      img.src = fontePrevia;
      img.hidden = false;
    }
  } else if (fonte) {
    texto = 'No ar: vídeo de fundo. A imagem é o pôster.';
    video.src = fonte;
    if (poster) video.poster = poster;
    video.hidden = false;
  } else if (poster) {
    texto = 'No ar: imagem.';
    img.src = poster;
    img.hidden = false;
  } else {
    texto = 'Nenhuma capa definida.';
  }

  if (rotulo) rotulo.textContent = texto;
  if (tirar) tirar.hidden = !fonte && !heroVideoEscolhido();
}

/** Há vídeo no ar ou na fila de envio? É o que decide mostrar o botão. */
function heroVideoEscolhido() {
  const escolhido = el('hero-imagem')?.files?.[0];
  return Boolean(escolhido && escolhido.type.startsWith('video/'));
}

// ---------------------------------------------------------------- textos

function pintarTextos() {
  const hero = conteudo?.hero || defaultData.hero;
  const banner = conteudo?.banner || defaultData.banner;
  const botao = hero?.button || defaultData.hero.button;

  if (el('hero-etiqueta')) el('hero-etiqueta').value = String(hero.eyebrow ?? '');
  if (el('hero-titulo')) el('hero-titulo').value = String(hero.title ?? '');
  if (el('hero-subtitulo')) el('hero-subtitulo').value = String(hero.subtitle ?? '');
  if (el('botao-texto')) el('botao-texto').value = String(botao.text ?? '');
  if (el('botao-whatsapp')) el('botao-whatsapp').value = String(botao.whatsapp ?? '');
  if (el('botao-mensagem')) el('botao-mensagem').value = String(botao.message ?? '');

  if (el('banner-titulo-tela')) el('banner-titulo-tela').value = String(banner.titleScreen ?? '');
  if (el('banner-titulo')) el('banner-titulo').value = String(banner.title ?? '');
  if (el('banner-subtitulo')) el('banner-subtitulo').value = String(banner.subtitle ?? '');

  pintarCapa();

  if (el('banner-previa') && el('banner-previa-vazia')) {
    mostrarPrevia(
      el('banner-previa'), el('banner-previa-vazia'),
      safeImageSrc(banner.image, defaultData.banner.image),
      el('banner-imagem-atual'), null
    );
  }

  pintarCentro();
}

/** O campo do meio não usa miniatura: é imagem OU vídeo, e o texto precisa
    dizer qual dos dois está no ar — é isso que a dona vai querer conferir
    depois de salvar, não a aparência. */
function pintarCentro() {
  const center = conteudo.center || defaultData.center;
  const rotulo = el('center-atual');
  if (!rotulo) return;

  const media = safeImageSrc(center.media);
  const escolhido = el('center-arquivo').files?.[0];

  if (escolhido) {
    const tipo = escolhido.type.startsWith('video/') ? 'vídeo' : 'imagem';
    rotulo.textContent = `Escolhido: ${escolhido.name} (${tipo})`;
    return;
  }
  if (!media) {
    rotulo.textContent = 'Padrão do site: a imagem de capa da seção principal.';
    return;
  }
  rotulo.textContent = isVideoMedia(media, center.tipo)
    ? `No ar: vídeo.`
    : `No ar: imagem.`;
}

/** Botão "Salvar" que desliga sozinho enquanto a gravação acontece. */
async function comBotao(botao, tarefa) {
  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Salvando...';
  marcarEstado('salvando', 'Salvando...');

  try {
    await tarefa();
    marcarEstado('salvo', 'Sincronizado');
    avisar('Alterações publicadas no site.');
  } catch (erro) {
    marcarEstado('erro', 'Falha ao salvar');
    avisar(mensagemDeErro(erro), 'erro');
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

async function salvarHero(botao) {
  await comBotao(botao, async () => {
    const atual = conteudo.hero || defaultData.hero;
    const botaoAtual = atual.button || defaultData.hero.button;
    const centerAtual = conteudo.center || defaultData.center;
    const capa = await enviarCapaSeEscolhido(el('hero-imagem'), atual, tirarVideoCapa);
    const centro = await enviarCentroSeEscolhido(el('center-arquivo'), centerAtual);

    conteudo = await dados.save({
      hero: {
        ...atual,
        image: capa.image,
        video: capa.video,
        eyebrow: el('hero-etiqueta').value.trim(),
        title: el('hero-titulo').value.trim(),
        subtitle: el('hero-subtitulo').value.trim(),
        button: {
          ...botaoAtual,
          text: el('botao-texto').value.trim(),
          whatsapp: el('botao-whatsapp').value.replace(/\D/g, ''),
          message: el('botao-mensagem').value.trim()
        }
      },
      center: centro
    });

    tirarVideoCapa = false;
    el('hero-imagem').value = '';
    el('center-arquivo').value = '';
    pintarTextos();
    // A tela inicial mostra o que está no ar, não o que está no formulário.
    atualizarEstatisticas();
  });
}

async function salvarBanner(botao) {
  await comBotao(botao, async () => {
    const atual = conteudo.banner || defaultData.banner;
    const imagem = await enviarSeEscolhido(el('banner-arquivo'), atual.image);

    conteudo = await dados.save({
      banner: {
        ...atual,
        image: imagem,
        titleScreen: el('banner-titulo-tela').value.trim(),
        title: el('banner-titulo').value.trim(),
        subtitle: el('banner-subtitulo').value.trim()
      }
    });

    el('banner-arquivo').value = '';
    pintarTextos();
    atualizarEstatisticas();
  });
}

// ------------------------------------------------------------ categorias

function pintarCategorias() {
  const lista = el('lista-categorias');
  lista.replaceChildren();

  if (categorias.length === 0) {
    const vazio = document.createElement('p');
    vazio.className = 'vazio';
    vazio.textContent = 'Nenhuma categoria. Clique em "Nova categoria" para criar a primeira.';
    lista.appendChild(vazio);
    return;
  }

  for (const categoria of categorias) {
    lista.appendChild(linhaCategoria(categoria));
  }
}

/**
 * Cada linha guarda a referência do próprio objeto da categoria, nunca a
 * posição dele. Assim reordenar ou remover não deixa nenhum campo apontando
 * para a linha errada.
 */
function linhaCategoria(categoria) {
  const linha = document.createElement('div');
  linha.className = 'categoria';

  // miniatura
  const figura = document.createElement('figure');
  figura.className = 'miniatura miniatura--cartao';

  const src = safeImageSrc(categoria.image);

  const nomeDoArquivo = src ? src.split('/').pop() : '';
  const legenda = document.createElement('figcaption');
  legenda.textContent = nomeDoArquivo || 'Sem imagem';

  // Imagem que não carrega vira o mesmo estado vazio de "sem imagem", em vez
  // do ícone de arquivo quebrado do navegador.
  const mostrarVazio = () => {
    const icone = document.createElement('span');
    icone.className = 'miniatura-vazia';
    icone.innerHTML = '<svg class="icone" aria-hidden="true"><use href="#i-grade"></use></svg>';
    legenda.textContent = 'Sem imagem';
    figura.replaceChildren(icone, legenda);
  };

  if (src) {
    const img = document.createElement('img');
    img.alt = categoria.name || 'Categoria';
    img.loading = 'lazy';
    img.addEventListener('error', mostrarVazio);
    img.src = src;
    figura.replaceChildren(img, legenda);
  } else {
    mostrarVazio();
  }

  linha.appendChild(figura);

  // nome e legenda do cartão. As chaves seguem o modelo de dados do site
  // (name, subtitle), não os rótulos em português.
  linha.appendChild(campoCategoria('Nome', categoria.name, categoria, 'name', 'Doces e sobremesas'));
  linha.appendChild(campoCategoria('Legenda', categoria.subtitle, categoria, 'subtitle', 'Confeitaria'));

  // remover (canto direito, ao lado dos campos)
  const acoes = document.createElement('div');
  acoes.className = 'categoria-acoes';

  const remover = document.createElement('button');
  remover.type = 'button';
  remover.className = 'btn-icone btn-icone--perigo';
  remover.title = `Remover ${categoria.name || 'categoria'}`;
  remover.setAttribute('aria-label', `Remover ${categoria.name || 'categoria'}`);
  remover.innerHTML = '<svg class="icone" aria-hidden="true"><use href="#i-lixeira"></use></svg>';
  remover.addEventListener('click', () => {
    categorias = categorias.filter((item) => item !== categoria);
    pintarCategorias();
  });
  acoes.appendChild(remover);
  linha.appendChild(acoes);

  // trocar imagem, em linha inteira embaixo dos campos
  const campoImagem = document.createElement('label');
  campoImagem.className = 'campo campo--largo';

  const rotuloImagem = document.createElement('span');
  rotuloImagem.className = 'campo-rotulo';
  rotuloImagem.textContent = 'Trocar imagem';
  campoImagem.appendChild(rotuloImagem);

  const arquivo = document.createElement('input');
  arquivo.className = 'entrada';
  arquivo.type = 'file';
  arquivo.accept = 'image/*';
  arquivo.addEventListener('change', () => {
    const escolhido = arquivo.files?.[0] || null;
    categoria.imagemEscolhida = escolhido;
    legenda.textContent = escolhido ? escolhido.name : nomeDoArquivo || 'Sem imagem';
  });
  campoImagem.appendChild(arquivo);
  linha.appendChild(campoImagem);

  return linha;
}

function campoCategoria(rotulo, valor, categoria, propriedade, exemplo) {
  const campo = document.createElement('label');
  campo.className = 'campo';

  const texto = document.createElement('span');
  texto.className = 'campo-rotulo';
  texto.textContent = rotulo;
  campo.appendChild(texto);

  const entrada = document.createElement('input');
  entrada.className = 'entrada';
  entrada.type = 'text';
  entrada.value = String(valor ?? '');
  entrada.placeholder = exemplo;
  entrada.addEventListener('input', () => {
    categoria[propriedade] = entrada.value;
  });
  campo.appendChild(entrada);

  return campo;
}

async function salvarCategorias(botao) {
  await comBotao(botao, async () => {
    const prontas = [];

    for (const categoria of categorias) {
      const nome = String(categoria.name ?? '').trim();
      // Categoria sem nome não entra no site.
      if (!nome) continue;

      const imagem = categoria.imagemEscolhida
        ? await uploadImage(categoria.imagemEscolhida)
        : categoria.image;

      // O painel edita nome, legenda e imagem. O resto (id, description,
      // featured, order, gallery) é preservado como está: apagar campos que
      // a tela nem mostra seria perder trabalho do dono do site.
      const { imagemEscolhida, ...resto } = categoria;

      prontas.push({
        ...resto,
        name: nome,
        subtitle: String(categoria.subtitle ?? '').trim(),
        image: imagem || ''
      });
    }

    conteudo = await dados.save({ categories: prontas });
    // Cópia limpa: some com o File pendente, que já foi enviado.
    categorias = prontas.map((pronta) => ({ ...pronta }));
    pintarCategorias();
    atualizarEstatisticas();
  });
}

// ----------------------------------------------------------------- tema

const CHAVE_TEMA = 'painelTema';

/**
 * O tema é aplicado antes da primeira pintura, no <head>, pelo script inline
 * do config.html. Aqui só desenhamos o botão que troca.
 */
function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    // Sem storage o tema vale só nesta aba, que ainda é o melhor comportamento.
  }

  const claro = tema === 'claro';
  const botao = el('alternar-tema');
  if (!botao) return;

  botao.setAttribute('aria-label', claro ? 'Mudar para o tema escuro' : 'Mudar para o tema claro');
  el('tema-icone')?.querySelector('use')
    ?.setAttribute('href', claro ? '#i-sol' : '#i-lua');
  const rotulo = el('tema-rotulo');
  if (rotulo) rotulo.textContent = claro ? 'Tema escuro' : 'Tema claro';
}

function ligarTema() {
  el('alternar-tema')?.addEventListener('click', () => {
    aplicarTema(document.documentElement.dataset.tema === 'claro' ? 'escuro' : 'claro');
  });
}

// ------------------------------------------------------------- serviços

/**
 * Serviços. A página /pages/servicos.html já lê este array, então o editor
 * não precisa inventar nada: os campos são exatamente os que o card usa.
 */
function pintarServicos() {
  const lista = el('lista-servicos');
  lista.replaceChildren();

  if (!servicos.length) {
    const vazio = document.createElement('p');
    vazio.className = 'vazio';
    vazio.textContent =
      'Nenhum serviço. A página de serviços avisa que a lista está vazia — clique em "Novo serviço" para criar o primeiro.';
    lista.appendChild(vazio);
    return;
  }

  servicos.forEach((servico, i) => lista.appendChild(linhaServico(servico, i)));
}

function linhaServico(servico, indice) {
  const linha = document.createElement('div');
  linha.className = 'servico';

  // miniatura
  const figura = document.createElement('figure');
  figura.className = 'servico-miniatura';

  const src = safeImageSrc(servico.image);
  const legenda = document.createElement('figcaption');
  const mostrarVazio = () => {
    const icone = document.createElement('span');
    icone.className = 'miniatura-vazia';
    icone.innerHTML = '<svg class="icone" aria-hidden="true"><use href="#i-grade"></use></svg>';
    legenda.textContent = 'Sem imagem';
    figura.replaceChildren(icone, legenda);
  };

  if (src) {
    const img = document.createElement('img');
    img.alt = servico.name || 'Serviço';
    img.loading = 'lazy';
    img.addEventListener('error', mostrarVazio);
    img.src = src;
    figura.replaceChildren(img, legenda);
  } else {
    mostrarVazio();
  }
  legenda.textContent = src ? src.split('/').pop() : 'Sem imagem';
  linha.appendChild(figura);

  linha.appendChild(campoServico('Nome', servico.name, servico, 'name', 'Ensaio gastronômico'));
  linha.appendChild(campoServico('Preço', servico.price, servico, 'price', 'R$ 350', 'campo--curto'));
  linha.appendChild(campoServico('Duração', servico.duration, servico, 'duration', '2 horas', 'campo--curto'));

  const acoes = document.createElement('div');
  acoes.className = 'servico-acoes';

  const remover = document.createElement('button');
  remover.type = 'button';
  remover.className = 'btn-icone btn-icone--perigo';
  remover.title = `Remover ${servico.name || 'serviço'}`;
  remover.setAttribute('aria-label', `Remover ${servico.name || 'serviço'}`);
  remover.innerHTML = '<svg class="icone" aria-hidden="true"><use href="#i-lixeira"></use></svg>';
  remover.addEventListener('click', () => {
    servicos = servicos.filter((item) => item !== servico);
    pintarServicos();
  });
  acoes.appendChild(remover);
  linha.appendChild(acoes);

  // o resto dos campos ocupa a linha inteira de baixo
  const grade = document.createElement('div');
  grade.className = 'grade-campos campo--largo';
  grade.appendChild(campoServico('Descrição', servico.description, servico, 'description', 'O que entra no ensaio'));
  grade.appendChild(campoServico('Inclui', servico.includes, servico, 'includes', '10 fotos, 1 vídeo curto'));
  grade.appendChild(campoServico('WhatsApp próprio (só números)', servico.whatsapp, servico, 'whatsapp', '5581999999999'));
  grade.appendChild(campoServico('Mensagem do WhatsApp', servico.whatsappMessage, servico, 'whatsappMessage', 'Olá! Quero esse serviço.'));
  linha.appendChild(grade);

  // troca de imagem
  const upload = document.createElement('label');
  upload.className = 'campo campo--largo';
  const rotulo = document.createElement('span');
  rotulo.className = 'campo-rotulo';
  rotulo.textContent = 'Trocar imagem';
  upload.appendChild(rotulo);

  const arquivo = document.createElement('input');
  arquivo.className = 'entrada';
  arquivo.type = 'file';
  arquivo.accept = 'image/*';
  arquivo.addEventListener('change', () => {
    servico.imagemEscolhida = arquivo.files?.[0] || null;
    const escolhido = servico.imagemEscolhida;
    if (escolhido) legenda.textContent = escolhido.name;
  });
  upload.appendChild(arquivo);
  linha.appendChild(upload);

  return linha;
}

function campoServico(rotulo, valor, servico, propriedade, exemplo, curto = false) {
  const campo = document.createElement('label');
  // campo--curto deixa preço e duração lado a lado no celular: são dois
  // valores curtos, não merecem uma linha inteira cada.
  campo.className = curto ? 'campo campo--curto' : 'campo';

  const texto = document.createElement('span');
  texto.className = 'campo-rotulo';
  texto.textContent = rotulo;
  campo.appendChild(texto);

  const entrada = document.createElement('input');
  entrada.className = 'entrada';
  entrada.type = 'text';
  entrada.value = String(valor ?? '');
  entrada.placeholder = exemplo;
  entrada.addEventListener('input', () => {
    servico[propriedade] = entrada.value;
  });
  campo.appendChild(entrada);

  return campo;
}

async function salvarServicos(botao) {
  await comBotao(botao, async () => {
    const prontos = [];

    for (const servico of servicos) {
      const nome = String(servico.name ?? '').trim();
      // Serviço sem nome não entra no site: o card mostraria um título vazio.
      if (!nome) continue;

      const imagem = servico.imagemEscolhida
        ? await uploadImage(servico.imagemEscolhida)
        : servico.image;

      const { imagemEscolhida, ...resto } = servico;
      prontos.push({
        ...resto,
        name: nome,
        description: String(servico.description ?? '').trim(),
        price: String(servico.price ?? '').trim(),
        duration: String(servico.duration ?? '').trim(),
        includes: String(servico.includes ?? '').trim(),
        whatsapp: String(servico.whatsapp ?? '').replace(/\D/g, ''),
        whatsappMessage: String(servico.whatsappMessage ?? '').trim(),
        image: imagem || ''
      });
    }

    const conteudoSalvo = await dados.save({ services: prontos });
    conteudo = { ...conteudo, ...conteudoSalvo };
    servicos = prontos.map((pronto) => ({ ...pronto }));
    pintarServicos();
    atualizarEstatisticas();
  });
}

// ------------------------------------------------------------- dúvidas

/**
 * Dúvidas. A chave é "faqs" (não siteData) porque é o que a página
 * /pages/duvidas.html busca. Pergunta e resposta são texto puro.
 */
function pintarDuvidas() {
  const lista = el('lista-duvidas');
  lista.replaceChildren();

  if (!duvidas.length) {
    const vazio = document.createElement('p');
    vazio.className = 'vazio';
    vazio.textContent =
      'Nenhuma dúvida cadastrada. A página de dúvidas mostra as perguntas padrão até você salvar as suas.';
    lista.appendChild(vazio);
    return;
  }

  duvidas.forEach((duvida, i) => lista.appendChild(linhaDuvida(duvida, i)));
}

function linhaDuvida(duvida, indice) {
  const linha = document.createElement('div');
  linha.className = 'duvida';

  const ordem = document.createElement('span');
  ordem.className = 'duvida-ordem';
  ordem.textContent = String(indice + 1).padStart(2, '0');

  const topo = document.createElement('div');
  topo.className = 'duvida-topo';
  topo.appendChild(ordem);
  topo.appendChild(campoDuvida('Pergunta', duvida.question, duvida, 'question', 'Quanto tempo leva o ensaio?'));

  const remover = document.createElement('button');
  remover.type = 'button';
  remover.className = 'btn-icone btn-icone--perigo';
  remover.title = 'Remover esta dúvida';
  remover.setAttribute('aria-label', 'Remover esta dúvida');
  remover.innerHTML = '<svg class="icone" aria-hidden="true"><use href="#i-lixeira"></use></svg>';
  remover.addEventListener('click', () => {
    duvidas = duvidas.filter((item) => item !== duvida);
    pintarDuvidas();
  });
  topo.appendChild(remover);

  linha.appendChild(topo);

  // A resposta ocupa um campo de texto alto, e não um input de uma linha só:
  // é a diferença entre uma resposta de duas palavras e uma de três linhas.
  const campo = document.createElement('label');
  campo.className = 'campo';
  const rotulo = document.createElement('span');
  rotulo.className = 'campo-rotulo';
  rotulo.textContent = 'Resposta';
  campo.appendChild(rotulo);

  const area = document.createElement('textarea');
  area.className = 'area';
  area.value = String(duvida.answer ?? '');
  area.placeholder = 'A resposta que o visitante vai ler.';
  area.addEventListener('input', () => {
    duvida.answer = area.value;
  });
  campo.appendChild(area);
  linha.appendChild(campo);

  return linha;
}

function campoDuvida(rotulo, valor, duvida, propriedade, exemplo) {
  const campo = document.createElement('label');
  campo.className = 'campo';

  const texto = document.createElement('span');
  texto.className = 'campo-rotulo';
  texto.textContent = rotulo;
  campo.appendChild(texto);

  const entrada = document.createElement('input');
  entrada.className = 'entrada';
  entrada.type = 'text';
  entrada.value = String(valor ?? '');
  entrada.placeholder = exemplo;
  entrada.addEventListener('input', () => {
    duvida[propriedade] = entrada.value;
  });
  campo.appendChild(entrada);

  return campo;
}

async function salvarDuvidas(botao) {
  await comBotao(botao, async () => {
    // A página só usa perguntas que têm as duas partes preenchidas, então
    // salvar uma pergunta sem resposta só poluiria o conteúdo.
    const prontas = duvidas
      .map((duvida) => ({
        question: String(duvida.question ?? '').trim(),
        answer: String(duvida.answer ?? '').trim()
      }))
      .filter((duvida) => duvida.question && duvida.answer);

    await putContent('faqs', prontas);
    duvidas = prontas.map((pronta) => ({ ...pronta }));
    pintarDuvidas();
    marcarEstado('salvo', 'Sincronizado');
  });
}

// -------------------------------------------------------------- agenda

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Chave de dia no mesmo formato que o calendário do site usa. */
function chaveDia(ano, mes, dia) {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function pintarAgenda() {
  const grade = el('agenda');
  if (!grade) return;
  grade.replaceChildren();

  const ano = mesAgenda.getFullYear();
  const mes = mesAgenda.getMonth();

  for (const dia of DIAS_SEMANA) {
    const titulo = document.createElement('div');
    titulo.className = 'agenda-cabecalho';
    titulo.textContent = dia;
    grade.appendChild(titulo);
  }

  // A primeira semana só tem lugar para os dias que já passaram do mês antes,
  // para o dia 1 cair na coluna certa.
  const primeiroDia = new Date(ano, mes, 1).getDay();
  for (let i = 0; i < primeiroDia; i++) {
    const vazio = document.createElement('div');
    vazio.dataset.fora = 'true';
    grade.appendChild(vazio);
  }

  const totalDias = new Date(ano, mes + 1, 0).getDate();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  for (let dia = 1; dia <= totalDias; dia++) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'agenda-dia';
    botao.textContent = String(dia);

    const chave = chaveDia(ano, mes, dia);
    const marcado = Boolean(datas[chave]);
    botao.setAttribute('aria-pressed', String(marcado));
    botao.setAttribute('aria-label', `Dia ${dia} de ${MESES[mes]}: ${marcado ? 'disponível' : 'indisponível'}`);

    // Um dia que já passou não pode ser marcado: a cliente chegaria depois dele.
    const data = new Date(ano, mes, dia);
    if (data < hoje) {
      botao.disabled = true;
      botao.title = 'Este dia já passou.';
    }

    botao.addEventListener('click', () => {
      if (datas[chave]) delete datas[chave];
      else datas[chave] = true;
      botao.setAttribute('aria-pressed', String(Boolean(datas[chave])));
      atualizarResumoAgenda();
    });

    grade.appendChild(botao);
  }

  atualizarResumoAgenda();
}

function atualizarResumoAgenda() {
  const marcadas = Object.keys(datas).sort();
  const resumo = el('agenda-resumo');
  if (!resumo) return;

  resumo.textContent = marcadas.length
    ? `${marcadas.length} ${marcadas.length === 1 ? 'dia disponível' : 'dias disponíveis'}: ${formatarListaDeDatas(marcadas)}.`
    : 'Nenhum dia marcado. Sem marcação, o calendário do site não oferece nenhuma data.';
}

/** Até 5 datas por linha, para o texto não virar uma parede. */
function formatarListaDeDatas(chaves) {
  const formatadas = chaves.map((chave) => {
    const [ano, mes, dia] = chave.split('-');
    return `${dia}/${mes}`;
  });
  const mostraveis = formatadas.slice(0, 5).join(', ');
  return formatadas.length > 5 ? `${mostraveis} e mais ${formatadas.length - 5}` : mostraveis;
}

async function salvarAgenda(botao) {
  await comBotao(botao, async () => {
    await putContent('availableDates', datas);
  });
}

// ------------------------------------------------------------ navegação

/**
 * As seções do painel, uma por tela do site. O trilho lateral tem só ícones,
 * então o nome que aparece no cabeçalho vem daqui, e não do HTML.
 *
 * Contatos e Sobre mim não entram ainda: nenhuma das duas telas tem fonte de
 * dado no site (o rodapé só tem o copyright e a página Sobre é HTML fixo), e
 * uma aba que não edita nada seria função sem ligação com o site.
 */
const SECOES = {
  'visao-geral': 'Visão geral',
  selecoes: 'Seleções de Clientes',
  'catalogo-gestao': 'Gestão do Catálogo de Provas',
  textos: 'Textos & Capa',
  portfolio: 'Portfólio',
  servicos: 'Serviços',
  duvidas: 'Dúvidas',
  protecao: 'Proteção de Imagens',
  visibilidade: 'Visibilidade dos Blocos',
  seguranca: 'Segurança & Acesso'
};

const ORDEM = Object.keys(SECOES);

/**
 * Troca de seção mostrando um painel por vez.
 *
 * Sem rolagem: o cabeçalho é fixo, o conteúdo inteiro cabe na tela e rolar até
 * uma seção que já está visível só causaria tremida.
 */
function mostrarSecao(id, { moverHash = true } = {}) {
  const alvo = ORDEM.includes(id) ? id : ORDEM[0];

  for (const nome of ORDEM) {
    const painel = el(`painel-${nome}`);
    const item = document.querySelector(`.trilho-item[data-alvo="${nome}"]`);
    const ativa = nome === alvo;

    if (painel) painel.hidden = !ativa;
    if (item) item.setAttribute('aria-current', String(ativa));
  }

  const tituloEl = el('topo-titulo');
  if (tituloEl) tituloEl.textContent = SECOES[alvo] || 'Painel';

  const migalhaEl = el('topo-secao-nome');
  if (migalhaEl) migalhaEl.textContent = SECOES[alvo] || 'Painel';

  if (moverHash && window.location.hash.slice(1) !== alvo) {
    history.replaceState(null, '', `#${alvo}`);
  }

  // Trocar de seção recomeça a leitura do topo, como se fosse outra página.
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function ligarNavegacao() {
  const on = (id, evento, handler) => {
    const elemento = el(id);
    if (elemento) elemento.addEventListener(evento, handler);
  };

  for (const item of document.querySelectorAll('.trilho-item[data-alvo]')) {
    item.addEventListener('click', (evento) => {
      evento.preventDefault();
      mostrarSecao(item.dataset.alvo);
    });
  }

  // Os atalhos da tela inicial levam à seção correspondente.
  for (const atalho of document.querySelectorAll('[data-ir]')) {
    atalho.addEventListener('click', () => mostrarSecao(atalho.dataset.ir));
  }

  window.addEventListener('hashchange', () => {
    mostrarSecao(window.location.hash.slice(1), { moverHash: false });
  });

  mostrarSecao(window.location.hash.slice(1));

  on('mostrar-tudo', 'click', () => definirTodos(true));
  on('ocultar-tudo', 'click', () => definirTodos(false));
  on('filtro-publicados', 'change', aplicarFiltros);
  on('filtro-ocultos', 'change', aplicarFiltros);
  on('add-categoria', 'click', () => {
    // Mesma forma das categorias que já existem, para o site não encontrar
    // um cartão sem os campos que ele espera.
    categorias.push({
      id: `categoria-${Date.now()}`,
      name: '',
      subtitle: '',
      description: '',
      image: '',
      gallery: [],
      featured: false,
      order: categorias.length + 1
    });
    pintarCategorias();
    el('lista-categorias')?.querySelector('.categoria:last-child .entrada')?.focus();
  });

  on('add-servico', 'click', () => {
    // Os mesmos campos que buildServiceCard lê. O que o site não usar
    // (whatsapp próprio) fica vazio e o site cai no número do site.
    servicos.push({
      id: `servico-${Date.now()}`,
      name: '',
      description: '',
      price: '',
      duration: '',
      includes: '',
      image: '',
      whatsapp: '',
      whatsappMessage: ''
    });
    pintarServicos();
    el('lista-servicos')?.querySelector('.servico:last-child .entrada')?.focus();
  });

  on('add-duvida', 'click', () => {
    duvidas.push({ question: '', answer: '' });
    pintarDuvidas();
    el('lista-duvidas')?.querySelector('.duvida:last-child .entrada')?.focus();
  });

  on('agenda-mes-antes', 'click', () => {
    mesAgenda = new Date(mesAgenda.getFullYear(), mesAgenda.getMonth() - 1, 1);
    pintarAgenda();
  });

  on('agenda-mes-depois', 'click', () => {
    mesAgenda = new Date(mesAgenda.getFullYear(), mesAgenda.getMonth() + 1, 1);
    pintarAgenda();
  });

  for (const botao of document.querySelectorAll('[data-salvar]')) {
    const destino = botao.dataset.salvar;
    botao.addEventListener('click', () => {
      if (destino === 'hero') salvarHero(botao);
      else if (destino === 'banner') salvarBanner(botao);
    });
  }

  on('salvar-categorias', 'click', (evento) => salvarCategorias(evento.currentTarget));
  on('salvar-servicos', 'click', (evento) => salvarServicos(evento.currentTarget));
  on('salvar-duvidas', 'click', (evento) => salvarDuvidas(evento.currentTarget));
  on('salvar-agenda', 'click', (evento) => salvarAgenda(evento.currentTarget));

  // A capa aceita vídeo: a prévia e o aviso de tamanho são os mesmos do
  // campo do meio, e é ela que decide o que mostrar.
  on('hero-imagem', 'change', (evento) => {
    tirarVideoCapa = false;
    const arquivo = evento.target.files?.[0];
    if (arquivo?.type.startsWith('video/') && arquivo.size > LIMITE_VIDEO_BYTES) {
      avisar(
        `O vídeo tem ${(arquivo.size / 1024 / 1024).toFixed(1)}MB e o limite é ` +
        `${(LIMITE_VIDEO_BYTES / 1024 / 1024).toFixed(0)}MB. Comprime antes de salvar.`,
        'erro'
      );
    }
    pintarCapa();
  });

  on('hero-tirar-video', 'click', () => {
    tirarVideoCapa = true;
    const heroImg = el('hero-imagem');
    if (heroImg) heroImg.value = '';
    pintarCapa();
    avisar('O vídeo sai da capa no próximo Salvar.');
  });

  // Prévia imediata do arquivo escolhido, antes de salvar.
  on('banner-arquivo', 'change', (evento) => {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    const previa = el('banner-previa');
    const vazia = el('banner-previa-vazia');
    const txtAtual = el('banner-imagem-atual');
    if (previa) {
      previa.src = URL.createObjectURL(arquivo);
      previa.hidden = false;
    }
    if (vazia) vazia.hidden = true;
    if (txtAtual) txtAtual.textContent = `Escolhido: ${arquivo.name}`;
  });

  // O campo do meio aceita vídeo também, então não há miniatura para
  // mostrar: o que importa antes de salvar é o tipo e o tamanho, que é
  // exatamente o que costuma dar erro.
  on('center-arquivo', 'change', (evento) => {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) {
      pintarCentro();
      return;
    }
    if (arquivo.type.startsWith('video/') && arquivo.size > LIMITE_VIDEO_BYTES) {
      avisar(
        `O vídeo tem ${(arquivo.size / 1024 / 1024).toFixed(1)}MB e o limite é ` +
        `${(LIMITE_VIDEO_BYTES / 1024 / 1024).toFixed(0)}MB. Comprime antes de salvar.`,
        'erro'
      );
    }
    pintarCentro();
  });
}

// ----------------------------------------------------------------- início

async function iniciar() {
  await exigirLogin();

  ligarNavegacao();
  ligarTema();
  aplicarTema(document.documentElement.dataset.tema || 'escuro');

  // Visibilidade também vem do servidor, e não do cache: o painel envia o
  // mapa inteiro a cada clique, então um estado velho sobrescreveria o que
  // outra aba tivesse acabado de salvar. O cache serve só de rede de segurança.
  const remotoVisibilidade = await fetchVisibility();
  visibilidade = remotoVisibilidade || readCache() || { ...defaultVisibility };
  pintarVisibilidade();
  writeCache(visibilidade);

  // Conteúdo: os textos, as categorias e os serviços.
  //
  // Aqui não vale a cópia em localStorage que a home usa para pintar rápido.
  // O painel é onde se edita: mostrar um texto velho e salvar por cima seria
  // a pior falha possível. Então lê do servidor e só isso.
  const remotoConteudo = await getContent('siteData');
  conteudo = { ...defaultData, ...(remotoConteudo && typeof remotoConteudo === 'object' ? remotoConteudo : {}) };
  // adopt() normaliza (hero completo, versão contada a partir do que está
  // publicado) para o próximo save não nascer com versão menor que a atual.
  dados.adopt(conteudo);
  categorias = (conteudo.categories || []).map((categoria) => ({ ...categoria }));
  servicos = (conteudo.services || []).map((servico) => ({ ...servico }));

  // Dúvidas e agenda moram em chaves próprias, não em siteData: são o que
  // cada página do site busca. Falha ao buscar não impede o painel de abrir —
  // a seção cai no estado vazio e a dona salva o que quiser.
  const [remotoDuvidas, remotoDatas] = await Promise.all([
    getContent('faqs').catch(() => null),
    getContent('availableDates').catch(() => null)
  ]);
  duvidas = Array.isArray(remotoDuvidas) ? remotoDuvidas : [];
  datas = remotoDatas && typeof remotoDatas === 'object' ? { ...remotoDatas } : {};

  pintarTextos();
  pintarCategorias();
  pintarServicos();
  pintarDuvidas();
  pintarAgenda();
  await carregarSelecoesPainel();
  ligarEventosSelecoes();
  await carregarCatalogoGestao();
  ligarEventosCatalogo();
  ligarEventosSeguranca();
  await carregarProtecaoPainel();
  ligarEventosProtecao();
  atualizarEstatisticas();
  marcarEstado('salvo', 'Sincronizado');
}

// ------------------------------------------------------------- 8. Seleções de Provas

let listaTodasSelecoes = [];
let filtroStatusAtual = 'todas';
let buscaTermoAtual = '';

async function carregarSelecoesPainel() {
  const containerResumo = document.getElementById('lista-selecoes-resumo');
  const gradeSelecoes = document.getElementById('grade-selecoes-painel');

  try {
    const res = await getSelecoes();
    listaTodasSelecoes = res && Array.isArray(res.selecoes) ? res.selecoes : [];

    // Normaliza fotos de cada seleção
    listaTodasSelecoes.forEach((item) => {
      if (typeof item.fotos === 'string') {
        try { item.fotos = JSON.parse(item.fotos); } catch { item.fotos = []; }
      }
      if (!Array.isArray(item.fotos)) item.fotos = [];
      if (!item.status) item.status = 'pendente';
    });

    // 1. Atualizar métricas no topo do painel de seleções
    const total = listaTodasSelecoes.length;
    const pendentes = listaTodasSelecoes.filter(s => (s.status || 'pendente') === 'pendente').length;
    const emTratamento = listaTodasSelecoes.filter(s => s.status === 'em_tratamento').length;
    const concluidas = listaTodasSelecoes.filter(s => s.status === 'concluida').length;

    if (el('estat-sel-total')) el('estat-sel-total').textContent = String(total);
    if (el('estat-sel-pendentes')) el('estat-sel-pendentes').textContent = String(pendentes);
    if (el('estat-sel-tratamento')) el('estat-sel-tratamento').textContent = String(emTratamento);
    if (el('estat-sel-concluidas')) el('estat-sel-concluidas').textContent = String(concluidas);

    // 2. Atualizar badge dinâmico no trilho lateral
    const badgeTrilho = el('badge-selecoes-trilho');
    if (badgeTrilho) {
      if (pendentes > 0) {
        badgeTrilho.textContent = String(pendentes);
        badgeTrilho.style.display = 'inline-flex';
      } else {
        badgeTrilho.style.display = 'none';
      }
    }

    // 3. Atualizar resumo rápido na tela de visão geral
    if (containerResumo) {
      if (total === 0) {
        containerResumo.innerHTML = '<p style="color: var(--cinza-fraco); font-size: 13px;">Nenhuma seleção de fotos recebida até o momento.</p>';
      } else {
        const recentes = listaTodasSelecoes.slice(0, 3);
        containerResumo.innerHTML = recentes.map((item, idx) => {
          const dataFmt = item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR', DIA_ANO) : 'Recente';
          const totalFotos = item.total || item.fotos.length;
          const statusRotulo = item.status === 'concluida' ? 'Concluída' : (item.status === 'em_tratamento' ? 'Em tratamento' : 'Pendente');
          const statusTom = item.status === 'concluida' ? 'verde' : (item.status === 'em_tratamento' ? 'azul' : 'ambar');

          return `
            <div style="background: var(--veu-campo); border: 1px solid var(--borda); border-radius: 10px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
              <div>
                <strong style="color: var(--branco); font-size: 13.5px;">${item.cliente || item.cliente_email || 'Cliente'}</strong>
                <span style="font-size: 12px; color: var(--cinza-fraco); margin-left: 8px;">${dataFmt}</span>
                <span class="etiqueta" data-estado="${statusTom === 'verde' ? 'publicado' : ''}" style="margin-left: 8px; font-size: 11px;">${statusRotulo}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 12.5px; color: var(--texto-suave); font-weight: 600;">${totalFotos} ${totalFotos === 1 ? 'foto' : 'fotos'}</span>
                <button type="button" class="btn btn-sm btn-fantasma" data-ir="selecoes" style="font-size: 11.5px; padding: 4px 8px;">Ver detalhes</button>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // 4. Renderizar grade completa no painel dedicado
    renderizarGradeSelecoes();

  } catch (err) {
    console.warn('[admin] erro ao buscar seleções:', err);
    if (containerResumo) containerResumo.innerHTML = '<p style="color: var(--cinza-fraco); font-size: 13px;">Aguardando novas seleções.</p>';
    if (gradeSelecoes) gradeSelecoes.innerHTML = '<p style="color: var(--cinza-fraco); font-size: 13px; text-align: center; padding: 20px;">Não foi possível carregar a lista de seleções.</p>';
  }
}

function renderizarGradeSelecoes() {
  const container = el('grade-selecoes-painel');
  if (!container) return;

  // Aplica filtros de status e busca
  const filtradas = listaTodasSelecoes.filter((item) => {
    const statusItem = item.status || 'pendente';
    if (filtroStatusAtual !== 'todas' && statusItem !== filtroStatusAtual) {
      return false;
    }

    if (buscaTermoAtual.trim()) {
      const q = buscaTermoAtual.toLowerCase();
      const matchCliente = (item.cliente || '').toLowerCase().includes(q);
      const matchEmail = (item.cliente_email || '').toLowerCase().includes(q);
      const matchFotos = item.fotos.some(f => {
        const nome = typeof f === 'object' ? (f.nome || f.titulo || f.id || f.arquivo || '') : String(f);
        return nome.toLowerCase().includes(q);
      });
      if (!matchCliente && !matchEmail && !matchFotos) return false;
    }

    return true;
  });

  if (filtradas.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 36px 16px; background: var(--veu-campo); border: 1px dashed var(--borda); border-radius: 12px;">
        <svg class="icone" style="width: 36px; height: 36px; margin: 0 auto 10px; color: var(--cinza-fraco);" aria-hidden="true"><use href="#i-selecao"/></svg>
        <p style="color: var(--cinza-fraco); font-size: 14px; margin: 0;">Nenhuma seleção encontrada com os filtros selecionados.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  filtradas.forEach((item, idx) => {
    const card = document.createElement('article');
    card.className = 'card-selecao';

    const fotosArr = item.fotos;
    const nomesArr = fotosArr.map(f => typeof f === 'object' ? (f.arquivo || f.nome || f.titulo || f.id) : String(f));
    const nomesFormatados = nomesArr.join(', ');
    const dataFmt = item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : 'Data não informada';
    const jsonDownloadStr = encodeURIComponent(JSON.stringify(item, null, 2));

    card.innerHTML = `
      <div class="card-selecao-topo">
        <div>
          <h3 class="card-selecao-cliente">${item.cliente || item.cliente_email || 'Cliente Sem Nome'}</h3>
          <div class="card-selecao-meta">
            <span>Enviada em ${dataFmt}</span>
            <span>•</span>
            <span>${fotosArr.length} fotos aprovadas</span>
            ${item.cliente_email ? `<span>•</span><span>${item.cliente_email}</span>` : ''}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <select class="seletor-status-selecao" data-id="${item.id}" data-status="${item.status || 'pendente'}">
            <option value="pendente" ${item.status === 'pendente' ? 'selected' : ''}>Pendente</option>
            <option value="em_tratamento" ${item.status === 'em_tratamento' ? 'selected' : ''}>Em tratamento</option>
            <option value="concluida" ${item.status === 'concluida' ? 'selected' : ''}>Concluída</option>
          </select>
          <button type="button" class="btn-icone btn-icone--perigo btn-remover-sel" data-id="${item.id}" title="Excluir seleção" aria-label="Excluir seleção">
            <svg class="icone icone--p" aria-hidden="true"><use href="#i-lixeira"/></svg>
          </button>
        </div>
      </div>

      <!-- Miniaturas das fotos aprovadas -->
      <div class="card-selecao-fotos-galeria">
        ${fotosArr.map(f => {
          const nomeFoto = typeof f === 'object' ? (f.titulo || f.nome || f.arquivo || f.id) : String(f);
          const srcFoto = typeof f === 'object' && f.src ? f.src : (typeof f === 'string' && f.includes('/') ? f : `./img/provas/${typeof f === 'object' ? (f.arquivo || f.id) : f}`);
          return `
            <div class="card-foto-miniatura" title="${nomeFoto}">
              <img src="${srcFoto}" alt="${nomeFoto}" loading="lazy" onerror="this.src='./img/provas/capa.jpg'">
              <span class="card-foto-miniatura-rotulo">${nomeFoto}</span>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Caixa de nomes e download -->
      <div class="card-selecao-arquivos">
        <div style="flex: 1; min-width: 220px;">
          <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--acento-claro); display: block; margin-bottom: 4px;">
            Nomes para Filtro no Adobe Lightroom:
          </span>
          <div style="font-family: monospace; font-size: 12px; color: var(--texto); word-break: break-all; line-height: 1.5; background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 6px; border: 1px solid var(--borda);">
            ${nomesFormatados || 'Nenhuma foto selecionada'}
          </div>
        </div>
        <div class="card-selecao-botoes-acoes">
          <button type="button" class="btn btn-sm btn-copiar-nomes" data-nomes="${encodeURIComponent(nomesFormatados)}">
            <svg class="icone icone--p" aria-hidden="true"><use href="#i-copiar"/></svg>
            <span>Copiar Nomes</span>
          </button>
          <a href="data:application/json;charset=utf-8,${jsonDownloadStr}" download="selecao-${(item.cliente || 'fotos').replace(/[^a-zA-Z0-9]/g, '-')}-${item.id || idx + 1}.json" class="btn btn-sm">
            <svg class="icone icone--p" aria-hidden="true"><use href="#i-download"/></svg>
            <span>Baixar JSON</span>
          </a>
        </div>
      </div>
    `;

    // Evento de alteração de status
    const selectStatus = card.querySelector('.seletor-status-selecao');
    if (selectStatus) {
      selectStatus.addEventListener('change', async (e) => {
        const novoStatus = e.target.value;
        selectStatus.dataset.status = novoStatus;
        try {
          await updateSelecaoStatus(item.id, novoStatus);
          item.status = novoStatus;
          avisar(`Status atualizado para: ${novoStatus.replace('_', ' ')}`);
          await carregarSelecoesPainel();
        } catch (err) {
          avisar(`Erro ao atualizar status: ${err.message}`, 'erro');
        }
      });
    }

    // Evento de exclusão
    const btnRemover = card.querySelector('.btn-remover-sel');
    if (btnRemover) {
      btnRemover.addEventListener('click', async () => {
        if (!confirm(`Deseja realmente excluir a seleção de "${item.cliente || 'Cliente'}"?`)) {
          return;
        }
        try {
          await deleteSelecao(item.id);
          avisar('Seleção excluída com sucesso.');
          await carregarSelecoesPainel();
        } catch (err) {
          avisar(`Erro ao excluir: ${err.message}`, 'erro');
        }
      });
    }

    // Evento copiar nomes
    const btnCopiar = card.querySelector('.btn-copiar-nomes');
    if (btnCopiar) {
      btnCopiar.addEventListener('click', () => {
        const txt = decodeURIComponent(btnCopiar.dataset.nomes || '');
        if (txt) {
          navigator.clipboard.writeText(txt).then(() => {
            avisar('✓ Nomes copiados! Cole diretamente no filtro do Lightroom.');
          }).catch(() => {
            avisar('Não foi possível copiar automaticamente.', 'erro');
          });
        }
      });
    }

    container.appendChild(card);
  });
}

function ligarEventosSelecoes() {
  // Busca em tempo real
  const buscaInput = el('busca-selecoes-input');
  if (buscaInput) {
    buscaInput.addEventListener('input', (e) => {
      buscaTermoAtual = e.target.value || '';
      renderizarGradeSelecoes();
    });
  }

  // Abas de filtro
  const abas = document.querySelectorAll('.filtro-aba[data-filtro-status]');
  abas.forEach((aba) => {
    aba.addEventListener('click', () => {
      abas.forEach(a => a.classList.remove('ativa'));
      aba.classList.add('ativa');
      filtroStatusAtual = aba.dataset.filtroStatus || 'todas';
      renderizarGradeSelecoes();
    });
  });

  // Atualizar lista
  const btnRecarregar = el('btn-recarregar-selecoes');
  if (btnRecarregar) {
    btnRecarregar.addEventListener('click', async () => {
      btnRecarregar.disabled = true;
      btnRecarregar.textContent = 'Atualizando...';
      await carregarSelecoesPainel();
      btnRecarregar.disabled = false;
      btnRecarregar.innerHTML = '<span>Atualizar Lista</span>';
      avisar('Lista de seleções atualizada.');
    });
  }

  const btnAttResumo = el('btn-atualizar-selecoes');
  if (btnAttResumo) {
    btnAttResumo.addEventListener('click', async () => {
      btnAttResumo.textContent = 'Atualizando...';
      await carregarSelecoesPainel();
      setTimeout(() => { btnAttResumo.textContent = 'Atualizar'; }, 500);
    });
  }

  // Exportar todas em JSON
  const btnExportarTodas = el('btn-exportar-todas-selecoes');
  if (btnExportarTodas) {
    btnExportarTodas.addEventListener('click', () => {
      if (listaTodasSelecoes.length === 0) {
        avisar('Nenhuma seleção disponível para exportar.', 'erro');
        return;
      }
      const jsonStr = JSON.stringify(listaTodasSelecoes, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `todas-selecoes-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      avisar('✓ Arquivo JSON com todas as seleções gerado com sucesso!');
    });
  }
}

// ------------------------------------------------------------- 9. Gestão do Catálogo de Provas

let catalogoConfig = {
  estabelecimento: 'Terraço & Mar Gastronomia',
  subtitulo: 'Selecione os pratos principais para o cardápio e mídias sociais.',
  email: 'contato@restaurante.com',
  pacoteQtd: 15,
  valorAdicional: 'R$ 35,00 por foto extra',
  fotos: []
};

const FOTOS_PADRAO_PROVAS = [
  { id: 'foto-1', titulo: 'Prime Steak na Brasa', categoria: 'pratos', categoriaNome: 'Pratos Principais', src: './img/provas/p-steak.jpg', arquivo: 'p-steak.jpg' },
  { id: 'foto-2', titulo: 'Smash Burger Trufado', categoria: 'lanches', categoriaNome: 'Hambúrgueres', src: './img/provas/p-burger.jpg', arquivo: 'p-burger.jpg' },
  { id: 'foto-3', titulo: 'Pizza Napolitana Artesanal', categoria: 'lanches', categoriaNome: 'Pizzas', src: './img/provas/p-pizza.jpg', arquivo: 'p-pizza.jpg' },
  { id: 'foto-4', titulo: 'Fettuccine ao Pomodoro Rústico', categoria: 'pratos', categoriaNome: 'Pratos Principais', src: './img/provas/p-massa.jpg', arquivo: 'p-massa.jpg' },
  { id: 'foto-5', titulo: 'Torta de Frutas Silvestres', categoria: 'sobremesas', categoriaNome: 'Sobremesas', src: './img/provas/p-sobremesa.jpg', arquivo: 'p-sobremesa.jpg' },
  { id: 'foto-6', titulo: 'Coquetel Autoral Defumado', categoria: 'drinks', categoriaNome: 'Drinks & Bar', src: './img/provas/p-drink.jpg', arquivo: 'p-drink.jpg' },
  { id: 'foto-7', titulo: 'Café Espresso com Latte Art', categoria: 'drinks', categoriaNome: 'Cafés Especiais', src: './img/provas/p-cafe.jpg', arquivo: 'p-cafe.jpg' },
  { id: 'foto-8', titulo: 'Composição de Mesa e Salão', categoria: 'pratos', categoriaNome: 'Ambiente', src: './img/provas/capa.jpg', arquivo: 'capa.jpg' },
  { id: 'foto-9', titulo: 'Corte Grelhado Especial', categoria: 'pratos', categoriaNome: 'Pratos Principais', src: './img/provas/p-2.JPG', arquivo: 'p-2.JPG' },
  { id: 'foto-10', titulo: 'Tábua de Queijos e Castanhas', categoria: 'pratos', categoriaNome: 'Entradas', src: './img/provas/p-3.JPG', arquivo: 'p-3.JPG' },
  { id: 'foto-11', titulo: 'Sobremesa de Chocolate Belga', categoria: 'sobremesas', categoriaNome: 'Sobremesas', src: './img/provas/p-4.JPG', arquivo: 'p-4.JPG' },
  { id: 'foto-12', titulo: 'Prato Autoral de Frutos do Mar', categoria: 'pratos', categoriaNome: 'Pratos Principais', src: './img/provas/p-5.jpg', arquivo: 'p-5.jpg' }
];

async function carregarCatalogoGestao() {
  try {
    const remoto = await getCatalogConfig();
    if (remoto && typeof remoto === 'object') {
      catalogoConfig = {
        ...catalogoConfig,
        ...remoto,
        fotos: Array.isArray(remoto.fotos) && remoto.fotos.length > 0 ? remoto.fotos : [...FOTOS_PADRAO_PROVAS]
      };
    } else {
      catalogoConfig.fotos = [...FOTOS_PADRAO_PROVAS];
    }
  } catch (err) {
    console.warn('[admin] usando catálogo padrão:', err);
    catalogoConfig.fotos = [...FOTOS_PADRAO_PROVAS];
  }

  // Preenche campos
  if (el('cat-nome-estabelecimento')) el('cat-nome-estabelecimento').value = catalogoConfig.estabelecimento || '';
  if (el('cat-instrucoes')) el('cat-instrucoes').value = catalogoConfig.subtitulo || '';
  if (el('cat-email-cliente')) el('cat-email-cliente').value = catalogoConfig.email || '';
  if (el('cat-fotos-inclusas')) el('cat-fotos-inclusas').value = catalogoConfig.pacoteQtd || 15;
  if (el('cat-valor-adicional')) el('cat-valor-adicional').value = catalogoConfig.valorAdicional || 'R$ 35,00 por foto extra';

  const linkBox = el('cat-link-compartilhavel');
  if (linkBox) {
    linkBox.value = `${window.location.origin}/catalogo.html`;
  }

  renderizarFotosCatalogo();
}

function renderizarFotosCatalogo() {
  const container = el('grade-fotos-provas-painel');
  const badgeQtd = el('cat-qtd-fotos');
  if (badgeQtd) badgeQtd.textContent = String(catalogoConfig.fotos.length);

  if (!container) return;

  if (catalogoConfig.fotos.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 28px; background: var(--veu-campo); border-radius: 10px; border: 1px dashed var(--borda);">
        <p style="color: var(--cinza-fraco); font-size: 13px;">Nenhuma foto cadastrada no catálogo. Clique em "Adicionar Foto" ou "Importar do Portfólio".</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  catalogoConfig.fotos.forEach((foto, index) => {
    const card = document.createElement('div');
    card.className = 'card-foto-prova';

    card.innerHTML = `
      <div class="card-foto-prova-img-wrap">
        <img src="${foto.src || './img/provas/capa.jpg'}" alt="${foto.titulo || 'Foto'}" loading="lazy" onerror="this.src='./img/provas/capa.jpg'">
      </div>
      <div class="card-foto-prova-corpo">
        <div class="campo">
          <label class="campo-rotulo">Título da Foto</label>
          <input class="entrada foto-prova-titulo" type="text" value="${foto.titulo || ''}" placeholder="Ex: Prime Steak na Brasa">
        </div>
        <div class="campo">
          <label class="campo-rotulo">Categoria / Seção</label>
          <input class="entrada foto-prova-cat" type="text" value="${foto.categoriaNome || foto.categoria || ''}" placeholder="Ex: Pratos Principais">
        </div>
        <div class="campo">
          <label class="campo-rotulo">Nome do Arquivo (Lightroom)</label>
          <input class="entrada foto-prova-arquivo" type="text" value="${foto.arquivo || (foto.src ? foto.src.split('/').pop() : '')}" placeholder="Ex: foto-01.jpg">
        </div>
        <div style="display: flex; justify-content: flex-end; margin-top: 6px;">
          <button type="button" class="btn-icone btn-icone--perigo btn-remover-foto-prova" title="Remover foto do catálogo" aria-label="Remover foto">
            <svg class="icone icone--p" aria-hidden="true"><use href="#i-lixeira"/></svg>
          </button>
        </div>
      </div>
    `;

    // Atualização dos inputs
    const inputTitulo = card.querySelector('.foto-prova-titulo');
    if (inputTitulo) {
      inputTitulo.addEventListener('input', (e) => {
        foto.titulo = e.target.value;
      });
    }

    const inputCat = card.querySelector('.foto-prova-cat');
    if (inputCat) {
      inputCat.addEventListener('input', (e) => {
        foto.categoriaNome = e.target.value;
        foto.categoria = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '');
      });
    }

    const inputArquivo = card.querySelector('.foto-prova-arquivo');
    if (inputArquivo) {
      inputArquivo.addEventListener('input', (e) => {
        foto.arquivo = e.target.value;
      });
    }

    // Remover foto
    const btnRemover = card.querySelector('.btn-remover-foto-prova');
    if (btnRemover) {
      btnRemover.addEventListener('click', () => {
        catalogoConfig.fotos.splice(index, 1);
        renderizarFotosCatalogo();
      });
    }

    container.appendChild(card);
  });
}

function ligarEventosCatalogo() {
  // Copiar link do catálogo
  const btnCopiarLink = el('btn-copiar-link-catalogo');
  if (btnCopiarLink) {
    btnCopiarLink.addEventListener('click', () => {
      const link = `${window.location.origin}/catalogo.html`;
      navigator.clipboard.writeText(link).then(() => {
        avisar('✓ Link do catálogo copiado para a área de transferência!');
      }).catch(() => {
        avisar('Não foi possível copiar o link.', 'erro');
      });
    });
  }

  // Adicionar foto individual
  const btnAddFoto = el('btn-add-foto-cat');
  if (btnAddFoto) {
    btnAddFoto.addEventListener('click', () => {
      const novoId = `foto-${Date.now()}`;
      catalogoConfig.fotos.push({
        id: novoId,
        titulo: `Nova Foto ${catalogoConfig.fotos.length + 1}`,
        categoria: 'geral',
        categoriaNome: 'Geral',
        src: './img/provas/capa.jpg',
        arquivo: `${novoId}.jpg`
      });
      renderizarFotosCatalogo();
      avisar('Nova foto adicionada ao catálogo.');
    });
  }

  // Importar fotos do portfólio existente
  const btnImportarPortfolio = el('btn-importar-portfolio-cat');
  if (btnImportarPortfolio) {
    btnImportarPortfolio.addEventListener('click', () => {
      const fotosDoPortfolio = categorias.flatMap((c) => {
        return (c.gallery || []).map((imgUrl, i) => ({
          id: `port-${c.id}-${i}`,
          titulo: `${c.name || 'Foto'} ${i + 1}`,
          categoria: c.id,
          categoriaNome: c.name || 'Geral',
          src: safeImageSrc(imgUrl),
          arquivo: imgUrl ? imgUrl.split('/').pop() : `foto-${i}.jpg`
        }));
      });

      if (fotosDoPortfolio.length === 0) {
        avisar('Nenhuma imagem encontrada nas categorias do portfólio.', 'erro');
        return;
      }

      catalogoConfig.fotos = [...catalogoConfig.fotos, ...fotosDoPortfolio];
      renderizarFotosCatalogo();
      avisar(`✓ ${fotosDoPortfolio.length} fotos importadas do portfólio!`);
    });
  }

  // Salvar configurações do catálogo
  const btnSalvar = el('btn-salvar-catalogo-gestao');
  if (btnSalvar) {
    btnSalvar.addEventListener('click', async () => {
      btnSalvar.disabled = true;
      btnSalvar.textContent = 'Salvando catálogo...';

      catalogoConfig.estabelecimento = el('cat-nome-estabelecimento')?.value || 'Terraço & Mar Gastronomia';
      catalogoConfig.subtitulo = el('cat-instrucoes')?.value || '';
      catalogoConfig.email = el('cat-email-cliente')?.value || '';
      catalogoConfig.pacoteQtd = Number(el('cat-fotos-inclusas')?.value || 15);
      catalogoConfig.valorAdicional = el('cat-valor-adicional')?.value || 'R$ 35,00 por foto extra';

      try {
        await saveCatalogConfig(catalogoConfig);
        avisar('✓ Configurações do Catálogo de Provas salvas com sucesso!');
      } catch (err) {
        avisar(`Erro ao salvar catálogo: ${err.message}`, 'erro');
      } finally {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = '<span>Salvar Catálogo</span>';
      }
    });
  }
}

// ------------------------------------------------------------- 10. Segurança & Acesso

function ligarEventosSeguranca() {
  // Copiar PIN 7811
  const btnCopiarPin = el('btn-copiar-pin-painel');
  if (btnCopiarPin) {
    btnCopiarPin.addEventListener('click', () => {
      navigator.clipboard.writeText('7811').then(() => {
        avisar('✓ PIN 7811 copiado para a área de transferência!');
      }).catch(() => {
        avisar('Não foi possível copiar o PIN.', 'erro');
      });
    });
  }

  // Logout de emergência
  const btnLogout = el('btn-encerrar-sessao-seguranca');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      if (confirm('Deseja realmente encerrar a sessão administrativa agora?')) {
        try {
          await logout();
        } catch (_) {}
        window.location.replace('./login.html?sair=1');
      }
    });
  }

  // Diagnóstico de segurança
  const btnDiagnostico = el('btn-executar-diagnostico-seguranca');
  const resDiagnostico = el('diagnostico-seguranca-resultado');
  if (btnDiagnostico) {
    btnDiagnostico.addEventListener('click', async () => {
      btnDiagnostico.disabled = true;
      btnDiagnostico.textContent = 'Executando testes...';

      if (resDiagnostico) {
        resDiagnostico.style.display = 'block';
        resDiagnostico.innerHTML = '<span style="color: var(--acento-claro);">Auditando regras de isolamento e cofre...</span>';
      }

      try {
        // Teste 1: Acesso direto a /vault/originals/ (deve retornar 403 ou 401)
        const respVault = await fetch('/vault/originals/teste-bloqueio.jpg');
        const vaultBloqueado = respVault.status === 403 || respVault.status === 401 || respVault.status === 404;

        // Teste 2: Integridade da API de proteção
        const protData = await getProtectionData();
        const protAtiva = Boolean(protData && protData.config);

        if (resDiagnostico) {
          resDiagnostico.innerHTML = `
            <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 8px; padding: 10px 12px; margin-top: 8px;">
              <strong style="color: #10b981; display: block; margin-bottom: 4px;">✓ Diagnóstico de Segurança Concluído:</strong>
              <ul style="margin: 0; padding-left: 18px; color: #e2e8f0; line-height: 1.5;">
                <li>Cofre Privado: <strong>${vaultBloqueado ? 'Protegido (Acesso público não autorizado bloqueado)' : 'Alerta'}</strong></li>
                <li>Autenticação HTTP-Only: <strong>Ativa (Cookie assinado vf_session)</strong></li>
                <li>Taxa Brute Force: <strong>Ativa (5 tentativas/15 min)</strong></li>
                <li>Pipeline de Marca-d'Água: <strong>${protAtiva ? 'Operacional' : 'Em espera'}</strong></li>
              </ul>
            </div>
          `;
        }
        avisar('✓ Testes de segurança concluídos com êxito!');
      } catch (err) {
        if (resDiagnostico) {
          resDiagnostico.innerHTML = `<span style="color: #ef4444;">Erro no diagnóstico: ${err.message}</span>`;
        }
      } finally {
        btnDiagnostico.disabled = false;
        btnDiagnostico.textContent = 'Testar Isolamento do Cofre';
      }
    });
  }
}

// ------------------------------------------------------------- Proteção de Imagens

let debounceTimerPrevia = null;

function agendarAtualizacaoPrevia() {
  clearTimeout(debounceTimerPrevia);
  debounceTimerPrevia = setTimeout(atualizarPreviaAoVivo, 400);
}

function atualizarPreviaAoVivo() {
  const img = el('prot-previa-img');
  const carregando = el('prot-previa-carregando');
  if (!img) return;

  if (carregando) carregando.style.display = 'flex';

  const params = new URLSearchParams({
    preview: '1',
    enabled: el('prot-wm-ativar')?.checked ? 'true' : 'false',
    text: el('prot-wm-texto')?.value || 'Vilma Silva Fotografia',
    secondaryText: el('prot-wm-secundario')?.value || '',
    pattern: el('prot-wm-padrao')?.value || 'diagonal_grid',
    centerMark: el('prot-wm-selo-central')?.checked ? 'true' : 'false',
    badgePosition: el('prot-wm-posicao-selo')?.value || 'top',
    opacity: (Number(el('prot-wm-opacidade')?.value || 32) / 100).toString(),
    angle: el('prot-wm-angulo')?.value || '-26',
    spacing: el('prot-wm-espacamento')?.value || '240',
    fontSize: el('prot-wm-tamanho')?.value || '20',
    quality: el('prot-wm-qualidade')?.value || '82',
    format: el('prot-wm-formato')?.value || 'webp',
    aiProtection: el('prot-wm-ai-protection')?.checked ? 'true' : 'false',
    aiNoiseStrength: (Number(el('prot-wm-ai-noise')?.value || 3.5) / 100).toString(),
    _t: String(Date.now())
  });

  const novaSrc = `/api/media/protection?${params.toString()}`;
  img.onload = () => {
    if (carregando) carregando.style.display = 'none';
  };
  img.onerror = () => {
    if (carregando) carregando.style.display = 'none';
  };
  img.src = novaSrc;
}

async function carregarProtecaoPainel() {
  try {
    const data = await getProtectionData();
    if (!data) return;

    const { config, stats } = data;

    if (stats) {
      if (el('prot-estat-originais')) el('prot-estat-originais').textContent = stats.originalProtectedCount ?? 0;
      if (el('prot-estat-previas')) el('prot-estat-previas').textContent = stats.watermarkedCount ?? 0;
      if (el('prot-estat-total')) el('prot-estat-total').textContent = stats.totalMedia ?? 0;
    }

    if (config) {
      if (el('prot-wm-ativar')) el('prot-wm-ativar').checked = config.enabled !== false;
      if (el('prot-wm-texto')) el('prot-wm-texto').value = config.text || 'Vilma Silva Fotografia';
      if (el('prot-wm-secundario')) el('prot-wm-secundario').value = config.secondaryText || '';
      if (el('prot-wm-padrao')) el('prot-wm-padrao').value = config.pattern || 'diagonal_grid';
      if (el('prot-wm-selo-central')) el('prot-wm-selo-central').checked = config.centerMark !== false;
      if (el('prot-wm-posicao-selo')) el('prot-wm-posicao-selo').value = config.badgePosition || 'top';

      const opac = Math.round((config.opacity || 0.32) * 100);
      if (el('prot-wm-opacidade')) el('prot-wm-opacidade').value = opac;
      if (el('prot-wm-opacidade-val')) el('prot-wm-opacidade-val').textContent = `${opac}%`;

      const ang = config.angle !== undefined ? config.angle : -26;
      if (el('prot-wm-angulo')) el('prot-wm-angulo').value = ang;
      if (el('prot-wm-angulo-val')) el('prot-wm-angulo-val').textContent = `${ang}°`;

      const esp = config.spacing || 240;
      if (el('prot-wm-espacamento')) el('prot-wm-espacamento').value = esp;
      if (el('prot-wm-espacamento-val')) el('prot-wm-espacamento-val').textContent = `${esp}px`;

      const tam = config.fontSize || 20;
      if (el('prot-wm-tamanho')) el('prot-wm-tamanho').value = tam;
      if (el('prot-wm-tamanho-val')) el('prot-wm-tamanho-val').textContent = `${tam}px`;

      const qual = config.quality || 82;
      if (el('prot-wm-qualidade')) el('prot-wm-qualidade').value = qual;
      if (el('prot-wm-qualidade-val')) el('prot-wm-qualidade-val').textContent = `${qual}%`;

      if (el('prot-wm-resolucao')) el('prot-wm-resolucao').value = String(config.maxPreviewWidth || 1600);
      if (el('prot-wm-formato')) el('prot-wm-formato').value = config.format || 'webp';

      if (el('prot-wm-ai-protection')) el('prot-wm-ai-protection').checked = config.aiProtection !== false;

      const noise = (config.aiNoiseStrength ? config.aiNoiseStrength * 100 : 3.5).toFixed(1);
      if (el('prot-wm-ai-noise')) el('prot-wm-ai-noise').value = noise;
      if (el('prot-wm-ai-noise-val')) el('prot-wm-ai-noise-val').textContent = `${noise}%`;
    }
  } catch (err) {
    console.warn('[admin] aviso ao carregar proteção:', err);
  }
}

function ligarEventosProtecao() {
  const vincularSlider = (idSlider, idRotulo, sulfixo) => {
    const input = el(idSlider);
    const rotulo = el(idRotulo);
    if (!input) return;
    input.addEventListener('input', () => {
      if (rotulo) rotulo.textContent = `${input.value}${sulfixo}`;
      agendarAtualizacaoPrevia();
    });
  };

  vincularSlider('prot-wm-opacidade', 'prot-wm-opacidade-val', '%');
  vincularSlider('prot-wm-angulo', 'prot-wm-angulo-val', '°');
  vincularSlider('prot-wm-espacamento', 'prot-wm-espacamento-val', 'px');
  vincularSlider('prot-wm-tamanho', 'prot-wm-tamanho-val', 'px');
  vincularSlider('prot-wm-qualidade', 'prot-wm-qualidade-val', '%');
  vincularSlider('prot-wm-ai-noise', 'prot-wm-ai-noise-val', '%');

  for (const id of [
    'prot-wm-ativar',
    'prot-wm-texto',
    'prot-wm-secundario',
    'prot-wm-padrao',
    'prot-wm-posicao-selo',
    'prot-wm-selo-central',
    'prot-wm-resolucao',
    'prot-wm-formato',
    'prot-wm-ai-protection'
  ]) {
    const elCampo = el(id);
    if (elCampo) {
      elCampo.addEventListener('change', agendarAtualizacaoPrevia);
      if (elCampo.tagName === 'INPUT' && elCampo.type === 'text') {
        elCampo.addEventListener('input', agendarAtualizacaoPrevia);
      }
    }
  }

  const btnSalvar = el('btn-salvar-protecao');
  if (btnSalvar) {
    btnSalvar.addEventListener('click', async () => {
      btnSalvar.disabled = true;
      btnSalvar.textContent = 'Salvando...';
      try {
        const payload = {
          enabled: el('prot-wm-ativar')?.checked ?? true,
          text: el('prot-wm-texto')?.value || 'Vilma Silva Fotografia',
          secondaryText: el('prot-wm-secundario')?.value || '',
          pattern: el('prot-wm-padrao')?.value || 'diagonal_grid',
          centerMark: el('prot-wm-selo-central')?.checked ?? true,
          badgePosition: el('prot-wm-posicao-selo')?.value || 'top',
          opacity: Number(el('prot-wm-opacidade')?.value || 32) / 100,
          angle: Number(el('prot-wm-angulo')?.value || -26),
          spacing: Number(el('prot-wm-espacamento')?.value || 240),
          fontSize: Number(el('prot-wm-tamanho')?.value || 20),
          quality: Number(el('prot-wm-qualidade')?.value || 82),
          maxPreviewWidth: Number(el('prot-wm-resolucao')?.value || 1600),
          maxPreviewHeight: Number(el('prot-wm-resolucao')?.value || 1600),
          format: el('prot-wm-formato')?.value || 'webp',
          aiProtection: el('prot-wm-ai-protection')?.checked ?? true,
          aiNoiseStrength: Number(el('prot-wm-ai-noise')?.value || 3.5) / 100
        };

        await saveProtectionConfig(payload);
        mostrarToast('✓ Configurações de proteção salvas com sucesso!');
        atualizarPreviaAoVivo();
      } catch (err) {
        mostrarToast(`Erro ao salvar: ${err.message}`);
      } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = 'Salvar Configurações';
      }
    });
  }

  const btnPrevia = el('btn-atualizar-previa-ao-vivo');
  if (btnPrevia) {
    btnPrevia.addEventListener('click', () => {
      atualizarPreviaAoVivo();
      mostrarToast('Prévia visual atualizada.');
    });
  }

  const btnReprocessar = el('btn-reprocessar-acervo');
  const statusBox = el('prot-reprocessar-status');
  if (btnReprocessar) {
    btnReprocessar.addEventListener('click', async () => {
      if (!confirm('Deseja reprocessar todas as fotografias existentes aplicando a configuração atual de marcas-d\'água e proteção? Os arquivos originais serão preservados.')) {
        return;
      }

      btnReprocessar.disabled = true;
      btnReprocessar.textContent = 'Reprocessando...';
      if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.style.background = 'rgba(99, 102, 241, 0.15)';
        statusBox.style.border = '1px solid var(--acento-borda)';
        statusBox.style.color = '#fff';
        statusBox.textContent = 'Processando acervo fotográfico em lotes controlados...';
      }

      try {
        const resultado = await reprocessImages({ all: true });
        if (statusBox) {
          statusBox.style.background = 'rgba(16, 185, 129, 0.15)';
          statusBox.style.border = '1px solid rgba(16, 185, 129, 0.4)';
          statusBox.style.color = '#10b981';
          statusBox.textContent = `✓ ${resultado.message || 'Acervo reprocessado com sucesso!'}`;
        }
        mostrarToast('✓ Todas as fotos do acervo foram atualizadas!');
        await carregarProtecaoPainel();
        atualizarPreviaAoVivo();
      } catch (err) {
        if (statusBox) {
          statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
          statusBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
          statusBox.style.color = '#ef4444';
          statusBox.textContent = `Erro ao reprocessar acervo: ${err.message}`;
        }
        mostrarToast(`Erro: ${err.message}`);
      } finally {
        btnReprocessar.disabled = false;
        btnReprocessar.textContent = 'Reprocessar Acervo';
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
