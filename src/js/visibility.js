/**
 * Visibilidade dos blocos do site público.
 *
 * Cada bloco do HTML tem um data-tag. A configuração diz quais aparecem.
 * Ela vem do servidor, com cópia em localStorage para a página não piscar
 * enquanto a resposta não chega.
 */

import { getContent } from './api.js';

export const CACHE_KEY = 'siteVisibility';

export const defaultVisibility = {
  navbar: true,
  logo: true,
  'main-menu': true,
  'menu-inicio': true,
  'menu-galeria': true,
  'menu-sobre': true,
  'menu-servicos': true,
  'menu-duvidas': true,
  'menu-blok': false,
  'overlay-fundo': true,
  'hero-section': true,
  'title-name': true,
  subtitle: true,
  'hero-buttons': true,
  'next-section': true,
  'video-section': false,
  'cardapio-section': true,
  'cardapio-title': true,
  'cardapio-banner': true,
  'banner-title': true,
  'banner-subtitle': true,
  'banner-image': true,
  'cardapio-container': true,
  'sobre-section': true,
  'scroll-button': true,
  'footer-section': true
};

/** Mantém só as chaves conhecidas — o servidor não dita quais tags existem. */
export function normalize(config) {
  const normalized = { ...defaultVisibility };
  if (!config || typeof config !== 'object') return normalized;

  for (const key of Object.keys(defaultVisibility)) {
    if (typeof config[key] === 'boolean') normalized[key] = config[key];
  }
  return normalized;
}

export function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeCache(config) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(config));
  } catch {
    // Sem cache: só significa um piscar a mais no próximo carregamento.
  }
}

export function applyVisibility(config) {
  for (const [tag, visible] of Object.entries(config)) {
    for (const element of document.querySelectorAll(`[data-tag="${CSS.escape(tag)}"]`)) {
      element.style.display = visible ? '' : 'none';
    }
  }
}

export async function fetchVisibility() {
  try {
    return normalize(await getContent('visibility'));
  } catch {
    return null;
  }
}

/**
 * Aplica o cache na hora e conserta com o que vier do servidor.
 * Chamado pela entrada do site; o painel usa as funções acima direto.
 */
export async function initVisibility() {
  applyVisibility(readCache() || defaultVisibility);

  const remote = await fetchVisibility();
  if (remote) {
    writeCache(remote);
    applyVisibility(remote);
  }
}
