/**
 * Painel de configuração (/config).
 *
 * Duas coisas independentes, guardadas no servidor e pelo mesmo cookie de
 * sessão do login:
 *
 *   visibilidade  — liga e desliga blocos do site (as tags data-tag do HTML)
 *   siteData      — os textos, imagens e categorias que a home mostra
 *
 * Antes os interruptores eram montados em containers que não existiam no
 * HTML, então nada era controlado. Aqui os containers existem de verdade e a
 * lista de blocos vem de um único lugar (BLOCOS), conferida contra o
 * defaultVisibility do visibility.js.
 */

import { exigirLogin } from './admin-auth.js';
import { getContent, putContent, uploadImage } from './api.js';
import { DataManager, defaultData, safeImageSrc } from './dataManager.js';
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
let timerVisibilidade = null;

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
  el('estat-sync').textContent = quando ? new Date(quando).toLocaleTimeString('pt-BR', HORA) : '—';
}

function definirTodos(valor) {
  for (const tag of Object.keys(visibilidade)) visibilidade[tag] = valor;
  pintarVisibilidade();
  aplicarEAtualizar();
  avisar(valor ? 'Todos os blocos foram publicados.' : 'Todos os blocos foram ocultos.', valor ? 'ok' : 'erro');
}

function pintarVisibilidade() {
  const grade = el('grade-vis');
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

// ---------------------------------------------------------------- textos

function pintarTextos() {
  const hero = conteudo.hero || defaultData.hero;
  const banner = conteudo.banner || defaultData.banner;
  const botao = hero.button || defaultData.hero.button;

  el('hero-etiqueta').value = String(hero.eyebrow ?? '');
  el('hero-titulo').value = String(hero.title ?? '');
  el('hero-subtitulo').value = String(hero.subtitle ?? '');
  el('botao-texto').value = String(botao.text ?? '');
  el('botao-whatsapp').value = String(botao.whatsapp ?? '');
  el('botao-mensagem').value = String(botao.message ?? '');

  el('banner-titulo-tela').value = String(banner.titleScreen ?? '');
  el('banner-titulo').value = String(banner.title ?? '');
  el('banner-subtitulo').value = String(banner.subtitle ?? '');

  mostrarPrevia(
    el('hero-previa'), el('hero-previa-vazia'),
    safeImageSrc(hero.image, defaultData.hero.image),
    el('hero-imagem-atual'), null
  );
  mostrarPrevia(
    el('banner-previa'), el('banner-previa-vazia'),
    safeImageSrc(banner.image, defaultData.banner.image),
    el('banner-imagem-atual'), null
  );
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
    const imagem = await enviarSeEscolhido(el('hero-imagem'), atual.image);

    conteudo = await dados.save({
      hero: {
        ...atual,
        image: imagem,
        eyebrow: el('hero-etiqueta').value.trim(),
        title: el('hero-titulo').value.trim(),
        subtitle: el('hero-subtitulo').value.trim(),
        button: {
          ...botaoAtual,
          text: el('botao-texto').value.trim(),
          whatsapp: el('botao-whatsapp').value.replace(/\D/g, ''),
          message: el('botao-mensagem').value.trim()
        }
      }
    });

    el('hero-imagem').value = '';
    pintarTextos();
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
  });
}

// ------------------------------------------------------------ navegação

function irParaSecao(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  fecharLateral();
}

function abrirLateral() {
  const lateral = el('lateral');
  const botao = el('botao-menu');
  lateral.dataset.aberta = 'true';
  botao.setAttribute('aria-expanded', 'true');
}

function fecharLateral() {
  const lateral = el('lateral');
  const botao = el('botao-menu');
  if (!lateral || lateral.dataset.aberta !== 'true') return;
  lateral.dataset.aberta = 'false';
  botao.setAttribute('aria-expanded', 'false');
}

function marcarSecaoAtiva() {
  const secoes = [...document.querySelectorAll('.secao')];

  const visivel = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        for (const item of document.querySelectorAll('.nav-item[data-ir]')) {
          item.setAttribute('aria-current', String(item.dataset.ir === entrada.target.id));
        }
      }
    },
    { rootMargin: '-88px 0px -60% 0px' }
  );

  for (const secao of secoes) visivel.observe(secao);
}

function ligarNavegacao() {
  for (const item of document.querySelectorAll('.nav-item[data-ir]')) {
    item.addEventListener('click', () => irParaSecao(item.dataset.ir));
  }

  el('botao-menu').addEventListener('click', () => {
    const lateral = el('lateral');
    if (lateral.dataset.aberta === 'true') fecharLateral();
    else abrirLateral();
  });

  // Fora da barra, no mobile, a barra fecha.
  document.addEventListener('click', (evento) => {
    const lateral = el('lateral');
    if (lateral.dataset.aberta !== 'true') return;
    if (lateral.contains(evento.target) || el('botao-menu').contains(evento.target)) return;
    fecharLateral();
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') fecharLateral();
  });

  el('mostrar-tudo').addEventListener('click', () => definirTodos(true));
  el('ocultar-tudo').addEventListener('click', () => definirTodos(false));
  el('filtro-publicados').addEventListener('change', aplicarFiltros);
  el('filtro-ocultos').addEventListener('change', aplicarFiltros);
  el('add-categoria').addEventListener('click', () => {
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
    el('lista-categorias').querySelector('.categoria:last-child .entrada')?.focus();
  });

  for (const botao of document.querySelectorAll('[data-salvar]')) {
    const destino = botao.dataset.salvar;
    botao.addEventListener('click', () => {
      if (destino === 'hero') salvarHero(botao);
      else if (destino === 'banner') salvarBanner(botao);
    });
  }

  el('salvar-categorias').addEventListener('click', (evento) => salvarCategorias(evento.currentTarget));

  // Prévia imediata do arquivo escolhido, antes de salvar.
  for (const [input, img, vazio, rotulo] of [
    ['hero-imagem', 'hero-previa', 'hero-previa-vazia', 'hero-imagem-atual'],
    ['banner-arquivo', 'banner-previa', 'banner-previa-vazia', 'banner-imagem-atual']
  ]) {
    el(input).addEventListener('change', (evento) => {
      const arquivo = evento.target.files?.[0];
      if (!arquivo) return;
      el(img).src = URL.createObjectURL(arquivo);
      el(img).hidden = false;
      el(vazio).hidden = true;
      el(rotulo).textContent = `Escolhido: ${arquivo.name}`;
    });
  }
}

// ----------------------------------------------------------------- início

async function iniciar() {
  await exigirLogin();

  ligarNavegacao();
  marcarSecaoAtiva();

  // Visibilidade também vem do servidor, e não do cache: o painel envia o
  // mapa inteiro a cada clique, então um estado velho sobrescreveria o que
  // outra aba tivesse acabado de salvar. O cache serve só de rede de segurança.
  const remotoVisibilidade = await fetchVisibility();
  visibilidade = remotoVisibilidade || readCache() || { ...defaultVisibility };
  pintarVisibilidade();
  writeCache(visibilidade);

  // Conteúdo: os textos e as categorias.
  //
  // Aqui não vale a cópia em localStorage que a home usa para pintar rápido.
  // O painel é onde se edita: mostrar um texto velho e salvar por cima seria
  // a pior falha possível. Então lê do servidor e só isso.
  const remotoConteudo = await getContent('siteData');
  conteudo = { ...defaultData, ...(remotoConteudo && typeof remotoConteudo === 'object' ? remotoConteudo : {}) };
  dados.currentData = conteudo; // de onde o save() parte
  categorias = (conteudo.categories || []).map((categoria) => ({ ...categoria }));

  pintarTextos();
  pintarCategorias();
  atualizarEstatisticas();
  marcarEstado('salvo', 'Sincronizado');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
