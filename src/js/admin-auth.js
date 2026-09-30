/**
 * Porta de entrada do painel.
 *
 * O painel fica escondido até o servidor confirmar que existe uma sessão.
 * Isto é conforto, não a segurança em si: quem seguraria a fechadura é o
 * servidor, que recusa qualquer escrita sem o cookie de sessão. Mesmo que
 * alguém force a tela a aparecer pelo devtools, nenhum botão grava nada.
 *
 * O visual da tela vem de css/config.css (#admin-gate).
 */

import { login, logout, getSession } from './api.js';

const TAMANHO_PIN = 4;

function montarGate() {
  const gate = document.createElement('div');
  gate.id = 'admin-gate';

  const caixa = document.createElement('div');
  caixa.className = 'caixa';

  const titulo = document.createElement('h1');
  titulo.textContent = 'Painel da Vilma';
  caixa.appendChild(titulo);

  const ajuda = document.createElement('p');
  ajuda.className = 'ajuda';
  ajuda.textContent = `Digite o PIN de ${TAMANHO_PIN} dígitos do painel para continuar.`;
  caixa.appendChild(ajuda);

  const form = document.createElement('form');
  form.autocomplete = 'off';

  const label = document.createElement('label');
  label.textContent = 'PIN';
  label.htmlFor = 'admin-pin';
  form.appendChild(label);

  const input = document.createElement('input');
  input.type = 'password';
  input.id = 'admin-pin';
  input.name = 'pin';
  input.inputMode = 'numeric';
  input.pattern = '[0-9]*';
  input.maxLength = TAMANHO_PIN;
  input.autocomplete = 'one-time-code';
  input.placeholder = '•'.repeat(TAMANHO_PIN);
  input.required = true;
  form.appendChild(input);

  const botao = document.createElement('button');
  botao.type = 'submit';
  botao.textContent = 'Entrar';
  form.appendChild(botao);

  const erro = document.createElement('p');
  erro.className = 'erro';
  erro.setAttribute('role', 'alert');
  form.appendChild(erro);

  caixa.appendChild(form);
  gate.appendChild(caixa);
  document.body.appendChild(gate);

  return { gate, form, input, botao, erro };
}

function montarBotaoSair() {
  const botao = document.createElement('button');
  botao.id = 'admin-logout';
  botao.type = 'button';
  botao.title = 'Encerrar a sessão do painel';
  botao.innerHTML =
    '<svg class="icone icone--p" aria-hidden="true"><use href="#i-sair"></use></svg><span>Sair</span>';

  botao.addEventListener('click', async () => {
    botao.disabled = true;
    try {
      await logout();
    } catch {
      // Mesmo se a chamada falhar, recarregar leva de volta ao login.
    }
    window.location.reload();
  });

  // O painel tem um lugar reservado no cabeçalho. Em página que não tem esse
  // lugar, ele continua flutuante no canto (ver css/config.css).
  const slot = document.getElementById('slot-sair');
  if (slot) slot.appendChild(botao);
  else {
    botao.dataset.flutuante = 'true';
    document.body.appendChild(botao);
  }

  return botao;
}

export function exigirLogin() {
  return new Promise(async (resolve) => {
    const liberar = () => {
      montarBotaoSair();
      resolve();
    };

    // 1. Tenta usar a sessão existente
    const sessao = await getSession();
    if (sessao.authenticated) {
      liberar();
      return;
    }

    // 2. Tenta a biometria do aparelho (só no app Android), que já guardou o PIN
    if (window.Capacitor && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins.NativeBiometric) {
      try {
        const { NativeBiometric } = window.Capacitor.Plugins;
        const result = await NativeBiometric.isAvailable();
        if (result.isAvailable) {
          // O plugin chama o campo guardado de "password"; aqui é o PIN.
          const creds = await NativeBiometric.getCredentials({ server: 'vilma.app' });
          if (creds && creds.password) {
            await login(creds.password);
            liberar();
            return;
          }
        }
      } catch (e) {
        // Nenhuma credencial salva ou o usuário cancelou. Segue para o formulário manual.
      }
    }

    // 3. Cai no formulário manual se não houver sessão nem biometria válida
    const { gate, form, input, botao, erro } = montarGate();

    // Só dígitos, no máximo 4 — e entra sozinho assim que o PIN fecha.
    input.addEventListener('input', () => {
      const digitos = input.value.replace(/\D/g, '').slice(0, TAMANHO_PIN);
      if (digitos !== input.value) input.value = digitos;
      erro.textContent = '';
      if (digitos.length === TAMANHO_PIN) form.requestSubmit();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      erro.textContent = '';
      botao.disabled = true;

      try {
        await login(input.value);

        // Salva o PIN para os próximos acessos no celular (a biometria destrava).
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
        gate.hidden = true;
        liberar();
      } catch (err) {
        erro.textContent =
          err.status === 429
            ? 'Tentativas demais. Espere alguns minutos.'
            : err.status === 401
              ? 'PIN incorreto.'
              : `Não foi possível entrar: ${err.message}`;
        input.value = '';
        input.focus();
      } finally {
        botao.disabled = false;
      }
    });

    input.focus();
  });
}
