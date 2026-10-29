/**
 * Admin Auth v2 - Compatível com novo painel (sidebar-based)
 * Substitui o admin-auth.js antigo para funcionar com o layout do painel de referência
 */

import { login, logout, getSession } from '../../js/api.js';

const TAMANHO_PIN = 4;
const PIN_CORRETO = '7811'; // PIN fixo do sistema

let authGate = null;
let authResolved = false;

export async function exigirLogin() {
  if (authResolved) return Promise.resolve();

  return new Promise(async (resolve) => {
    const liberar = () => {
      authResolved = true;
      if (authGate) {
        authGate.style.display = 'none';
      }
      // Mostrar o painel removendo a classe de bloqueio
      document.body.classList.remove('auth-locked');
      resolve();
    };

    // 1. Tenta usar a sessão existente
    try {
      const sessao = await getSession();
      if (sessao.authenticated) {
        liberar();
        return;
      }
    } catch (e) {
      console.warn('Erro ao verificar sessão:', e);
    }

    // 2. Tenta biometria (Capacitor/Android)
    if (window.Capacitor && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins.NativeBiometric) {
      try {
        const { NativeBiometric } = window.Capacitor.Plugins;
        const result = await NativeBiometric.isAvailable();
        if (result.isAvailable) {
          const creds = await NativeBiometric.getCredentials({ server: 'vilma.app' });
          if (creds && creds.password) {
            await login(creds.password);
            liberar();
            return;
          }
        }
      } catch (e) {
        // Ignora erro, segue para formulário manual
      }
    }

    // 3. Mostra formulário de PIN no modal/overlay
    mostrarGateLogin(liberar);
  });
}

function mostrarGateLogin(liberar) {
  // Criar overlay de login
  const overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(10px);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  `;

  const box = document.createElement('div');
  box.style.cssText = `
    background: var(--bg-card, #1c1b2c);
    border: 1px solid var(--border-color, #2d2b3e);
    border-radius: var(--radius-xl, 20px);
    padding: 40px;
    max-width: 400px;
    width: 100%;
    box-shadow: var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.3));
    text-align: center;
  `;

  box.innerHTML = `
    <!-- Logo Luvi do sprite do painel (#i-luvi-logo); a parte escura segue a cor do texto -->
    <svg role="img" aria-label="Luvi" viewBox="0 0 1184 493" style="display: block; width: 168px; height: auto; margin: 0 auto 20px; color: #f1f1f4;"><use href="#i-luvi-logo" /></svg>
    <p style="color: var(--text-secondary, #b1b8b9); margin-bottom: 32px; font-size: 0.9375rem;">Digite o PIN de ${TAMANHO_PIN} dígitos para acessar o painel</p>
    <form id="auth-form" style="display: flex; flex-direction: column; gap: 16px;">
      <div style="text-align: left;">
        <label style="display: block; font-size: 0.8125rem; font-weight: 500; color: var(--text-secondary, #b1b8b9); margin-bottom: 8px;">PIN</label>
        <input type="password" id="auth-pin" name="pin" inputmode="numeric" pattern="[0-9]*" maxlength="${TAMANHO_PIN}" autocomplete="one-time-code" placeholder="${'•'.repeat(TAMANHO_PIN)}" required style="width: 100%; padding: 16px; background: var(--bg-input, #1c1b2c); border: 1px solid var(--border-color, #2d2b3e); border-radius: var(--radius-md, 12px); font-size: 1.5rem; letter-spacing: 8px; color: var(--text-primary, #f8f8f8); text-align: center; transition: all var(--transition-fast, 150ms);">
      </div>
      <p id="auth-erro" style="color: var(--error, #ef4444); font-size: 0.875rem; min-height: 20px; display: none;"></p>
      <button type="submit" style="width: 100%; padding: 14px; background: linear-gradient(135deg, var(--accent-primary, #ffc60b), #e6b30a); color: var(--text-inverse, #11101d); font-size: 1rem; font-weight: 600; border: none; border-radius: var(--radius-md, 12px); cursor: pointer; transition: all var(--transition-fast, 150ms);">Entrar</button>
    </form>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);
  authGate = overlay;

  const form = overlay.querySelector('#auth-form');
  const input = overlay.querySelector('#auth-pin');
  const erro = overlay.querySelector('#auth-erro');
  const btn = form.querySelector('button[type="submit"]');

  // Auto-submit quando digitar 4 dígitos
  input.addEventListener('input', () => {
    const digitos = input.value.replace(/\D/g, '').slice(0, TAMANHO_PIN);
    if (digitos !== input.value) input.value = digitos;
    erro.textContent = '';
    erro.style.display = 'none';
    if (digitos.length === TAMANHO_PIN) {
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    erro.textContent = '';
    erro.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Entrando...';

    try {
      await login(input.value);

      // Salvar para biometria no app
      if (window.Capacitor && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins.NativeBiometric) {
        try {
          const { NativeBiometric } = window.Capacitor.Plugins;
          const result = await NativeBiometric.isAvailable();
          if (result.isAvailable) {
            await NativeBiometric.setCredentials({
              username: 'admin',
              password: input.value,
              server: 'vilma.app'
            });
          }
        } catch (e) {
          console.error('Erro ao salvar biometria:', e);
        }
      }

      input.value = '';
      liberar();
    } catch (err) {
      let msg = 'Não foi possível entrar';
      if (err.status === 429) msg = 'Tentativas demais. Espere alguns minutos.';
      else if (err.status === 401) msg = 'PIN incorreto.';
      else if (err.message) msg = `Erro: ${err.message}`;

      erro.textContent = msg;
      erro.style.display = 'block';
      input.value = '';
      input.focus();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });

  input.focus();
}

export async function fazerLogout() {
  try {
    await logout();
  } catch (e) {
    console.error('Erro ao fazer logout:', e);
  }
  authResolved = false;
  window.location.reload();
}

// Verificar se está autenticado (para uso em outros módulos)
export function isAuthenticated() {
  return authResolved;
}