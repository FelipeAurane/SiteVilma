/**
 * Porta de entrada do painel.
 *
 * O painel fica escondido até o servidor confirmar que existe uma sessão.
 * Isto é conforto, não a segurança em si: quem seguraria a fechadura é o
 * servidor, que recusa qualquer escrita sem o cookie de sessão. Mesmo que
 * alguém force a tela a aparecer pelo devtools, nenhum botão grava nada.
 */

import { login, logout, getSession } from './api.js';

const ESTILO = `
  #admin-gate {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: #1b1b1f;
    font-family: Arial, Helvetica, sans-serif;
  }
  #admin-gate[hidden] { display: none; }
  #admin-gate .caixa {
    width: 100%;
    max-width: 360px;
    background: #fff;
    border-radius: 12px;
    padding: 32px 28px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, .35);
  }
  #admin-gate h1 {
    margin: 0 0 6px;
    font-size: 20px;
    color: #1b1b1f;
  }
  #admin-gate p.ajuda {
    margin: 0 0 20px;
    font-size: 13px;
    color: #6b6b73;
  }
  #admin-gate label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #3a3a42;
    margin-bottom: 6px;
  }
  #admin-gate input {
    width: 100%;
    box-sizing: border-box;
    padding: 11px 12px;
    font-size: 15px;
    border: 1px solid #d3d3da;
    border-radius: 8px;
    margin-bottom: 14px;
  }
  #admin-gate input:focus {
    outline: 2px solid #7c5cff;
    outline-offset: 1px;
    border-color: transparent;
  }
  #admin-gate button {
    width: 100%;
    padding: 11px 12px;
    font-size: 15px;
    font-weight: 600;
    color: #fff;
    background: #7c5cff;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
  }
  #admin-gate button[disabled] { opacity: .6; cursor: progress; }
  #admin-gate .erro {
    margin: 14px 0 0;
    font-size: 13px;
    color: #b3261e;
    min-height: 18px;
  }
  #admin-logout {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 9998;
    padding: 9px 16px;
    font: 600 13px Arial, Helvetica, sans-serif;
    color: #3a3a42;
    background: #fff;
    border: 1px solid #d3d3da;
    border-radius: 999px;
    cursor: pointer;
    box-shadow: 0 6px 18px rgba(0, 0, 0, .12);
  }
`;

function montarGate() {
  const style = document.createElement('style');
  style.textContent = ESTILO;
  document.head.appendChild(style);

  const gate = document.createElement('div');
  gate.id = 'admin-gate';

  const caixa = document.createElement('div');
  caixa.className = 'caixa';

  const titulo = document.createElement('h1');
  titulo.textContent = 'Painel da Vilma';
  caixa.appendChild(titulo);

  const ajuda = document.createElement('p');
  ajuda.className = 'ajuda';
  ajuda.textContent = 'Entre com a senha do painel para continuar.';
  caixa.appendChild(ajuda);

  const form = document.createElement('form');
  form.autocomplete = 'on';

  const label = document.createElement('label');
  label.textContent = 'Senha';
  label.htmlFor = 'admin-senha';
  form.appendChild(label);

  const input = document.createElement('input');
  input.type = 'password';
  input.id = 'admin-senha';
  input.name = 'password';
  input.autocomplete = 'current-password';
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
  botao.textContent = 'Sair';

  botao.addEventListener('click', async () => {
    botao.disabled = true;
    try {
      await logout();
    } catch {
      // Mesmo se a chamada falhar, recarregar leva de volta ao login.
    }
    window.location.reload();
  });

  document.body.appendChild(botao);
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

    // 2. Tenta biometria / senha do dispositivo (apenas no celular)
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
        // Nenhuma credencial salva ou o usuário cancelou. Segue para o formulário manual.
      }
    }

    // 3. Cai no formulário manual se não houver sessão nem biometria válida
    const { gate, form, input, botao, erro } = montarGate();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      erro.textContent = '';
      botao.disabled = true;

      try {
        await login(input.value);

        // Salva a credencial para os próximos acessos no celular
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
              ? 'Senha incorreta.'
              : `Não foi possível entrar: ${err.message}`;
        input.select();
      } finally {
        botao.disabled = false;
      }
    });

    input.focus();
  });
}
