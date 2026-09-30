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

import { DataManager, defaultData, safeImageSrc, whatsappUrl } from './dataManager.js';
import { UIManager } from './uiManager.js';
import { initVisibility } from './visibility.js';

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
