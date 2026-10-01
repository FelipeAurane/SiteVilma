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
  // Mídia do destaque central do hero. É o mesmo campo para foto e vídeo:
  // `tipo` diz qual dos dois é, porque a URL do /api/media é um id e não
  // tem extensão de onde deduzir.
  center: {
    media: '',
    tipo: ''
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
  services: [
    {
      name: 'Cardápio Digital & iFood',
      image: './img/p-burger.jpg',
      price: 'Sob Consulta',
      duration: '3 a 5 horas de ensaio',
      description: 'Fotografia gastronômica focada em aumentar a taxa de conversão em cardápios digitais, iFood e totens de autoatendimento. Fotos com iluminação que valorizam cores e apetite.',
      includes: [
        'Iluminação profissional de estúdio no seu estabelecimento',
        'Edição e tratamento refinado em alta resolução',
        'Arquivos padronizados e otimizados para delivery e web',
        'Entrega rápida em até 5 dias úteis'
      ]
    },
    {
      name: 'Editorial & Lançamento de Pratos',
      image: './img/p-massa.jpg',
      price: 'Sob Consulta',
      duration: '4 a 6 horas de produção',
      description: 'Ensaios conceituais e artísticos para menus sazonais, redes sociais e campanhas promocionais. Cenários compostos e direção criativa autoral.',
      includes: [
        'Planejamento de conceito visual e paleta de cores',
        'Cenografia e composição com adereços harmonizados',
        'Tratamento autoral de cores, texturas e brilho',
        'Versões em altíssima resolução para impressão e campanhas'
      ]
    },
    {
      name: 'Produção Culinária & Food Styling',
      image: './img/p-sobremesa.jpg',
      price: 'Sob Consulta',
      duration: 'Turno completo',
      description: 'Cuidado minucioso com cortes, brilho, texturas e frescor para despertar desejo imediato em quem vê. Ideal para marcas e docerias sofisticadas.',
      includes: [
        'Montagem e finalização de pratos e sobremesas no local',
        'Técnicas de valorização de textura e temperatura',
        'Composição harmoniosa de ingredientes e complementos',
        'Alinhamento direto com o chef durante os cliques'
      ]
    },
    {
      name: 'Ambiente & Experiência Gastronômica',
      image: './img/p-3.JPG',
      price: 'Sob Consulta',
      duration: '2 a 4 horas de sessão',
      description: 'Registros da energia do salão, arquitetura do espaço, cozinha show e momentos autênticos do atendimento para compor a presença institucional.',
      includes: [
        'Fotografia de arquitetura com iluminação ambiente equilibrada',
        'Bastidores da cozinha e finalização ao vivo',
        'Fotos institucionais da equipe em ação',
        'Acervo completo para redes sociais, Google e site'
      ]
    }
  ],
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

/**
 * Diz se a mídia do destaque central é vídeo. O painel grava o tipo junto
 * com a URL; quando ele falta (conteúdo antigo, digitado à mão), a
 * extensão do arquivo é o palpite — mas a URL do /api/media é um id puro,
 * então esse palpite só vale para caminhos com nome de arquivo.
 */
function isVideoMedia(src, tipo) {
  if (tipo === 'video') return true;
  if (tipo === 'imagem') return false;

  const caminho = String(src || '').split(/[?#]/)[0].toLowerCase();
  return /\.(mp4|webm|mov|m4v|ogv)$/.test(caminho);
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

// O conteúdo publicado tem duas formas: o servidor guarda version/lastUpdated
// dentro de `metadata`, e os saves do painel deixavam os dois no topo. Ler só
// um dos dois fazia o navegador novo concluir 0 contra 0, achar que não havia
// novidade e ficar mostrando o defaultData para sempre — inclusive as
// categorias que a dona tinha cadastrado.
function lerSeloPublicacao(data) {
  if (!data || typeof data !== 'object') return { version: 0, lastUpdated: 0 };

  const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};

  return {
    version: Number(data.version || meta.version) || 0,
    lastUpdated: Number(data.lastUpdated || meta.lastUpdated) || 0
  };
}

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
      // O que já está publicado e ainda não é conhecido aqui passa intacto.
      // Sem esta linha, salvar pelo painel apagava contact, settings, metadata
      // e qualquer chave que o site ganhasse depois deste arquivo.
      ...data,
      hero: { ...defaultData.hero, ...(data.hero || {}) },
      banner: { ...defaultData.banner, ...(data.banner || {}) },
      center: { ...defaultData.center, ...(data.center || {}) },
      categories: Array.isArray(data.categories) ? data.categories : defaultData.categories,
      services: Array.isArray(data.services) ? data.services : defaultData.services,
      ...lerSeloPublicacao(data)
    };
  }

  // Adota como base de edição um objeto que veio do servidor. O painel usa
  // para partir do mesmo formato normalizado que a página pública usa, senão
  // o próximo save contaria a versão a partir de zero e o site veria um
  // conteúdo mais "velho" do que o que já estava publicado.
  adopt(data) {
    this.currentData = this.validateData(data);
    return this.currentData;
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

export {
  DataManager,
  defaultData,
  safeImageSrc,
  isVideoMedia,
  whatsappUrl,
  text,
  lerSeloPublicacao,
  WHATSAPP_PADRAO
};
