'use strict';

/** Ponte da splash: recebe o andamento da sincronia e devolve PIN / tentar de novo / fechar. */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splash', {
  info: ipcRenderer.sendSync('splash:info'),
  iniciar: () => ipcRenderer.send('splash:iniciar'),
  tentar: () => ipcRenderer.send('splash:tentar'),
  enviarPin: (pin) => ipcRenderer.send('splash:pin', String(pin)),
  fechar: () => ipcRenderer.send('splash:fechar'),
  aoEstado: (callback) => ipcRenderer.on('splash:estado', (evento, estado) => callback(estado))
});
