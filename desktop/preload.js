'use strict';

/**
 * Ponte entre o painel e o app. Roda antes dos scripts da página.
 *
 * - Entrega o token da sessão que a splash abriu: o api.js do site lê
 *   localStorage.vf_session_token e manda como Authorization: Bearer.
 * - Expõe window.luvi: controles da janela (a barra é desenhada pelo painel),
 *   estado da conexão com o site, aviso de "montei" para a splash fechar, e
 *   "sair" (fecha o app).
 */

const { contextBridge, ipcRenderer } = require('electron');

function gravarToken(token) {
  try {
    localStorage.setItem('vf_session_token', token);
    localStorage.setItem('vf_client_logged_in', 'true');
  } catch {
    // sem localStorage o painel ainda abre; as gravações é que pediriam sessão
  }
}

const token = ipcRenderer.sendSync('luvi:token-agora');
if (token) gravarToken(token);
ipcRenderer.on('luvi:token', (evento, novo) => novo && gravarToken(novo));

contextBridge.exposeInMainWorld('luvi', {
  desktop: true,
  info: ipcRenderer.sendSync('luvi:info'),
  pronto: () => ipcRenderer.send('luvi:pronto'),
  janela: (acao) => ipcRenderer.send('luvi:janela', acao),
  maximizada: () => ipcRenderer.sendSync('luvi:estado-janela'),
  aoMaximizar: (callback) => ipcRenderer.on('luvi:maximizada', (evento, valor) => callback(Boolean(valor))),
  // Estado da conexão com o site: { online }
  conexao: () => ipcRenderer.sendSync('luvi:conexao-agora'),
  aoConexao: (callback) => ipcRenderer.on('luvi:conexao', (evento, estado) => callback(estado)),
  reconectar: () => ipcRenderer.send('luvi:reconectar'),
  sair: () => ipcRenderer.send('luvi:sair')
});
