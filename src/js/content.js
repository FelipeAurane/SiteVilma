/**
 * Camada de conteúdo do site.
 *
 * Lê do nosso servidor (/api/content), guarda uma cópia em localStorage para
 * funcionar offline e pinta a página. Substitui o antigo firebase.js.
 *
 * Nada aqui usa innerHTML com dado vindo do servidor: os elementos são
 * montados com createElement/textContent, então conteúdo malicioso vira
 * texto, nunca script.
 */

import { getContent, putContent, uploadImage } from './api.js';
import { initVisibility } from './visibility.js';

const CONFIG = {
  CACHE_KEY: 'vilma_fotografia_data',
  UPDATE_CHECK_INTERVAL: 60000
};

const WHATSAPP_PADRAO = '5581998370180';

/**
 * O que a página mostra enquanto o servidor não responde — e o que fica
 * no ar se o banco cair. São as categorias do projeto; as fotos entram
 * pelo painel e os cartões usam um fundo neutro até lá.
 */
const defaultData = {
  hero: {
    image: './img/capa.jpg',
    // Preenchido pelo painel. Tendo vídeo, ele substitui a imagem no hero
    // e a imagem vira o poster (o quadro mostrado antes de carregar).
    video: '',
    eyebrow: 'Fotografia Gastronômica',
    title: 'Vilma Silva',
    subtitle: 'Imagens que despertam o desejo e valorizam o seu produto.',
    button: {
      text: 'Solicitar Orçamento',
      whatsapp: WHATSAPP_PADRAO,
      message: 'Olá! Gostaria de solicitar um orçamento de fotografia.'
    }
  },
  banner: {
    image: './img/img1.jpg',
    title: 'Escolha a categoria e explore nossos trabalhos.',
    subtitle: '',
    titleScreen: 'Portfólio'
  },
  categories: [
    { name: 'Confeitaria', subtitle: 'Doces e sobremesas', image: '', gallery: [] },
    { name: 'Gastronomia', subtitle: 'Pratos e menus', image: '', gallery: [] },
    { name: 'Hambúrgueres', subtitle: 'Lanches e artesanais', image: '', gallery: [] },
    { name: 'Pizzas', subtitle: 'Fornos e massas', image: '', gallery: [] },
    { name: 'Bebidas', subtitle: 'Drinks e cafés', image: '', gallery: [] },
    { name: 'Restaurantes', subtitle: 'Ambiente e equipe', image: '', gallery: [] },
    { name: 'Produtos', subtitle: 'Embalagens e rótulos', image: '', gallery: [] },
    { name: 'Doces', subtitle: 'Bombons e trufas', image: '', gallery: [] },
    { name: 'Outros trabalhos', subtitle: 'Projetos diversos', image: '', gallery: [] }
  ],
  services: [],
  lastUpdated: 0,
  version: 0
};

// ----------------------------------------------------------- sanitização

/**
 * Só deixa passar imagem de onde a gente controla: caminho relativo do
 * próprio site ou o nosso endpoint de mídia. Corta data:, javascript: e
 * qualquer host de terceiro.
 */
function safeImageSrc(value, fallback = '') {
  if (typeof value !== 'string' || value.trim() === '') return fallback;

  const src = value.trim();
  if (src.startsWith('/api/media/')) return src;
  if (src.startsWith('./') || src.startsWith('../')) return src;
  if (src.startsWith('/') && !src.startsWith('//')) return src;

  return fallback;
}

/** Número de WhatsApp: só dígitos. */
function safePhone(value) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function whatsappUrl(phone, message) {
  const number = safePhone(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(String(message || ''))}`;
}

function text(value, fallback = '') {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

// --------------------------------------------------------------- dados

class DataManager {
  constructor() {
    this.currentData = null;
    this.listeners = [];
    this.isOnline = navigator.onLine;
    this.isInitialized = false;
    this.pollTimer = null;

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.checkForUpdates();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  subscribe(callback) {
    this.listeners.push(callback);
    if (this.currentData) callback(this.currentData);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  notifyListeners(data) {
    for (const callback of this.listeners) {
      try {
        callback(data);
      } catch (error) {
        console.error('Erro ao atualizar a página:', error);
      }
    }
  }

  getLocalData() {
    try {
      const raw = localStorage.getItem(CONFIG.CACHE_KEY);
      return raw ? this.validateData(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  saveLocalData(data) {
    try {
      localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(data));
    } catch {
      // Cota cheia ou modo privativo: a página funciona igual, só sem cache.
    }
    return data;
  }

  validateData(data) {
    if (!data || typeof data !== 'object') return { ...defaultData };

    return {
      hero: { ...defaultData.hero, ...(data.hero || {}) },
      banner: { ...defaultData.banner, ...(data.banner || {}) },
      categories: Array.isArray(data.categories) ? data.categories : defaultData.categories,
      services: Array.isArray(data.services) ? data.services : defaultData.services,
      lastUpdated: Number(data.lastUpdated) || 0,
      version: Number(data.version) || 0
    };
  }

  async fetchSiteData() {
    if (!this.isOnline) return null;

    try {
      const content = await getContent('siteData');
      return content ? this.validateData(content) : null;
    } catch (error) {
      console.error('Não foi possível buscar o conteúdo:', error.message);
      return null;
    }
  }

  async checkForUpdates() {
    const remote = await this.fetchSiteData();
    if (!remote) return;

    const current = this.currentData || this.getLocalData();
    const changed =
      !current ||
      remote.version > current.version ||
      remote.lastUpdated > current.lastUpdated;

    if (changed) {
      this.currentData = remote;
      this.saveLocalData(remote);
      this.notifyListeners(remote);
    }
  }

  async initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Pinta imediatamente com o que já está em cache, depois confere online.
    this.currentData = this.getLocalData() || { ...defaultData };
    this.notifyListeners(this.currentData);

    await this.checkForUpdates();

    if (!this.pollTimer) {
      this.pollTimer = setInterval(() => this.checkForUpdates(), CONFIG.UPDATE_CHECK_INTERVAL);
    }
  }

  getCurrentData() {
    return this.currentData || this.getLocalData() || { ...defaultData };
  }

  async save(patch) {
    const current = this.getCurrentData();
    const updated = {
      ...current,
      ...patch,
      lastUpdated: Date.now(),
      version: (current.version || 0) + 1
    };

    await putContent('siteData', updated);

    this.currentData = updated;
    this.saveLocalData(updated);
    this.notifyListeners(updated);
    return updated;
  }

  async updateBanner(file, title, subtitle, titleScreen) {
    const current = this.getCurrentData();
    const image = file ? await uploadImage(file) : current.banner.image;

    return this.save({
      banner: {
        image,
        title: text(title),
        subtitle: text(subtitle),
        titleScreen: text(titleScreen)
      }
    });
  }
}

// -------------------------------------------------------------- página

class UIManager {
  constructor(dataManager) {
    this.dataManager = dataManager;
  }

  initialize() {
    // Splash, gaveta, cabeçalho e rolagem são de scripts.js — aqui só dado.
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
  }

  /**
   * A mídia do hero é imagem ou vídeo, conforme o que estiver salvo.
   *
   * Só troca o elemento quando a fonte muda de verdade: remontar a cada
   * consulta faria o vídeo voltar ao começo a cada minuto.
   */
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

    // Tira só a mídia antiga; o véu é recolocado no fim.
    for (const antigo of container.querySelectorAll('img, video')) antigo.remove();

    let elemento;

    if (video) {
      elemento = document.createElement('video');
      elemento.src = video;
      elemento.autoplay = true;
      elemento.loop = true;
      elemento.playsInline = true;
      // Sem mudo o navegador bloqueia o autoplay.
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
    if (veu) container.appendChild(veu);
  }

  /**
   * Os dois botões de orçamento (hero e cabeçalho) levam ao mesmo WhatsApp.
   * O texto vai no <span>, não no botão, para não apagar o ícone SVG.
   */
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
    const container = document.getElementById('next-section');
    if (!container) return;

    const heading = document.querySelector('.cabecalhoOne');
    if (heading) heading.textContent = text(data.banner.titleScreen, 'Serviços');

    container.replaceChildren();

    if (!Array.isArray(data.services) || data.services.length === 0) {
      container.appendChild(this.buildEmptyState('Nenhum serviço disponível no momento.'));
      return;
    }

    for (const service of data.services) {
      container.appendChild(this.buildServiceCard(service));
    }
  }

  buildServiceCard(service) {
    const card = document.createElement('div');
    card.className = 'service-item';

    const imageWrap = document.createElement('div');
    imageWrap.className = 'service-image-placeholder';

    const src = safeImageSrc(service.image);
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = text(service.name, 'Serviço');
      img.loading = 'lazy';
      img.addEventListener('error', () => img.remove());
      imageWrap.appendChild(img);
    }
    card.appendChild(imageWrap);

    if (service.price) {
      const price = document.createElement('p');
      price.className = 'service-price';
      price.textContent = text(service.price);
      card.appendChild(price);
    }

    const name = document.createElement('h3');
    name.textContent = text(service.name);
    card.appendChild(name);

    const description = document.createElement('p');
    description.className = 'service-description';
    description.textContent = text(service.description);
    card.appendChild(description);

    const url = whatsappUrl(service.whatsapp, service.whatsappMessage);
    if (url) {
      const button = document.createElement('button');
      button.className = 'btn whatsapp-btn';
      button.textContent = 'WhatsApp';
      button.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
      card.appendChild(button);
    }

    return card;
  }

  /**
   * A grade de colunas é do CSS — aqui só entram os cartões, na ordem.
   * Sem foto, o cartão fica com o fundo neutro definido no CSS.
   */
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

const dataManager = new DataManager();
const uiManager = new UIManager(dataManager);

document.addEventListener('DOMContentLoaded', async () => {
  try {
    uiManager.initialize();
    // Visibilidade e conteúdo são independentes: um travar não pode
    // impedir o outro de pintar a página.
    await Promise.allSettled([initVisibility(), dataManager.initialize()]);
  } catch (error) {
    console.error('Erro ao iniciar a página:', error);
  }
});

export { dataManager, uiManager, defaultData, safeImageSrc, whatsappUrl };
