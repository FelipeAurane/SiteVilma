/**
 * Gerenciamento de dados do site.
 *
 * Lê do servidor (/api/content), guarda cópia em localStorage para
 * funcionar offline e notifica os listeners quando os dados mudam.
 */

import { getContent, putContent, uploadImage } from './api.js';

const CONFIG = {
  CACHE_KEY: 'vilma_fotografia_data',
  UPDATE_CHECK_INTERVAL: 60000
};

const WHATSAPP_PADRAO = '5581998370180';

const defaultData = {
  hero: {
    image: './img/capa.jpg',
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
    { name: 'Confeitaria', subtitle: 'Doces e sobremesas', image: './img/p-2.JPG', gallery: [] },
    { name: 'Gastronomia', subtitle: 'Pratos e menus', image: './img/p-6.JPG', gallery: [] },
    { name: 'Hambúrgueres', subtitle: 'Lanches e artesanais', image: './img/p-4.JPG', gallery: [] },
    { name: 'Pizzas', subtitle: 'Fornos e massas', image: './img/p-5.jpg', gallery: [] },
    { name: 'Bebidas', subtitle: 'Drinks e cafés', image: './img/p-7.jpg', gallery: [] },
    { name: 'Restaurantes', subtitle: 'Ambiente e equipe', image: './img/p-3.JPG', gallery: [] },
    { name: 'Produtos', subtitle: 'Embalagens e rótulos', image: './img/img1.jpg', gallery: [] },
    { name: 'Doces', subtitle: 'Bombons e trufas', image: './img/p-2.JPG', gallery: [] },
    { name: 'Outros trabalhos', subtitle: 'Projetos diversos', image: './img/vilma.jpg', gallery: [] }
  ],
  services: [],
  lastUpdated: 0,
  version: 0
};

// ----------------------------------------------------------- sanitização

function safeImageSrc(value, fallback = '') {
  if (typeof value !== 'string' || value.trim() === '') return fallback;

  const src = value.trim();
  if (src.startsWith('/api/media/')) return src;
  if (src.startsWith('./') || src.startsWith('../')) return src;
  if (src.startsWith('/') && !src.startsWith('//')) return src;

  return fallback;
}

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

export { DataManager, defaultData, safeImageSrc, whatsappUrl, text, WHATSAPP_PADRAO };
