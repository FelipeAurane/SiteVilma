/**
 * Admin Panel v2 - Vilma Fotografia
 * Adaptado do painel de referência (E:\panel_admin) para usar nossa API Express
 * Substitui Firebase por chamadas para /api/content e /api/media
 */

import { exigirLogin, fazerLogout } from '/admin/js/auth.js';
import { getContent, putContent, uploadImage, uploadMedia, LIMITE_VIDEO_BYTES } from '/js/api.js';
import { registraArquivos, aoEntrarEmArquivos } from './arquivos.js';
import { DataManager, defaultData, safeImageSrc, isVideoMedia } from '/js/dataManager.js';
import { defaultVisibility, readCache, writeCache, applyVisibility, fetchVisibility } from '/js/visibility.js';

// ============================================================================
// ESTADO GLOBAL
// ============================================================================

let currentData = { ...defaultData };
let categories = [];
let services = [];
let faqs = [];
let availableDates = {};
let visibilidade = { ...defaultVisibility };
let editIndex = -1; // Para saber se estamos editando ou criando
let currentEditType = ''; // 'category', 'service', 'faq', 'date'

const dataManager = new DataManager();

// DOM Elements
// O painel chama $ com seletor de CSS ("#hero-titulo"). Alguns utilitários
// repassam o id sem o "#" (ex.: setupImageUpload recebe 'hero-image-input'),
// então o "#" é acrescentado quando faltar. Sem isso, $("#hero-titulo") virava
// getElementById('#hero-titulo') — sempre null, e o painel não pintava nada.
// O "#" só entra em id puro: seletor já qualificado (".menu-content",
// ".screen.active", "[data-x]") é repassado como está, senão virava
// "#.menu-content" e o querySelector lançava SyntaxError.
const $ = (seletor) => {
  if (typeof seletor !== 'string') return null;
  const s = seletor.trim();
  if (s === '') return null;
  const jaQualificado = /^[.#\[:*[]/.test(s) || /[\s>+~]/.test(s);
  return document.querySelector(jaQualificado ? s : `#${s}`);
};
const $$ = (selector) => document.querySelectorAll(selector);

/**
 * Caminho de mídia pronto para o painel.
 *
 * O conteúdo guarda caminhos relativos à raiz do site ("./img/capa.jpg",
 * "../img/pizza.jpg"), porque o site é servido em "/". O painel mora em
 * "/admin/", e o navegador resolveria esses valores contra "/admin/img/..."
 * — 404 em toda pré-visualização. Aqui o caminho é ancorado na raiz ("/img/
 * capa.jpg"), que é onde os arquivos realmente estão. Caminhos já absolutos
 * (inclusive /api/media/...) passam direto pela sanitização do dataManager.
 */
function srcDoSite(valor, fallback = '') {
  const src = safeImageSrc(valor, fallback);
  if (!src) return '';

  if (src.startsWith('./')) return `/${src.slice(2)}`;
  if (src.startsWith('../')) return `/${src.replace(/^(\.\.\/)+/, '')}`;

  return src;
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

function showNotification(message, type = 'info') {
  const container = $('#notifications');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');

  const icons = {
    success: 'checkmark-circle-outline',
    error: 'close-circle-outline',
    warning: 'alert-circle-outline',
    info: 'information-circle-outline'
  };

  toast.innerHTML = `
    <div class="column">
      <ion-icon name="${icons[type] || icons.info}"></ion-icon>
      <span>${message}</span>
    </div>
    <button class="close-toast" aria-label="Fechar">
      <ion-icon name="close-outline"></ion-icon>
    </button>
  `;

  toast.querySelector('.close-toast').addEventListener('click', () => hideToast(toast));
  container.appendChild(toast);

  // Auto-hide after 5 seconds
  setTimeout(() => hideToast(toast), 5000);
}

function hideToast(toast) {
  toast.classList.add('hide');
  setTimeout(() => toast.remove(), 300);
}

function showLoader(message = 'Carregando...', progress = 'Conectando ao servidor...') {
  const loader = $('#preloader');
  if (loader) {
    $('#preloader-message').textContent = message;
    $('#preloader-progress').textContent = progress;
    loader.style.display = 'flex';
  }
}

function hideLoader() {
  const loader = $('#preloader');
  if (loader) loader.style.display = 'none';
}

function formatDateBR(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

function generateId(prefix = 'item') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// IMAGE UPLOAD HANDLING
// ============================================================================

function setupImageUpload(uploadArea, inputId, previewId, onUpload) {
  const input = $(inputId) || uploadArea?.querySelector('input[type="file"]');
  const preview = $(previewId);
  if (!input || !uploadArea) return;

  uploadArea.addEventListener('click', () => input.click());

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (files.length > 0) handleImageUpload(files[0], uploadArea, preview, onUpload);
  });

  input.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleImageUpload(e.target.files[0], uploadArea, preview, onUpload);
  });
}

async function handleImageUpload(file, uploadArea, preview, onUpload) {
  const progressBar = uploadArea?.querySelector('.upload-progress-bar');
  const progress = uploadArea?.querySelector('.upload-progress');
  if (!progress || !progressBar || !uploadArea) return;

  try {
    progress.style.display = 'block';
    progressBar.style.width = '0%';

    const progressInterval = setInterval(() => {
      const currentWidth = parseInt(progressBar.style.width) || 0;
      if (currentWidth < 90) progressBar.style.width = (currentWidth + 10) + '%';
    }, 200);

    let result;
    if (file.type.startsWith('video/')) {
      result = await uploadMedia(file);
    } else {
      result = { url: await uploadImage(file), tipo: 'image' };
    }

    clearInterval(progressInterval);
    progressBar.style.width = '100%';

    if (preview) {
      if (file.type.startsWith('video/')) {
        preview.src = result.url;
        preview.style.display = 'block';
      } else {
        preview.src = result.url;
        preview.style.display = 'block';
      }
    }

    setTimeout(() => {
      progress.style.display = 'none';
      progressBar.style.width = '0%';
    }, 1000);

    if (onUpload) onUpload(result);
    showNotification('Mídia enviada com sucesso!', 'success');
  } catch (error) {
    console.error('Upload falhou:', error);
    showNotification(error.message || 'Erro ao enviar mídia', 'error');
    progress.style.display = 'none';
    progressBar.style.width = '0%';
  }
}

async function handleGalleryUpload(files, containerId, onUpload) {
  const container = $(containerId);
  if (!container) return;

  try {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const result = await uploadImage(file);
      const img = document.createElement('img');
      img.src = result.url;
      img.alt = 'Galeria';
      const wrapper = document.createElement('div');
      wrapper.className = 'gallery-item';
      wrapper.innerHTML = `<img src="${result.url}" alt="Galeria"><button class="remove-btn" data-url="${result.url}"><ion-icon name="close-circle-outline"></ion-icon></button>`;
      wrapper.querySelector('.remove-btn').addEventListener('click', () => {
        wrapper.remove();
        // TODO: remover do storage se necessário
      });
      container.appendChild(wrapper);
    }
    if (onUpload) onUpload();
    showNotification(`${files.length} imagem(ns) adicionada(s)`, 'success');
  } catch (error) {
    showNotification('Erro ao enviar imagens da galeria', 'error');
  }
}

// ============================================================================
// DATA LOADING & SAVING
// ============================================================================

async function loadAllData() {
  showLoader('Carregando dados...', 'Buscando conteúdo do servidor...');

  try {
    // Carregar siteData (hero, banner, center, categories, services)
    const siteData = await getContent('siteData');
    if (siteData && typeof siteData === 'object') {
      currentData = { ...defaultData, ...siteData };
      dataManager.adopt(currentData);
    }

    categories = (currentData.categories || []).map(c => ({ ...c }));
    services = (currentData.services || []).map(s => ({ ...s }));

    // Carregar FAQs
    const faqsData = await getContent('faqs');
    faqs = Array.isArray(faqsData) ? faqsData : [];

    // Carregar datas disponíveis
    const datesData = await getContent('availableDates');
    availableDates = datesData && typeof datesData === 'object' ? { ...datesData } : {};

    // Carregar visibilidade
    const visData = await fetchVisibility();
    visibilidade = visData || readCache() || { ...defaultVisibility };
    writeCache(visibilidade);
    applyVisibility(visibilidade);

    populateAllForms();
    updateDashboardStats();
    renderCategories();
    renderServices();
    renderFAQs();
    renderCalendar();
    marcaStatus(true);

    showNotification('Dados carregados com sucesso!', 'success');
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
    marcaStatus(false);
    showNotification('Erro ao carregar dados. Usando padrão.', 'error');
    populateAllForms();
    updateDashboardStats();
    renderCategories();
    renderServices();
    renderFAQs();
    renderCalendar();
  } finally {
    hideLoader();
  }
}

function populateAllForms() {
  // Hero
  const hero = currentData.hero || defaultData.hero;
  const button = hero.button || defaultData.hero.button;
  $('#hero-titulo').value = hero.title || '';
  $('#hero-subtitulo').value = hero.subtitle || '';
  $('#hero-etiqueta').value = hero.eyebrow || '';
  $('#botao-texto').value = button.text || '';
  $('#botao-whatsapp').value = button.whatsapp || '';
  $('#botao-mensagem').value = button.message || '';

  // Hero preview
  const heroPreview = $('#hero-image-preview');
  const heroVideoPreview = $('#hero-video-preview');
  if (hero.video) {
    heroVideoPreview.src = srcDoSite(hero.video);
    heroVideoPreview.style.display = 'block';
    heroPreview.style.display = 'none';
  } else if (hero.image) {
    heroPreview.src = srcDoSite(hero.image, defaultData.hero.image);
    heroPreview.style.display = 'block';
    heroVideoPreview.style.display = 'none';
  } else {
    heroPreview.style.display = 'none';
    heroVideoPreview.style.display = 'none';
  }

  // Banner
  const banner = currentData.banner || defaultData.banner;
  $('#banner-titulo-tela').value = banner.titleScreen || '';
  $('#banner-titulo').value = banner.title || '';
  $('#banner-subtitulo').value = banner.subtitle || '';

  const bannerPreview = $('#banner-image-preview');
  if (banner.image) {
    bannerPreview.src = srcDoSite(banner.image, defaultData.banner.image);
    bannerPreview.style.display = 'block';
  } else {
    bannerPreview.style.display = 'none';
  }

  // Theme
  const theme = currentData.settings?.theme || defaultData.settings.theme;
  // Padrões = paleta de src/css/site.css (creme sobre preto). O amarelo
  // #ffc60b que estava aqui era herança do painel de pilotagem de referência.
  $('#theme-primary-color').value = theme.primaryColor || '#f6f3ee';
  $('#theme-secondary-color').value = theme.secondaryColor || '#0e0e10';
  $('#theme-font').value = theme.font || 'Inter';
  $('#enable-services').checked = currentData.settings?.features?.enableServices ?? true;
  $('#enable-faqs').checked = currentData.settings?.features?.enableFaqs ?? true;
  $('#enable-splash').checked = currentData.settings?.features?.enableSplash ?? true;
}

async function saveHeroAndBanner() {
  const btn = $('#save-hero-btn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spinner"></span> Salvando...';

  try {
    const hero = currentData.hero || defaultData.hero;
    const banner = currentData.banner || defaultData.banner;
    const center = currentData.center || defaultData.center;

    // Upload hero media if selected
    const heroInput = $('#hero-image-input');
    let heroImage = hero.image;
    let heroVideo = hero.video;
    if (heroInput.files?.[0]) {
      const file = heroInput.files[0];
      if (file.type.startsWith('video/')) {
        const result = await uploadMedia(file);
        heroVideo = result.url;
      } else {
        heroImage = await uploadImage(file);
        heroVideo = '';
      }
      heroInput.value = '';
    }

    // Upload banner image if selected
    const bannerInput = $('#banner-image-input');
    let bannerImage = banner.image;
    if (bannerInput.files?.[0]) {
      bannerImage = await uploadImage(bannerInput.files[0]);
      bannerInput.value = '';
    }

    // Upload center media if selected
    const centerInput = $('#center-arquivo');
    let centerMedia = center.media;
    let centerTipo = center.tipo;
    if (centerInput.files?.[0]) {
      const result = await uploadMedia(centerInput.files[0]);
      centerMedia = result.url;
      centerTipo = result.tipo;
      centerInput.value = '';
    }

    const updatedData = await dataManager.save({
      hero: {
        ...hero,
        image: heroImage,
        video: heroVideo,
        eyebrow: $('#hero-etiqueta').value.trim(),
        title: $('#hero-titulo').value.trim(),
        subtitle: $('#hero-subtitulo').value.trim(),
        button: {
          ...hero.button,
          text: $('#botao-texto').value.trim(),
          whatsapp: $('#botao-whatsapp').value.replace(/\D/g, ''),
          message: $('#botao-mensagem').value.trim()
        }
      },
      banner: {
        ...banner,
        image: bannerImage,
        titleScreen: $('#banner-titulo-tela').value.trim(),
        title: $('#banner-titulo').value.trim(),
        subtitle: $('#banner-subtitulo').value.trim()
      },
      center: {
        media: centerMedia,
        tipo: centerTipo
      }
    });

    currentData = { ...currentData, ...updatedData };
    populateAllForms();
    updateDashboardStats();
    showNotification('Hero e Banner salvos com sucesso!', 'success');
  } catch (error) {
    console.error('Erro ao salvar hero/banner:', error);
    showNotification('Erro ao salvar: ' + error.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function saveTheme() {
  const btn = $('#save-theme-btn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spinner"></span> Salvando...';

  try {
    await dataManager.save({
      settings: {
        theme: {
          primaryColor: $('#theme-primary-color').value,
          secondaryColor: $('#theme-secondary-color').value,
          font: $('#theme-font').value
        },
        features: {
          enableServices: $('#enable-services').checked,
          enableFaqs: $('#enable-faqs').checked,
          enableSplash: $('#enable-splash').checked
        }
      }
    });
    showNotification('Tema salvo com sucesso!', 'success');
    applyTheme();
  } catch (error) {
    showNotification('Erro ao salvar tema', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

function applyTheme() {
  const root = document.documentElement;
  root.style.setProperty('--accent-primary', $('#theme-primary-color').value);
  root.style.setProperty('--bg-secondary', $('#theme-secondary-color').value);
  root.style.setProperty('--font-family', `'${$('#theme-font').value}', sans-serif`);
}

// ============================================================================
// CATEGORIAS
// ============================================================================

function renderCategories() {
  const container = $('#categories-container');
  if (!container) return;

  container.innerHTML = '';

  if (categories.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <ion-icon name="folder-open-outline"></ion-icon>
        <h3>Nenhuma categoria criada</h3>
        <p>Clique no botão "Nova Categoria" para adicionar sua primeira categoria</p>
      </div>
    `;
    return;
  }

  categories.forEach((category, index) => {
    const div = document.createElement('div');
    div.className = 'category-item';
    div.dataset.index = index;
    div.innerHTML = `
      <div class="category-header">
        <h3>${category.name || 'Nova Categoria'}</h3>
        <div style="display: flex; gap: 8px;">
          <button class="btn-icon" onclick="editCategory(${index})" title="Editar">
            <ion-icon name="create-outline"></ion-icon>
          </button>
          <button class="btn-icon" onclick="deleteCategory(${index})" title="Excluir">
            <ion-icon name="trash-outline"></ion-icon>
          </button>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 16px;">
        <div class="form-group" style="margin-bottom: 0;">
          <label>Nome</label>
          <input type="text" class="form-control" value="${category.name || ''}" readonly>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label>Subtítulo</label>
          <input type="text" class="form-control" value="${category.subtitle || ''}" readonly>
        </div>
      </div>
      ${category.image ? `
        <div style="margin-bottom: 12px;">
          <label>Imagem Principal</label>
          <img src="${srcDoSite(category.image)}" class="image-preview" style="max-width: 300px;">
        </div>
      ` : ''}
      ${category.gallery && category.gallery.length > 0 ? `
        <div>
          <label>Galeria (${category.gallery.length} imagens)</label>
          <div class="gallery-grid">
            ${category.gallery.map((img, i) => `
              <div class="gallery-item">
                <img src="${srcDoSite(img)}" alt="Galeria ${i+1}">
                <button class="remove-btn" onclick="removeGalleryImage(${index}, ${i})"><ion-icon name="close-circle-outline"></ion-icon></button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
    container.appendChild(div);
  });
}

function openCategoryModal(index = -1) {
  editIndex = index;
  currentEditType = 'category';
  const modal = $('#modal-category');

  if (index >= 0 && categories[index]) {
    const cat = categories[index];
    $('#cat-name').value = cat.name || '';
    $('#cat-subtitle').value = cat.subtitle || '';
    $('#cat-description').value = cat.description || '';
    $('#cat-edit-index').value = index;

    const preview = $('#cat-image-preview');
    if (cat.image) {
      preview.src = srcDoSite(cat.image);
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }

    const galleryPreview = $('#cat-gallery-preview');
    galleryPreview.innerHTML = '';
    if (cat.gallery) {
      cat.gallery.forEach((img, i) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'gallery-item';
        wrapper.innerHTML = `<img src="${srcDoSite(img)}" alt="Galeria ${i+1}"><button class="remove-btn" data-index="${i}"><ion-icon name="close-circle-outline"></ion-icon></button>`;
        wrapper.querySelector('.remove-btn').addEventListener('click', () => {
          cat.gallery.splice(i, 1);
          wrapper.remove();
        });
        galleryPreview.appendChild(wrapper);
      });
    }
  } else {
    $('#cat-name').value = '';
    $('#cat-subtitle').value = '';
    $('#cat-description').value = '';
    $('#cat-edit-index').value = -1;
    $('#cat-image-preview').style.display = 'none';
    $('#cat-gallery-preview').innerHTML = '';
    $('#cat-image-input').value = '';
    $('#cat-gallery-input').value = '';
  }

  modal.style.display = 'flex';
  $('#modalOverlay').classList.add('active');
  $('#cat-name').focus();
}

function closeCategoryModal() {
  $('#modal-category').style.display = 'none';
  $('#modalOverlay').classList.remove('active');
  editIndex = -1;
}

async function saveCategory(e) {
  e.preventDefault();
  const index = parseInt($('#cat-edit-index').value);
  const name = $('#cat-name').value.trim();
  const subtitle = $('#cat-subtitle').value.trim();
  const description = $('#cat-description').value.trim();

  if (!name) {
    showNotification('Nome da categoria é obrigatório', 'error');
    return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    let image = '';
    const imageInput = $('#cat-image-input');
    if (imageInput.files?.[0]) {
      image = await uploadImage(imageInput.files[0]);
    } else if (index >= 0 && categories[index]) {
      image = categories[index].image || '';
    }

    let gallery = [];
    if (index >= 0 && categories[index]) {
      gallery = categories[index].gallery || [];
    }
    // Adicionar imagens da galeria do modal
    const galleryPreview = $('#cat-gallery-preview');
    galleryPreview.querySelectorAll('.gallery-item img').forEach(img => {
      gallery.push(img.src);
    });

    const categoryData = {
      id: index >= 0 ? categories[index].id : generateId('cat'),
      name,
      subtitle,
      description,
      image,
      gallery,
      featured: index >= 0 ? categories[index].featured : false,
      order: index >= 0 ? categories[index].order : categories.length + 1
    };

    if (index >= 0) {
      categories[index] = categoryData;
    } else {
      categories.push(categoryData);
    }

    await dataManager.save({ categories });
    closeCategoryModal();
    renderCategories();
    updateDashboardStats();
    showNotification('Categoria salva com sucesso!', 'success');
  } catch (error) {
    showNotification('Erro ao salvar categoria', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function editCategory(index) {
  openCategoryModal(index);
}

function deleteCategory(index) {
  if (confirm('Tem certeza que deseja excluir esta categoria?')) {
    categories.splice(index, 1);
    dataManager.save({ categories });
    renderCategories();
    updateDashboardStats();
    showNotification('Categoria excluída', 'success');
  }
}

function removeGalleryImage(catIndex, imgIndex) {
  if (categories[catIndex] && categories[catIndex].gallery) {
    categories[catIndex].gallery.splice(imgIndex, 1);
    dataManager.save({ categories });
    renderCategories();
    showNotification('Imagem removida da galeria', 'info');
  }
}

// ============================================================================
// SERVIÇOS
// ============================================================================

function renderServices() {
  const container = $('#services-container');
  if (!container) return;

  container.innerHTML = '';

  if (services.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <ion-icon name="briefcase-outline"></ion-icon>
        <h3>Nenhum serviço criado</h3>
        <p>Clique no botão "Novo Serviço" para adicionar seu primeiro serviço</p>
      </div>
    `;
    return;
  }

  services.forEach((service, index) => {
    const div = document.createElement('div');
    div.className = 'service-item';
    div.dataset.index = index;
    div.innerHTML = `
      <div class="service-header">
        <h3>${service.name || 'Novo Serviço'}</h3>
        <div style="display: flex; gap: 8px;">
          <button class="btn-icon" onclick="editService(${index})" title="Editar">
            <ion-icon name="create-outline"></ion-icon>
          </button>
          <button class="btn-icon" onclick="deleteService(${index})" title="Excluir">
            <ion-icon name="trash-outline"></ion-icon>
          </button>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 16px;">
        <div class="form-group" style="margin-bottom: 0;">
          <label>Nome</label>
          <input type="text" class="form-control" value="${service.name || ''}" readonly>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label>Preço</label>
          <input type="text" class="form-control" value="R$ ${service.price || '0,00'}" readonly>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label>Duração</label>
          <input type="text" class="form-control" value="${service.duration || ''}" readonly>
        </div>
      </div>
      ${service.image ? `
        <div style="margin-bottom: 12px;">
          <label>Imagem</label>
          <img src="${srcDoSite(service.image)}" class="image-preview" style="max-width: 300px;">
        </div>
      ` : ''}
      <div class="form-group" style="margin-bottom: 0;">
        <label>Descrição</label>
        <textarea class="form-control" readonly rows="2">${service.description || ''}</textarea>
      </div>
    `;
    container.appendChild(div);
  });
}

function openServiceModal(index = -1) {
  editIndex = index;
  currentEditType = 'service';
  const modal = $('#modal-service');

  if (index >= 0 && services[index]) {
    const svc = services[index];
    $('#service-name').value = svc.name || '';
    $('#service-price').value = svc.price || '';
    $('#service-duration').value = svc.duration || '';
    $('#service-description').value = svc.description || '';
    $('#service-includes').value = svc.includes || '';
    $('#service-whatsapp').value = svc.whatsapp || '';
    $('#service-whatsapp-message').value = svc.whatsappMessage || '';
    $('#service-edit-index').value = index;

    const preview = $('#service-image-preview');
    if (svc.image) {
      preview.src = srcDoSite(svc.image);
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }
  } else {
    $('#service-name').value = '';
    $('#service-price').value = '';
    $('#service-duration').value = '';
    $('#service-description').value = '';
    $('#service-includes').value = '';
    $('#service-whatsapp').value = '';
    $('#service-whatsapp-message').value = '';
    $('#service-edit-index').value = -1;
    $('#service-image-preview').style.display = 'none';
    $('#service-image-input').value = '';
  }

  modal.style.display = 'flex';
  $('#modalOverlay').classList.add('active');
  $('#service-name').focus();
}

function closeServiceModal() {
  $('#modal-service').style.display = 'none';
  $('#modalOverlay').classList.remove('active');
  editIndex = -1;
}

async function saveService(e) {
  e.preventDefault();
  const index = parseInt($('#service-edit-index').value);
  const name = $('#service-name').value.trim();
  const price = $('#service-price').value.trim();
  const duration = $('#service-duration').value.trim();
  const description = $('#service-description').value.trim();
  const includes = $('#service-includes').value.trim();
  const whatsapp = $('#service-whatsapp').value.replace(/\D/g, '');
  const whatsappMessage = $('#service-whatsapp-message').value.trim();

  if (!name) {
    showNotification('Nome do serviço é obrigatório', 'error');
    return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    let image = '';
    const imageInput = $('#service-image-input');
    if (imageInput.files?.[0]) {
      image = await uploadImage(imageInput.files[0]);
    } else if (index >= 0 && services[index]) {
      image = services[index].image || '';
    }

    const serviceData = {
      id: index >= 0 ? services[index].id : generateId('svc'),
      name,
      price,
      duration,
      description,
      includes,
      whatsapp,
      whatsappMessage,
      image
    };

    if (index >= 0) {
      services[index] = serviceData;
    } else {
      services.push(serviceData);
    }

    await dataManager.save({ services });
    closeServiceModal();
    renderServices();
    updateDashboardStats();
    showNotification('Serviço salvo com sucesso!', 'success');
  } catch (error) {
    showNotification('Erro ao salvar serviço', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function editService(index) {
  openServiceModal(index);
}

function deleteService(index) {
  if (confirm('Tem certeza que deseja excluir este serviço?')) {
    services.splice(index, 1);
    dataManager.save({ services });
    renderServices();
    updateDashboardStats();
    showNotification('Serviço excluído', 'success');
  }
}

// ============================================================================
// FAQs
// ============================================================================

function renderFAQs() {
  const container = $('#faqs-container');
  if (!container) return;

  container.innerHTML = '';

  if (faqs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <ion-icon name="help-circle-outline"></ion-icon>
        <h3>Nenhuma dúvida criada</h3>
        <p>Clique no botão "Nova Dúvida" para adicionar sua primeira pergunta</p>
      </div>
    `;
    return;
  }

  faqs.forEach((faq, index) => {
    const div = document.createElement('div');
    div.className = 'faq-item';
    div.dataset.index = index;
    div.innerHTML = `
      <div class="faq-header">
        <h3>${faq.question || 'Nova Dúvida'}</h3>
        <div style="display: flex; gap: 8px;">
          <button class="btn-icon" onclick="editFAQ(${index})" title="Editar">
            <ion-icon name="create-outline"></ion-icon>
          </button>
          <button class="btn-icon" onclick="deleteFAQ(${index})" title="Excluir">
            <ion-icon name="trash-outline"></ion-icon>
          </button>
        </div>
      </div>
      <div class="form-group" style="margin-bottom: 0;">
        <label>Resposta</label>
        <textarea class="form-control" readonly rows="3">${faq.answer || ''}</textarea>
      </div>
    `;
    container.appendChild(div);
  });
}

function openFAQModal(index = -1) {
  editIndex = index;
  currentEditType = 'faq';
  const modal = $('#modal-faq');

  if (index >= 0 && faqs[index]) {
    $('#faq-question').value = faqs[index].question || '';
    $('#faq-answer').value = faqs[index].answer || '';
    $('#faq-edit-index').value = index;
  } else {
    $('#faq-question').value = '';
    $('#faq-answer').value = '';
    $('#faq-edit-index').value = -1;
  }

  modal.style.display = 'flex';
  $('#modalOverlay').classList.add('active');
  $('#faq-question').focus();
}

function closeFAQModal() {
  $('#modal-faq').style.display = 'none';
  $('#modalOverlay').classList.remove('active');
  editIndex = -1;
}

async function saveFAQ(e) {
  e.preventDefault();
  const index = parseInt($('#faq-edit-index').value);
  const question = $('#faq-question').value.trim();
  const answer = $('#faq-answer').value.trim();

  if (!question || !answer) {
    showNotification('Pergunta e resposta são obrigatórias', 'error');
    return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    const faqData = { question, answer };

    if (index >= 0) {
      faqs[index] = faqData;
    } else {
      faqs.push(faqData);
    }

    await putContent('faqs', faqs);
    closeFAQModal();
    renderFAQs();
    updateDashboardStats();
    showNotification('Dúvida salva com sucesso!', 'success');
  } catch (error) {
    showNotification('Erro ao salvar dúvida', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function editFAQ(index) {
  openFAQModal(index);
}

function deleteFAQ(index) {
  if (confirm('Tem certeza que deseja excluir esta dúvida?')) {
    faqs.splice(index, 1);
    putContent('faqs', faqs);
    renderFAQs();
    updateDashboardStats();
    showNotification('Dúvida excluída', 'success');
  }
}

// ============================================================================
// CALENDÁRIO / AGENDAMENTO
// ============================================================================

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function initCalendarSelectors() {
  const mesSelect = $('#agenda-mes');
  const anoSelect = $('#agenda-ano');
  const now = new Date();

  // Preencher meses
  mesSelect.innerHTML = MESES.map((m, i) => `<option value="${i}" ${i === now.getMonth() ? 'selected' : ''}>${m}</option>`).join('');

  // Preencher anos (atual + 2 anos)
  const currentYear = now.getFullYear();
  anoSelect.innerHTML = Array.from({ length: 3 }, (_, i) => currentYear + i)
    .map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('');

  mesSelect.addEventListener('change', renderCalendar);
  anoSelect.addEventListener('change', renderCalendar);
}

function renderCalendar() {
  const container = $('#calendar-container');
  const mes = parseInt($('#agenda-mes').value);
  const ano = parseInt($('#agenda-ano').value);

  if (!container) return;

  container.innerHTML = '';

  // Cabeçalhos dos dias
  ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].forEach(dia => {
    const el = document.createElement('div');
    el.className = 'agenda-cabecalho';
    el.textContent = dia;
    container.appendChild(el);
  });

  // Primeiro dia do mês
  const primeiroDia = new Date(ano, mes, 1).getDay();
  for (let i = 0; i < primeiroDia; i++) {
    const vazio = document.createElement('div');
    vazio.dataset.fora = 'true';
    container.appendChild(vazio);
  }

  // Dias do mês
  const totalDias = new Date(ano, mes + 1, 0).getDate();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  for (let dia = 1; dia <= totalDias; dia++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'agenda-dia';
    btn.textContent = dia;

    const chave = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const marcado = availableDates[chave] === true;
    btn.setAttribute('aria-pressed', marcado);
    btn.dataset.date = chave;

    const data = new Date(ano, mes, dia);
    if (data < hoje) {
      btn.disabled = true;
      btn.title = 'Data passada';
    }

    btn.addEventListener('click', () => toggleDate(chave, btn));
    container.appendChild(btn);
  }
}

function toggleDate(chave, btn) {
  if (availableDates[chave]) {
    delete availableDates[chave];
    btn.setAttribute('aria-pressed', 'false');
  } else {
    availableDates[chave] = true;
    btn.setAttribute('aria-pressed', 'true');
  }
}

async function saveDates() {
  try {
    await putContent('availableDates', availableDates);
    showNotification('Datas salvas com sucesso!', 'success');
    updateDashboardStats();
  } catch (error) {
    showNotification('Erro ao salvar datas', 'error');
  }
}

function openDateModal() {
  $('#modal-date').style.display = 'flex';
  $('#modalOverlay').classList.add('active');
  $('#date-value').value = new Date().toISOString().split('T')[0];
}

function closeDateModal() {
  $('#modal-date').style.display = 'none';
  $('#modalOverlay').classList.remove('active');
}

// ============================================================================
// DASHBOARD STATS
// ============================================================================

function updateDashboardStats() {
  $('#total-categories').textContent = categories.length;
  const totalImages = categories.reduce((sum, c) => sum + (c.gallery?.length || 0) + (c.image ? 1 : 0), 0) +
    (currentData.hero?.image ? 1 : 0) + (currentData.banner?.image ? 1 : 0);
  $('#total-images').textContent = totalImages;
  $('#total-services').textContent = services.length;
  $('#total-faqs').textContent = faqs.length;

  // "Uso do Storage" não pode ser medido pelo painel: os bytes ficam no
  // Postgres e a API não expõe um total. O que dá para dizer, sem inventar
  // número, é quantos arquivos de mídia o site referencia.
  const totalArquivos = totalImages + services.filter(s => s.image).length;
  const uso = $('#storage-usage');
  if (uso) {
    uso.textContent = `${totalArquivos} arquivo${totalArquivos === 1 ? '' : 's'}`;
  }

  const versao = $('#data-version');
  if (versao) versao.textContent = currentData.version ?? '—';

  const origem = $('#data-source');
  if (origem) origem.textContent = 'API do site';

  const datas = $('#total-datas');
  if (datas) {
    const n = Object.keys(availableDates || {}).length;
    datas.textContent = `${n} data${n === 1 ? '' : 's'}`;
  }

  pintaCabecalho();
}

/** Data por extenso no cabeçalho — o painel é aberto de manhã e à noite. */
function pintaCabecalho() {
  const el = $('#painel-data');
  if (!el) return;
  const hoje = new Date();
  const data = hoje.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  });
  el.textContent = `${data.charAt(0).toUpperCase()}${data.slice(1)} — o que está publicado no site.`;
}

/**
 * O selo do canto mostra se a API respondeu. Fica verde em operação e
 * vermelho se a última tentativa de leitura falhou.
 */
function marcaStatus(ligado) {
  const ponto = $('#painel-status-ponto');
  const texto = $('#painel-status');
  if (ponto) {
    if (ligado) ponto.removeAttribute('data-offline');
    else ponto.setAttribute('data-offline', '');
  }
  if (texto) texto.textContent = ligado ? 'Conectado à API do site' : 'Sem resposta do servidor';
}

// ============================================================================
// NAVIGATION & UI
// ============================================================================

function switchScreen(screenId) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  // Só o botão do menu principal é marcado. Os itens do submenu apontam para a
  // mesma tela e não devem competir entre si pela classe active.
  $$('.nav-btn[data-screen]').forEach(b => b.classList.remove('active'));

  const screen = $(screenId);
  const btn = document.querySelector(`.nav-btn[data-screen="${screenId}"]`);

  if (screen && btn) {
    screen.classList.add('active');
    btn.classList.add('active');

    // Carregar dados específicos da tela
    if (screenId === 'agendamento') renderCalendar();
    if (screenId === 'meusite') {
      // Meu Site carrega submenu
      switchSubscreen('configuracoes-gerais');
    }
    // Arquivos busca a lista só quando a tela aparece: não faz sentido pedir
    // o disco no boot, nem refazer a cada troca de aba dentro do painel.
    if (screenId === 'arquivos') aoEntrarEmArquivos();
  }
}

function switchSubscreen(subscreenId) {
  $$('.subscreen').forEach(s => s.classList.remove('active'));
  $$('.submenu-btn').forEach(b => b.classList.remove('active'));

  const screen = $(subscreenId);
  const btn = document.querySelector(`[data-subscreen="${subscreenId}"]`);

  if (screen && btn) {
    screen.classList.add('active');
    btn.classList.add('active');
  }
}

function toggleSidebar() {
  const sidebar = $('#sidebar');
  const isClosed = sidebar.classList.toggle('close');
  $('#menuBtn').classList.toggle('open');

  // When collapsing, close all open sub-menus
  if (isClosed) {
    $$('.nav-links li.showMenu').forEach(li => li.classList.remove('showMenu'));
  }
}

// Handle sub-menu toggle
function setupSubMenuToggles() {
  $$('.iocn-link').forEach(link => {
    const btn = link.querySelector('.nav-btn');
    const arrow = link.querySelector('.arrow');

    const toggle = (e) => {
      e.preventDefault();
      const li = link.closest('li');
      li.classList.toggle('showMenu');

      // Fecha os outros submenus abertos.
      $$('.nav-links li.showMenu').forEach(other => {
        if (other !== li) other.classList.remove('showMenu');
      });
    };

    // A seta sempre abre/fecha. O texto do item abre a tela (data-screen) e
    // não pode ser sequestrado pelo toggle, senão "Meu Site" e "Ajustes"
    // viram apenas um submenu e a tela nunca abre.
    arrow?.addEventListener('click', toggle);
    if (!btn?.dataset.screen) btn?.addEventListener('click', toggle);

    // Itens dentro do submenu navegam como o resto do menu.
    link.parentElement.querySelectorAll('.sub-menu [data-screen]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        switchScreen(item.dataset.screen);
        link.closest('li')?.classList.remove('showMenu');
      });
    });
  });
}

function closeAllModals() {
  $$('.modal').forEach(m => m.style.display = 'none');
  $('#modalOverlay').classList.remove('active');
  editIndex = -1;
  currentEditType = '';
}

function handleLogout() {
  if (confirm('Deseja sair do painel?')) {
    fazerLogout();
  }
}

// ============================================================================
// AJUSTES E BUSCA
// ============================================================================

/**
 * Menu suspenso do usuário (ícone da direita na barra superior). O HTML
 * chamava menuToggle() mas a função não existia em lugar nenhum — clicar
 * no ícone derrubava um ReferenceError.
 */
function menuToggle() {
  $('.menu-content')?.classList.toggle('open');
}

/**
 * Os dois lugares que editam a identidade do site (Personalizar e Ajustes)
 * escrevem nos mesmos campos de siteData. Aqui os inputs ficam ligados: mudar
 * num reflete no outro.
 */
function sincronizaAjustesComTema() {
  const pares = [
    ['#theme-primary-color', '#ajustes-theme-primary'],
    ['#theme-secondary-color', '#ajustes-theme-secondary'],
    ['#theme-font', '#ajustes-theme-font']
  ];

  for (const [a, b] of pares) {
    const origem = $(a);
    const espelho = $(b);
    if (!origem || !espelho) continue;

    espelho.value = origem.value;
    espelho.addEventListener('input', () => {
      origem.value = espelho.value;
      applyTheme();
    });
    origem.addEventListener('input', () => {
      espelho.value = origem.value;
      applyTheme();
    });
  }
}

/**
 * Busca do menu superior. A busca antiga consultava a coleção de alunos no
 * Firestore; hoje não existe tabela de alunos, então isto filtra o que o
 * painel já carregou: categorias, serviços e dúvidas.
 */
function ligarBusca() {
  const input = $('#searchInput');
  const lista = $('#suggestionsList');
  const caixa = $('#suggestionsContainer');
  if (!input || !lista || !caixa) return;

  const esconde = () => {
    lista.innerHTML = '';
    caixa.style.display = 'none';
  };

  input.addEventListener('input', () => {
    const termo = input.value.trim().toLowerCase();
    if (termo.length < 2) return esconde();

    const achados = [
      ...categories.map(c => ({ tipo: 'Categoria', texto: c.name || '' })),
      ...services.map(s => ({ tipo: 'Serviço', texto: s.name || '' })),
      ...faqs.map(f => ({ tipo: 'Dúvida', texto: f.question || '' }))
    ].filter(item => item.texto.toLowerCase().includes(termo)).slice(0, 8);

    if (!achados.length) return esconde();

    lista.innerHTML = '';
    for (const item of achados) {
      const li = document.createElement('li');
      li.textContent = `${item.texto} — ${item.tipo}`;
      lista.appendChild(li);
    }
    caixa.style.display = 'block';
  });

  input.addEventListener('blur', () => setTimeout(esconde, 200));
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
  // Sidebar navigation
  $$('.nav-btn[data-screen]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      switchScreen(btn.dataset.screen);
    });
  });

  // Submenu (Meu Site)
  $$('.submenu-btn[data-subscreen]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      switchSubscreen(btn.dataset.subscreen);
    });
  });

  // Sidebar sub-menu toggles (Meu Site, Ajustes)
  setupSubMenuToggles();

  // Sidebar toggle
  $('#menuBtn')?.addEventListener('click', toggleSidebar);
  $('#sidebarToggle')?.addEventListener('click', toggleSidebar);

  // Logout: o item do menu superior e o botão da tela Ajustes.
  $('#logoutBtn')?.addEventListener('click', handleLogout);
  $$('[data-logout]').forEach(btn => btn.addEventListener('click', handleLogout));

  // Ajustes espelha as cores/fonte de Personalizar: editar num lugar reflete
  // no outro, em vez de dar duas configurações concorrentes.
  sincronizaAjustesComTema();

  // Busca do topo: filtra o que já está em memória.
  ligarBusca();

  // Atalhos do dashboard: cada botão leva para uma tela.
  $$('.atalho[data-ir]').forEach(botao => {
    botao.addEventListener('click', () => switchScreen(botao.dataset.ir));
  });

  // Botões do gerenciador de arquivos.
  registraArquivos();

  // Modals
  $('#add-category-btn')?.addEventListener('click', () => openCategoryModal());
  $('#add-service-btn')?.addEventListener('click', () => openServiceModal());
  $('#add-faq-btn')?.addEventListener('click', () => openFAQModal());
  $('#add-date-btn')?.addEventListener('click', openDateModal);

  // Modal forms
  $('#categoryForm')?.addEventListener('submit', saveCategory);
  $('#serviceForm')?.addEventListener('submit', saveService);
  $('#faqForm')?.addEventListener('submit', saveFAQ);
  $('#dateForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = $('#date-type').value;
    const date = $('#date-value').value;
    const time = $('#date-time').value;
    const notes = $('#date-notes').value;

    if (!date) {
      showNotification('Selecione uma data', 'error');
      return;
    }

    const chave = date;
    availableDates[chave] = { type, time, notes };
    await saveDates();
    closeDateModal();
    renderCalendar();
  });

  // Save buttons
  $('#save-hero-btn')?.addEventListener('click', saveHeroAndBanner);
  $('#save-theme-btn')?.addEventListener('click', saveTheme);

  // Image uploads
  setupImageUpload($('#hero-image-upload'), 'hero-image-input', 'hero-image-preview', (result) => {
    // Preview handled in setupImageUpload
  });

  setupImageUpload($('#banner-image-upload'), 'banner-image-input', 'banner-image-preview', (result) => {});

  setupImageUpload($('#cat-image-upload'), 'cat-image-input', 'cat-image-preview', (result) => {});

  $('#cat-gallery-upload')?.addEventListener('click', () => $('#cat-gallery-input').click());
  $('#cat-gallery-input')?.addEventListener('change', (e) => {
    handleGalleryUpload(Array.from(e.target.files), 'cat-gallery-preview');
  });

  setupImageUpload($('#service-image-upload'), 'service-image-input', 'service-image-preview', (result) => {});

  // Close modals on overlay click
  $('#modalOverlay')?.addEventListener('click', closeAllModals);

  // Escape key to close modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
  });

  // Theme toggle
  $('#dark-mode-toggle')?.addEventListener('change', (e) => {
    document.documentElement.dataset.tema = e.target.checked ? 'escuro' : 'claro';
    localStorage.setItem('painelTema', e.target.checked ? 'escuro' : 'claro');
  });

  // Initialize calendar selectors
  initCalendarSelectors();

  // Set current month/year in calendar
  const now = new Date();
  $('#agenda-mes').value = now.getMonth();
  $('#agenda-ano').value = now.getFullYear();
}

// ============================================================================
// INIT
// ============================================================================

async function init() {
  await exigirLogin();
  setupEventListeners();
  await loadAllData();

  // Apply saved theme
  const savedTheme = localStorage.getItem('painelTema') || 'escuro';
  document.documentElement.dataset.tema = savedTheme;
  $('#dark-mode-toggle').checked = savedTheme === 'escuro';
  applyTheme();

  // Restore screen from hash
  const hash = window.location.hash.slice(1);
  if (hash) {
    const [screen, subscreen] = hash.split('/');
    if (screen) switchScreen(screen);
    if (subscreen) switchSubscreen(subscreen);
  }

  // Update hash on navigation
  const originalSwitchScreen = switchScreen;
  window.switchScreen = function(screenId) {
    originalSwitchScreen(screenId);
    const subscreen = $('.subscreen.active')?.id;
    window.location.hash = subscreen ? `${screenId}/${subscreen}` : screenId;
  };

  const originalSwitchSubscreen = switchSubscreen;
  window.switchSubscreen = function(subscreenId) {
    originalSwitchSubscreen(subscreenId);
    const screen = $('.screen.active')?.id;
    window.location.hash = `${screen}/${subscreenId}`;
  };
}

// Expor funções globais para onclick inline
window.openCategoryModal = openCategoryModal;
window.closeCategoryModal = closeCategoryModal;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;
window.removeGalleryImage = removeGalleryImage;
window.openServiceModal = openServiceModal;
window.closeServiceModal = closeServiceModal;
window.editService = editService;
window.deleteService = deleteService;
window.openFAQModal = openFAQModal;
window.closeFAQModal = closeFAQModal;
window.editFAQ = editFAQ;
window.deleteFAQ = deleteFAQ;
window.openDateModal = openDateModal;
window.closeDateModal = closeDateModal;
window.closeAllModals = closeAllModals;
window.switchScreen = switchScreen;
window.switchSubscreen = switchSubscreen;
window.toggleSidebar = toggleSidebar;
window.menuToggle = menuToggle;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
