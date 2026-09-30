/**
 * Gerenciamento de UI do site.
 *
 * Pinta a página com os dados do DataManager. Nada aqui usa innerHTML com
 * dado vindo do servidor: os elementos são montados com createElement/textContent.
 */

import {
  defaultData,
  safeImageSrc,
  isVideoMedia,
  whatsappUrl,
  text,
  WHATSAPP_PADRAO
} from './dataManager.js';

class UIManager {
  constructor(dataManager) {
    this.dataManager = dataManager;
  }

  initialize() {
    this.dataManager.subscribe((data) => this.updateUI(data));
    this.setupBannerInputs();
  }

  setupBannerInputs() {
    const input = document.getElementById('banner-input');
    const title = document.getElementById('banner-title-input');
    const subtitle = document.getElementById('banner-subtitle-input');
    const titleScreen = document.getElementById('banner-title-screen-input');
    const save = document.getElementById('save-banner-btn');
    if (!input || !title || !subtitle || !titleScreen || !save) return;

    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        await this.dataManager.updateBanner(
          input.files[0] || null,
          title.value.trim(),
          subtitle.value.trim(),
          titleScreen.value.trim()
        );
        alert('Banner atualizado.');
      } catch (error) {
        alert(`Não foi possível atualizar o banner: ${error.message}`);
      } finally {
        save.disabled = false;
      }
    });
  }

  updateUI(data) {
    const path = window.location.pathname.toLowerCase();

    if (path.includes('servicos')) this.updateServicesPage(data);
    else if (path.includes('galeria')) this.updateGalleryPage(data);
    else if (path === '/' || path === '' || path.includes('index.html')) this.updateIndexPage(data);
  }

  updateIndexPage(data) {
    this.renderHeroMedia(data.hero);
    this.renderCenterMedia(data);

    const eyebrow = document.getElementById('hero-etiqueta');
    if (eyebrow) eyebrow.textContent = text(data.hero.eyebrow, defaultData.hero.eyebrow);

    const titleName = document.getElementById('title-name');
    if (titleName) titleName.textContent = text(data.hero.title);

    const subtitle = document.getElementById('subtitle');
    if (subtitle) subtitle.textContent = text(data.hero.subtitle);

    this.setupBudgetButtons(data.hero.button);

    const bannerImage = document.getElementById('banner-image');
    if (bannerImage) {
      const src = safeImageSrc(data.banner.image, defaultData.banner.image);
      if (src) bannerImage.src = src;
    }

    const bannerTitle = document.getElementById('banner-title');
    if (bannerTitle) bannerTitle.textContent = text(data.banner.title);

    const bannerSubtitle = document.getElementById('banner-subtitle');
    if (bannerSubtitle) bannerSubtitle.textContent = text(data.banner.subtitle);

    const cardapioTitle = document.querySelector('.title-cardapio');
    if (cardapioTitle) cardapioTitle.textContent = text(data.banner.titleScreen, 'Portfólio');

    this.updateCategories(data.categories);

    // A grade do portfólio é montada por scripts.js, que é um script clássico
    // e não enxerga este módulo. O evento é o encontro dos dois: as categorias
    // que a dona cadastrou no painel viram as fotos da home.
    document.dispatchEvent(
      new CustomEvent('vilma:conteudo', { detail: { categories: data.categories } })
    );
  }

  renderHeroMedia(hero) {
    const container = document.getElementById('hero-midia');
    if (!container) return;

    const veu = container.querySelector('.hero-veu');
    const poster = safeImageSrc(hero.image, defaultData.hero.image);
    const video = safeImageSrc(hero.video);
    const alvo = video || poster;
    if (!alvo) return;

    if (container.dataset.fonte === alvo) return;
    container.dataset.fonte = alvo;

    const antigoHero = container.querySelector(':scope > #hero-image, :scope > video');
    if (antigoHero) antigoHero.remove();

    let elemento;

    if (video) {
      elemento = document.createElement('video');
      elemento.src = video;
      elemento.autoplay = true;
      elemento.loop = true;
      elemento.playsInline = true;
      elemento.muted = true;
      elemento.setAttribute('muted', '');
      if (poster) elemento.poster = poster;
      elemento.setAttribute('aria-label', `Vídeo de ${text(hero.title)}`);
    } else {
      elemento = document.createElement('img');
      elemento.src = poster;
      elemento.alt = `Foto de ${text(hero.title)}`;
      elemento.decoding = 'async';
      elemento.fetchPriority = 'high';
    }

    elemento.id = 'hero-image';
    container.prepend(elemento);

    if (veu && veu.parentElement === container) {
      container.appendChild(veu);
    }
  }

  /**
   * Mídia do card central da grade. É o que a dona escolhe no painel: foto
   * ou vídeo. Foto é só um <img> como sempre; vídeo toca sozinho, em loop e
   * mudo (todo navegador recusa autoplay com som), com um botão no canto
   * para devolver o áudio.
   *
   * Vive separado de renderHeroMedia porque o vídeo do fundo e o do card
   * central são escolhas diferentes — antes um campo só controlava os dois.
   */
  renderCenterMedia(data) {
    const card = document.getElementById('hero-featured-card');
    if (!card) return;

    const hero = data.hero || defaultData.hero;
    const center = data.center || {};
    const poster = safeImageSrc(hero.image, defaultData.hero.image);
    const media = safeImageSrc(center.media);
    const ehVideo = isVideoMedia(media, center.tipo);

    const img = card.querySelector('#hero-center-img');
    let vid = card.querySelector('#hero-center-video');

    // Sem mídia escolhida no painel, o card mantém a capa como imagem.
    if (!media || !ehVideo) {
      this.applyCenterImage(card, media || poster);
      return;
    }

    // Abaixo de 900px a coluna central some da grade e o card não existe na
    // tela. Carregar o vídeo ali seria pagar a banda do celular por um
    // arquivo que ninguém vê, então nesse tamanho fica só a capa.
    if (!window.matchMedia('(min-width: 900px)').matches) {
      this.applyCenterImage(card, poster);
      this.watchCenterBreakpoint(data);
      return;
    }

    if (img) img.style.display = 'none';

    if (!vid) {
      vid = document.createElement('video');
      vid.id = 'hero-center-video';
      vid.className = 'hero-center-media';
      card.prepend(vid);
    }

    vid.autoplay = true;
    vid.loop = true;
    vid.playsInline = true;
    vid.preload = 'auto';
    vid.setAttribute('playsinline', '');
    vid.setAttribute('webkit-playsinline', '');
    vid.setAttribute('autoplay', '');
    vid.setAttribute('loop', '');
    vid.setAttribute('preload', 'auto');
    if (poster) vid.poster = poster;

    if (vid.getAttribute('src') !== media) {
      vid.setAttribute('src', media);
      vid.load();
    }

    vid.style.display = 'block';

    // O botão é destapado aqui, e não dentro de bindCenterSound: aquele só
    // liga os ouvintes uma vez, e o `hidden` precisa voltar toda vez que o
    // vídeo aparece. Caso contrário, quem troca vídeo → foto → vídeo no
    // painel ficaria com o vídeo tocando e o botão sumido.
    const botao = card.querySelector('#hero-center-som');
    if (botao) botao.hidden = false;

    this.bindCenterSound(card, vid);
    this.playCenterVideo(vid);
    this.watchCenterBreakpoint(data);
  }

  /**
   * Refaz a mídia do meio quando a janela cruza os 900px. Só importa o que
   * a grade decide na CSS: o card central existe a partir daí.
   *
   * Ouve o `change` da media query E o `resize` da janela. Os dois porque o
   * primeiro é o caminho certo e o segundo cobre onde ele não chega (Safari
   * antigo, e iframe/aba sem compositor, onde o evento de mudança simplesmente
   * não é despachado). O debounce evita refazer o trabalho a cada pixel de
   * arrasto da borda.
   */
  watchCenterBreakpoint(data) {
    if (this.ouvindoLargura) return;
    this.ouvindoLargura = true;

    let pendente = 0;
    const refazer = () => {
      clearTimeout(pendente);
      pendente = window.setTimeout(() => this.renderCenterMedia(data), 120);
    };

    const largura = window.matchMedia('(min-width: 900px)');
    if (largura.addEventListener) largura.addEventListener('change', refazer);
    else largura.addListener(refazer); // Safari antigo

    window.addEventListener('resize', refazer, { passive: true });
  }

  /** Foto no card central: esconder o vídeo e devolver a imagem ao lugar. */
  applyCenterImage(card, src) {
    const vid = card.querySelector('#hero-center-video');
    const img = card.querySelector('#hero-center-img');
    const botao = card.querySelector('#hero-center-som');

    if (vid) {
      vid.pause();
      vid.style.display = 'none';
      // Tira o src de verdade: senão o navegador segue baixando um vídeo
      // que ninguém está vendo. Voltamos a carregar quando o card reaparece.
      if (vid.getAttribute('src')) {
        vid.removeAttribute('src');
        vid.load();
      }
    }
    if (botao) botao.hidden = true;
    if (img) {
      img.style.display = 'block';
      if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
    }
  }

  /**
   * Autoplay só é concedido sem som. O botão é a saída: a escolha da
   * visitante manda, e scripts.js (que força `muted` antes de cada play)
   * passa a respeitá-la.
   */
  playCenterVideo(vid) {
    if (vid.dataset.som === 'ligado') return;

    vid.muted = true;
    vid.setAttribute('muted', '');

    const iniciar = () => {
      const promessa = vid.play();
      if (promessa && typeof promessa.catch === 'function') {
        promessa.catch(() => {
          // O navegador recusou o autoplay. Qualquer toque libera.
          const aoInteragir = () => {
            vid.play().catch(() => {});
            ['click', 'touchstart', 'scroll', 'pointerdown'].forEach((ev) =>
              window.removeEventListener(ev, aoInteragir)
            );
          };
          ['click', 'touchstart', 'scroll', 'pointerdown'].forEach((ev) =>
            window.addEventListener(ev, aoInteragir, { once: true, passive: true })
          );
        });
      }
    };

    if (vid.readyState >= 2) iniciar();
    else vid.addEventListener('canplay', iniciar, { once: true });
  }

  /**
   * Botão de som do vídeo central. Fica em `data-som` no <video> porque é
   * esse atributo que scripts.js consulta antes de forçar o mudo de novo.
   */
  bindCenterSound(card, vid) {
    const botao = card.querySelector('#hero-center-som');
    if (!botao || botao.dataset.pronto === 'sim') return;
    botao.dataset.pronto = 'sim';

    const aplicar = (ligado) => {
      vid.dataset.som = ligado ? 'ligado' : 'desligado';
      vid.muted = !ligado;
      if (ligado) vid.removeAttribute('muted');
      else vid.setAttribute('muted', '');

      botao.setAttribute('aria-pressed', String(ligado));
      const rotulo = ligado ? 'Silenciar o vídeo' : 'Ativar o som do vídeo';
      botao.setAttribute('aria-label', rotulo);
      botao.title = ligado ? 'Silenciar' : 'Ativar o som';
    };

    // Começa mudo, que é a única condição em que o autoplay é concedido.
    if (vid.dataset.som !== 'ligado') aplicar(false);

    botao.addEventListener('click', (evento) => {
      evento.preventDefault();
      // O card é role=button e abre a galeria; o botão vive dentro dele.
      evento.stopPropagation();

      const ligado = vid.dataset.som !== 'ligado';
      aplicar(ligado);

      // O play() disparado por um clique é uma interação do usuário: o
      // navegador libera o som mesmo sem estar em autoplay. Sem isso, um
      // vídeo pausado pelo scroll voltaria calado com o botão dizendo
      // "com som".
      if (ligado && vid.paused) {
        const promessa = vid.play();
        if (promessa && typeof promessa.catch === 'function') promessa.catch(() => {});
      }
    });
  }

  setupBudgetButtons(config) {
    if (!config) return;

    const rotulo = text(config.text, defaultData.hero.button.text);
    const url = whatsappUrl(config.whatsapp, config.message);

    for (const [botaoId, rotuloId] of [
      ['budget-button', 'budget-label'],
      ['budget-button-header', 'budget-label-header']
    ]) {
      const botao = document.getElementById(botaoId);
      if (!botao) continue;

      const alvo = document.getElementById(rotuloId);
      if (alvo) alvo.textContent = rotulo;

      botao.onclick = url ? () => window.open(url, '_blank', 'noopener') : null;
      botao.hidden = !url;
    }
  }

  updateServicesPage(data) {
    const container = document.getElementById('servicos-grade');
    if (!container) return;

    const vazio = document.getElementById('servicos-vazio');
    const servicos = Array.isArray(data.services) ? data.services : [];
    container.replaceChildren();
    container.hidden = servicos.length === 0;
    if (vazio) vazio.hidden = servicos.length > 0;

    for (const [i, service] of servicos.entries()) {
      container.appendChild(this.buildServiceCard(service, i));
    }
  }

  buildServiceCard(service, indice) {
    const card = document.createElement('article');
    card.className = 'cartao';

    const src = safeImageSrc(service.image);
    if (src) {
      const foto = document.createElement('div');
      foto.className = 'cartao__foto';

      const img = document.createElement('img');
      img.src = src;
      img.alt = text(service.name, 'Serviço');
      img.loading = 'lazy';
      img.addEventListener('error', () => foto.remove());
      foto.appendChild(img);
      card.appendChild(foto);
    }

    const corpo = document.createElement('div');
    corpo.className = 'cartao__corpo';

    // Sem foto, a numeração é o que ancora o topo do card. Continua valendo
    // quando há imagem: dá ordem de leitura à grade.
    const marca = document.createElement('span');
    marca.className = 'cartao__marca';
    marca.textContent = String(indice + 1).padStart(2, '0');
    corpo.appendChild(marca);

    const topo = document.createElement('div');
    topo.className = 'cartao__topo';

    const name = document.createElement('h3');
    name.className = 'cartao__titulo';
    name.textContent = text(service.name, 'Serviço');
    topo.appendChild(name);

    if (service.price) {
      const price = document.createElement('span');
      price.className = 'cartao__preco';
      price.textContent = text(service.price);
      topo.appendChild(price);
    }

    corpo.appendChild(topo);

    if (service.duration) {
      const duracao = document.createElement('p');
      duracao.className = 'cartao__duracao';
      duracao.textContent = text(service.duration);
      corpo.appendChild(duracao);
    }

    if (service.description) {
      const description = document.createElement('p');
      description.className = 'cartao__texto';
      description.textContent = text(service.description);
      corpo.appendChild(description);
    }

    const inclusos = Array.isArray(service.includes) ? service.includes.filter((i) => text(i).trim()) : [];
    if (inclusos.length > 0) {
      const lista = document.createElement('ul');
      lista.className = 'cartao__lista';

      for (const item of inclusos) {
        const li = document.createElement('li');
        li.textContent = text(item);
        lista.appendChild(li);
      }

      corpo.appendChild(lista);
    }

    // O serviço pode não ter telefone próprio; nesse caso cai no número da
    // casa, já com o nome do serviço na mensagem.
    const url =
      whatsappUrl(service.whatsapp, service.whatsappMessage) ||
      whatsappUrl(
        WHATSAPP_PADRAO,
        `Olá! Tenho interesse no serviço "${text(service.name, 'fotografia')}". Pode me passar um orçamento?`
      );

    if (url) {
      const link = document.createElement('a');
      link.className = 'btn';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Solicitar orçamento';
      corpo.appendChild(link);
    }

    card.appendChild(corpo);
    return card;
  }

  updateCategories(categories) {
    const container = document.getElementById('cardapio-container');
    if (!container) return;

    container.replaceChildren();

    if (!Array.isArray(categories) || categories.length === 0) {
      const aviso = document.createElement('p');
      aviso.className = 'aviso-vazio';
      aviso.textContent = 'Nenhuma categoria publicada ainda.';
      container.appendChild(aviso);
      return;
    }

    for (const category of categories) {
      container.appendChild(this.buildCategoryCard(category));
    }
  }

  buildCategoryCard(category) {
    const card = document.createElement('div');
    card.className = 'cardapio-content';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Ver galeria de ${text(category.name)}`);

    const src = safeImageSrc(category.image);
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = `Fotografia de ${text(category.name)}`;
      img.className = 'cardapio-image-one';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => img.remove());
      card.appendChild(img);
    }

    const rodape = document.createElement('div');
    rodape.className = 'cartao-rodape';

    const textos = document.createElement('div');

    const nome = document.createElement('span');
    nome.className = 'cartao-nome';
    nome.textContent = text(category.name);
    textos.appendChild(nome);

    if (category.subtitle) {
      const sub = document.createElement('span');
      sub.className = 'cartao-sub';
      sub.textContent = text(category.subtitle);
      textos.appendChild(sub);
    }

    rodape.appendChild(textos);

    const seta = document.createElement('span');
    seta.className = 'cartao-seta';
    seta.textContent = '→';
    seta.setAttribute('aria-hidden', 'true');
    rodape.appendChild(seta);

    card.appendChild(rodape);

    const abrir = () => this.handleCategoryClick(category);
    card.addEventListener('click', abrir);
    card.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        abrir();
      }
    });

    return card;
  }

  handleCategoryClick(category) {
    try {
      localStorage.setItem(
        'current_gallery_data',
        JSON.stringify({
          name: text(category.name),
          subtitle: text(category.subtitle),
          gallery: Array.isArray(category.gallery) ? [...category.gallery].reverse() : [],
          timestamp: Date.now()
        })
      );
    } catch {
      // Sem cache: a galeria cai no dado que veio do servidor.
    }
    window.location.href = `pages/galeria.html?category=${encodeURIComponent(text(category.name))}`;
  }

  updateGalleryPage(data) {
    const container = document.getElementById('gallery-container');
    if (!container) return;

    const categoryName = new URLSearchParams(window.location.search).get('category');
    if (!categoryName) {
      container.replaceChildren(this.buildEmptyState('Categoria não especificada.'));
      return;
    }

    let category = null;
    try {
      const saved = JSON.parse(localStorage.getItem('current_gallery_data') || 'null');
      if (saved && saved.name === categoryName && Date.now() - saved.timestamp < 300000) {
        category = saved;
      } else {
        localStorage.removeItem('current_gallery_data');
      }
    } catch {
      localStorage.removeItem('current_gallery_data');
    }

    if (!category) {
      const found = data.categories.find((c) => c.name === categoryName);
      if (found) category = { ...found, gallery: [...(found.gallery || [])].reverse() };
    }

    if (!category) {
      container.replaceChildren(this.buildEmptyState(`Categoria "${categoryName}" não encontrada.`));
      return;
    }

    const heading = document.querySelector('.cabecalho');
    if (heading) heading.textContent = `Galeria - ${text(category.name)}`;

    const images = (Array.isArray(category.gallery) ? category.gallery : [])
      .map((src) => safeImageSrc(src))
      .filter(Boolean);

    if (images.length === 0) {
      container.replaceChildren(this.buildEmptyState('Nenhuma imagem disponível para esta categoria.'));
      return;
    }

    container.replaceChildren(
      ...images.map((src, index) => {
        const item = document.createElement('div');
        item.className = 'gallery-item';

        const img = document.createElement('img');
        img.src = src;
        img.alt = `${text(category.name)} - Imagem ${index + 1}`;
        img.loading = 'lazy';
        item.appendChild(img);

        return item;
      })
    );
  }

  buildEmptyState(message) {
    const wrapper = document.createElement('div');
    wrapper.className = 'empty-state';
    wrapper.style.cssText = 'text-align: center; padding: 2rem;';

    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    paragraph.style.marginBottom = '1rem';
    wrapper.appendChild(paragraph);

    const back = document.createElement('button');
    back.className = 'btn';
    back.textContent = 'Voltar';
    back.addEventListener('click', () => window.history.back());
    wrapper.appendChild(back);

    return wrapper;
  }
}

export { UIManager };
