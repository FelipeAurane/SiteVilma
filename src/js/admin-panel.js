/**
 * Painel de configuração (/config).
 *
 * Antes isto gravava só em localStorage, ou seja: a "configuração" existia
 * apenas no navegador de quem editava e o site público nunca via nada.
 * Agora grava no servidor, e o servidor só aceita com sessão de admin.
 */

import { exigirLogin } from './admin-auth.js';
import { putContent } from './api.js';
import {
  defaultVisibility,
  normalize,
  readCache,
  writeCache,
  applyVisibility,
  fetchVisibility
} from './visibility.js';

const GRUPOS = {
  'navigation-controls': [
    'navbar', 'logo', 'main-menu', 'menu-inicio', 'menu-galeria', 'menu-sobre',
    'menu-servicos', 'menu-duvidas', 'menu-blok', 'overlay-fundo'
  ],
  'hero-controls': ['hero-section', 'title-name', 'subtitle', 'hero-buttons', 'next-section'],
  'menu-controls': [
    'cardapio-section', 'cardapio-title', 'cardapio-banner', 'banner-title',
    'banner-subtitle', 'banner-image', 'cardapio-container'
  ],
  'other-controls': ['sobre-section', 'video-section', 'scroll-button', 'footer-section']
};

let config = { ...defaultVisibility };
let saveTimer = null;

// ---------------------------------------------------------------- avisos

function notificar(mensagem, tipo = 'success') {
  const aviso = document.createElement('div');
  aviso.className = `notification ${tipo} show`;
  aviso.textContent = mensagem;
  document.body.appendChild(aviso);

  setTimeout(() => {
    aviso.classList.remove('show');
    setTimeout(() => aviso.remove(), 300);
  }, 3000);
}

// --------------------------------------------------------------- gravação

/**
 * Agrupa cliques seguidos numa gravação só — mexer em seis interruptores
 * não precisa virar seis escritas no banco.
 */
function agendarGravacao() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await putContent('visibility', config);
      marcarSincronizado();
    } catch (error) {
      notificar(
        error.status === 401
          ? 'Sua sessão expirou. Recarregue a página e entre de novo.'
          : `Não foi possível salvar: ${error.message}`,
        'warning'
      );
    }
  }, 600);
}

function marcarSincronizado() {
  const campo = document.getElementById('syncTime');
  if (campo) campo.textContent = new Date().toLocaleTimeString('pt-BR');
}

function aplicarEAtualizar({ gravar = true } = {}) {
  writeCache(config);
  applyVisibility(config);
  atualizarEstatisticas();
  atualizarPreviaJson();
  if (gravar) agendarGravacao();
}

// ------------------------------------------------------------- interface

function atualizarEstatisticas() {
  const chaves = Object.keys(config);
  const visiveis = chaves.filter((k) => config[k]).length;

  const total = document.getElementById('totalElements');
  if (total) total.textContent = String(chaves.length);

  const visivel = document.getElementById('visibleElements');
  if (visivel) visivel.textContent = String(visiveis);

  const oculto = document.getElementById('hiddenElements');
  if (oculto) oculto.textContent = String(chaves.length - visiveis);

  const atualizado = document.getElementById('lastUpdate');
  if (atualizado) {
    atualizado.textContent = `Última atualização: ${new Date().toLocaleString('pt-BR')}`;
  }
}

function atualizarPreviaJson() {
  const campo = document.getElementById('jsonDisplay');
  if (campo) campo.textContent = JSON.stringify(config, null, 2);
}

function montarControles() {
  for (const [containerId, chaves] of Object.entries(GRUPOS)) {
    const container = document.getElementById(containerId);
    if (!container) continue;

    container.replaceChildren();

    for (const chave of chaves) {
      const item = document.createElement('div');
      item.className = 'config-item';
      item.dataset.tag = chave;

      const rotulo = document.createElement('span');
      rotulo.className = 'config-label';
      rotulo.textContent = chave.replace(/-/g, ' ').toUpperCase();
      item.appendChild(rotulo);

      const chaveSwitch = document.createElement('label');
      chaveSwitch.className = 'toggle-switch';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(config[chave]);
      input.addEventListener('change', () => {
        config[chave] = input.checked;
        aplicarEAtualizar();
        notificar(`${chave} ${input.checked ? 'ativado' : 'desativado'}`);
        aplicarFiltros();
      });
      chaveSwitch.appendChild(input);

      const slider = document.createElement('span');
      slider.className = 'slider';
      chaveSwitch.appendChild(slider);

      item.appendChild(chaveSwitch);
      container.appendChild(item);
    }
  }
}

function definirTodos(valor) {
  for (const chave of Object.keys(config)) config[chave] = valor;
  montarControles();
  aplicarEAtualizar();
  aplicarFiltros();
}

// ----------------------------------------------- ações da própria página

function aplicarFiltros() {
  const mostrarVisiveis = document.getElementById('filter-visible')?.checked ?? true;
  const mostrarOcultos = document.getElementById('filter-hidden')?.checked ?? true;

  for (const item of document.querySelectorAll('.config-item[data-tag]')) {
    const visivel = Boolean(config[item.dataset.tag]);
    const exibir = visivel ? mostrarVisiveis : mostrarOcultos;
    item.style.display = exibir ? '' : 'none';
  }
}

function barraLateral() {
  return document.querySelector('.sidebar');
}

function fecharBarraLateral() {
  barraLateral()?.classList.remove('open');
}

function alternarBarraLateral() {
  barraLateral()?.classList.toggle('open');
}

/**
 * No celular a barra abre por cima do conteúdo. Precisa de saída: toque no
 * fundo escurecido, toque num item, ou Esc.
 */
function ligarFechamentoDaBarra() {
  const barra = barraLateral();
  if (!barra) return;

  barra.addEventListener('click', (evento) => {
    // O fundo escuro é o ::after da própria barra, à direita dela.
    if (evento.clientX > barra.getBoundingClientRect().right) {
      fecharBarraLateral();
      return;
    }
    if (evento.target.closest('.nav-item')) fecharBarraLateral();
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') fecharBarraLateral();
  });
}

function irParaSecao(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  fecharBarraLateral();
}

// A página usa onclick/onchange no HTML, então estes precisam ser globais.
window.showAllElements = () => {
  definirTodos(true);
  notificar('Todos os elementos foram ativados');
};

window.hideAllElements = () => {
  definirTodos(false);
  notificar('Todos os elementos foram desativados', 'warning');
};

window.resetConfiguration = () => {
  config = { ...defaultVisibility };
  montarControles();
  aplicarEAtualizar();
  aplicarFiltros();
  notificar('Configuração voltou ao padrão');
};

window.applyFilters = aplicarFiltros;
window.toggleSidebar = alternarBarraLateral;
window.scrollToSection = irParaSecao;

// --------------------------------------------------------------- início

async function iniciar() {
  await exigirLogin();

  ligarFechamentoDaBarra();

  config = readCache() || { ...defaultVisibility };
  montarControles();
  aplicarEAtualizar({ gravar: false });

  const remoto = await fetchVisibility();
  if (remoto) {
    config = normalize(remoto);
    montarControles();
    aplicarEAtualizar({ gravar: false });
    marcarSincronizado();
  }

  aplicarFiltros();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
