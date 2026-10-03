/**
 * Painel de configuração (/config).
 *
 * Cinco seções — Visão geral, Textos do site, Portfólio, Serviços e Dúvidas —
 * uma por vez, escolhidas no trilho lateral de ícones.
 *
 * Três coisas independentes, guardadas no servidor e pelo mesmo cookie de
 * sessão do login:
 *
 *   siteData       — os textos, imagens, categorias e serviços que o site mostra
 *   faqs           — as perguntas e respostas da página de dúvidas
 *   visibility     — os blocos ligados e desligados, lidos só para o resumo
 *
 * Cada seção liga os botões que existem no config.html. Se um elemento sumir
 * do HTML e o JS continuar tentando ligá-lo, `iniciar()` quebra no meio e
 * nenhuma lista é pintada — por isso aqui não há referência a elemento que a
 * página não tenha.
 */

import { exigirLogin } from './admin-auth.js';
import { getContent, putContent, uploadImage, uploadMedia, LIMITE_VIDEO_BYTES } from './api.js';
import {
  DataManager,
  defaultData,
  safeImageSrc,
  isVideoMedia,
  normalizarInclui
} from './dataManager.js';
import { defaultVisibility, fetchVisibility } from './visibility.js';

// ---------------------------------------------------------------- estado

let visibilidade = { ...defaultVisibility };
let conteudo = null;
let categorias = [];
let servicos = [];
let duvidas = [];

/**
 * Marcado pelo botão "tirar o vídeo". Vale até o próximo Salvar: sem ele não
 * haveria como voltar a capa só com imagem, porque o campo de arquivo não
 * consegue "desescolher" o que já está publicado.
 */
let tirarVideoCapa = false;

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

// -------------------------------------------------------------- resumo

function mensagemDeErro(erro) {
  if (erro?.status === 401) return 'Sua sessão expirou. Recarregue e entre de novo.';
  return erro?.message || 'Algo deu errado.';
}

/**
 * A visibilidade é lida do servidor só para responder "quantos blocos estão no
 * ar". Quem liga e desliga é o código do site, não este painel — os
 * interruptores por tag saíram daqui junto com a seção que os mostrava.
 */
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

  el('resumo-titulo').textContent = String(hero.title || '—');
  el('resumo-subtitulo').textContent = String(hero.subtitle || '—');
  el('resumo-categorias').textContent = categorias.length
    ? `${categorias.length} ${categorias.length === 1 ? 'categoria' : 'categorias'}`
    : 'Nenhuma';

  el('resumo-servicos').textContent = servicos.length
    ? `${servicos.length} ${servicos.length === 1 ? 'serviço' : 'serviços'}`
    : 'Nenhum';

  el('resumo-duvidas').textContent = duvidas.length
    ? `${duvidas.length} ${duvidas.length === 1 ? 'pergunta' : 'perguntas'}`
    : 'Nenhuma';

  definirEtiqueta('resumo-grade', visibilidade['next-section'] !== false, 'Publicada', 'Oculta');
  definirEtiqueta('resumo-servicos-vis', servicos.length > 0, 'Com conteúdo', 'Vazia');
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
  const hero = conteudo.hero || defaultData.hero;
  const banner = conteudo.banner || defaultData.banner;
  const botao = hero.button || defaultData.hero.button;
  const center = conteudo.center || defaultData.center;

  el('hero-etiqueta').value = String(hero.eyebrow ?? '');
  el('hero-titulo').value = String(hero.title ?? '');
  el('hero-subtitulo').value = String(hero.subtitle ?? '');
  el('botao-texto').value = String(botao.text ?? '');
  el('botao-whatsapp').value = String(botao.whatsapp ?? '');
  el('botao-mensagem').value = String(botao.message ?? '');

  el('banner-titulo-tela').value = String(banner.titleScreen ?? '');
  el('banner-titulo').value = String(banner.title ?? '');
  el('banner-subtitulo').value = String(banner.subtitle ?? '');

  pintarCapa();

  mostrarPrevia(
    el('banner-previa'), el('banner-previa-vazia'),
    safeImageSrc(banner.image, defaultData.banner.image),
    el('banner-imagem-atual'), null
  );

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
    const capa = await enviarCapaSeEscolhido(el('hero-imagem'), atual, tirarVideoCapa);

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
      }
    });

    tirarVideoCapa = false;
    el('hero-imagem').value = '';
    pintarTextos();
    // A tela inicial mostra o que está no ar, não o que está no formulário.
    atualizarEstatisticas();
  });
}

/**
 * O destaque central é salvo sozinho, e não junto com a capa: são duas
 * decisões diferentes e quem edita a capa não deveria ter que gravar o
 * vídeo do meio por tabela.
 */
async function salvarCentro(botao) {
  await comBotao(botao, async () => {
    const atual = conteudo.center || defaultData.center;
    const centro = await enviarCentroSeEscolhido(el('center-arquivo'), atual);

    conteudo = await dados.save({ center: centro });

    el('center-arquivo').value = '';
    pintarCentro();
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
  grade.appendChild(campoServico('WhatsApp próprio (só números)', servico.whatsapp, servico, 'whatsapp', '5581999999999'));
  grade.appendChild(campoServico('Mensagem do WhatsApp', servico.whatsappMessage, servico, 'whatsappMessage', 'Olá! Quero esse serviço.'));
  linha.appendChild(grade);

  // "Inclui" é uma lista, não um texto: a página de serviços renderiza cada
  // item como um <li> (uiManager.js buildServiceCard). Uma string aqui
  // apagaria a lista inteira do site.
  linha.appendChild(campoInclui(servico));

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

/**
 * Editor da lista "Inclui". Cada item é um campo próprio, com um botão para
 * tirar e outro para incluir — é a diferença entre ver "o que está no ar" e
 * reescrever tudo de um jeito só.
 *
 * Aceita o conteúdo antigo em texto: conteúdo salvo antes desta lista existir
 * é uma frase com os itens separados por vírgula, e dividir por linha mantém o
 * que a dona já tinha escrito em vez de mostrar um item só.
 */
function campoInclui(servico) {
  const campo = document.createElement('div');
  campo.className = 'campo campo--largo';

  const topo = document.createElement('div');
  topo.className = 'campo-linha';

  const texto = document.createElement('span');
  texto.className = 'campo-rotulo';
  texto.textContent = 'Inclui';
  topo.appendChild(texto);

  const adicionar = document.createElement('button');
  adicionar.type = 'button';
  adicionar.className = 'btn btn--pequeno';
  adicionar.innerHTML = '<svg class="icone icone--p" aria-hidden="true"><use href="#i-mais"></use></svg>Incluir item';
  adicionar.addEventListener('click', () => {
    servico.includes.push('');
    pintarInclui(campo, servico);
    campo.querySelector('.item-inclui:last-child input')?.focus();
  });
  topo.appendChild(adicionar);

  campo.appendChild(topo);

  pintarInclui(campo, servico);
  return campo;
}

function pintarInclui(campo, servico) {
  campo.querySelector('.lista-inclui')?.remove();

  const lista = document.createElement('div');
  lista.className = 'lista-inclui';

  servico.includes.forEach((item, indice) => {
    const linha = document.createElement('div');
    linha.className = 'item-inclui';

    const entrada = document.createElement('input');
    entrada.className = 'entrada';
    entrada.type = 'text';
    entrada.value = String(item ?? '');
    entrada.placeholder = 'Até 50 fotos editadas';
    entrada.addEventListener('input', () => {
      servico.includes[indice] = entrada.value;
    });
    linha.appendChild(entrada);

    const remover = document.createElement('button');
    remover.type = 'button';
    remover.className = 'btn-icone btn-icone--perigo';
    remover.title = 'Tirar este item';
    remover.setAttribute('aria-label', 'Tirar este item da lista');
    remover.innerHTML = '<svg class="icone" aria-hidden="true"><use href="#i-lixeira"></use></svg>';
    remover.addEventListener('click', () => {
      servico.includes.splice(indice, 1);
      pintarInclui(campo, servico);
    });
    linha.appendChild(remover);

    lista.appendChild(linha);
  });

  if (!servico.includes.length) {
    const vazio = document.createElement('p');
    vazio.className = 'campo-dica';
    vazio.textContent = 'Nenhum item. A lista some do site enquanto estiver vazia.';
    lista.appendChild(vazio);
  }

  campo.appendChild(lista);
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
        // Sempre array: é o que o site lê. String aqui apagaria a lista.
        includes: normalizarInclui(servico.includes),
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


// ------------------------------------------------------------ navegação

/**
 * As seções do painel, uma por tela do site. O trilho lateral tem só ícones,
 * então o nome que aparece no cabeçalho vem daqui, e não do HTML.
 *
 * Contatos e Sobre mim não entram ainda: nenhuma das duas telas tem fonte de
 * dado no site (o rodapé só tem o copyright e a página Sobre é HTML fixo), e
 * uma aba que não edita nada seria função sem ligação com o site.
 *
 * A ordem importa: Textos vem logo depois da visão geral porque é o que se
 * edita com mais frequência.
 */
const SECOES = {
  'visao-geral': 'Visão geral',
  textos: 'Textos do site',
  portfolio: 'Portfólio',
  servicos: 'Serviços',
  duvidas: 'Dúvidas'
};

const ORDEM = Object.keys(SECOES);

/**
 * Nomes alternativos que levam à mesma seção.
 *
 * "Minha Galeria" é o botão fixo no rodapé do trilho. Hoje ele cai em
 * Portfólio, que é onde as categorias e as fotos do site são gerenciadas.
 * Quando a tela de Galeria existir, é um caractere aqui e a lista de seções.
 */
const ALIAS = {
  galeria: 'portfolio'
};

/** Resolve um alvo de rota para uma seção real, com os apelidos aplicados. */
function resolverSecao(id) {
  const alvo = ALIAS[id] || id;
  return ORDEM.includes(alvo) ? alvo : ORDEM[0];
}

/**
 * Troca de seção mostrando um painel por vez.
 *
 * Sem rolagem: o cabeçalho é fixo, o conteúdo inteiro cabe na tela e rolar até
 * uma seção que já está visível só causaria tremida.
 */
function mostrarSecao(id, { moverHash = true } = {}) {
  const alvo = resolverSecao(id);

  for (const nome of ORDEM) {
    const painel = el(`painel-${nome}`);
    const ativa = nome === alvo;

    if (painel) painel.hidden = !ativa;

    // Todos os itens que apontam para esta seção acendem junto: o atalho do
    // rodapé marca "você está aqui" junto com o item do trilho. Um só
    // highlighted seria mais limpo, mas deixaria o botão do rodapé sem
    // resposta visual quando é por ele que a pessoa chegou.
    for (const item of document.querySelectorAll(`.trilho-item[data-alvo="${nome}"]`)) {
      item.setAttribute('aria-current', String(ativa));
    }
  }

  el('topo-titulo').textContent = SECOES[alvo];

  if (moverHash && window.location.hash.slice(1) !== alvo) {
    history.replaceState(null, '', `#${alvo}`);
  }

  // Trocar de seção recomeça a leitura do topo, como se fosse outra página.
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function ligarNavegacao() {
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

  // /config#servicos abre direto na seção de serviços.
  window.addEventListener('hashchange', () => {
    mostrarSecao(window.location.hash.slice(1), { moverHash: false });
  });

  mostrarSecao(window.location.hash.slice(1));

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

  el('add-servico').addEventListener('click', () => {
    // Os mesmos campos que buildServiceCard lê. O que o site não usar
    // (whatsapp próprio) fica vazio e o site cai no número do site.
    servicos.push({
      id: `servico-${Date.now()}`,
      name: '',
      description: '',
      price: '',
      duration: '',
      // Lista, não texto: é o formato que a página de serviços renderiza.
      includes: [],
      image: '',
      whatsapp: '',
      whatsappMessage: ''
    });
    pintarServicos();
    el('lista-servicos').querySelector('.servico:last-child .entrada')?.focus();
  });

  el('add-duvida').addEventListener('click', () => {
    duvidas.push({ question: '', answer: '' });
    pintarDuvidas();
    el('lista-duvidas').querySelector('.duvida:last-child .entrada')?.focus();
  });

  for (const botao of document.querySelectorAll('[data-salvar]')) {
    const destino = botao.dataset.salvar;
    botao.addEventListener('click', () => {
      if (destino === 'hero') salvarHero(botao);
      else if (destino === 'centro') salvarCentro(botao);
      else if (destino === 'banner') salvarBanner(botao);
    });
  }

  el('salvar-categorias').addEventListener('click', (evento) => salvarCategorias(evento.currentTarget));
  el('salvar-servicos').addEventListener('click', (evento) => salvarServicos(evento.currentTarget));
  el('salvar-duvidas').addEventListener('click', (evento) => salvarDuvidas(evento.currentTarget));

  // A capa aceita vídeo: a prévia e o aviso de tamanho são os mesmos do
  // campo do meio, e é ela que decide o que mostrar.
  el('hero-imagem').addEventListener('change', (evento) => {
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

  el('hero-tirar-video').addEventListener('click', () => {
    tirarVideoCapa = true;
    el('hero-imagem').value = '';
    pintarCapa();
    avisar('O vídeo sai da capa no próximo Salvar.');
  });

  // Prévia imediata do arquivo escolhido, antes de salvar.
  el('banner-arquivo').addEventListener('change', (evento) => {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    el('banner-previa').src = URL.createObjectURL(arquivo);
    el('banner-previa').hidden = false;
    el('banner-previa-vazia').hidden = true;
    el('banner-imagem-atual').textContent = `Escolhido: ${arquivo.name}`;
  });

  // O campo do meio aceita vídeo também, então não há miniatura para
  // mostrar: o que importa antes de salvar é o tipo e o tamanho, que é
  // exatamente o que costuma dar erro.
  el('center-arquivo').addEventListener('change', (evento) => {
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

  // A visibilidade alimenta só os números da visão geral. fetchVisibility já
  // devolve o padrão quando a chave não existe no servidor, então um erro de
  // rede aqui não impede o painel de abrir.
  visibilidade = (await fetchVisibility()) || { ...defaultVisibility };

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
  // includes chega como array do site e como texto de painéis antigos: a lista
  // só aceita array, então normaliza já na leitura e o editor nunca começa com
  // um item só, cheio de vírgulas.
  servicos = (conteudo.services || []).map((servico) => ({
    ...servico,
    includes: normalizarInclui(servico.includes)
  }));

  // Dúvidas moram em chave própria, não em siteData: é o que a página
  // /pages/duvidas.html busca. Falha ao buscar não impede o painel de abrir —
  // a seção cai no estado vazio e a dona salva o que quiser.
  const remotoDuvidas = await getContent('faqs').catch(() => null);
  duvidas = Array.isArray(remotoDuvidas) ? remotoDuvidas : [];

  pintarTextos();
  pintarCategorias();
  pintarServicos();
  pintarDuvidas();
  atualizarEstatisticas();
  marcarEstado('salvo', 'Sincronizado');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
