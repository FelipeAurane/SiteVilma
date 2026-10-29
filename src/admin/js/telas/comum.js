/**
 * Utilidades compartilhadas pelas telas do painel (Meu site, Seleção de fotos…).
 */

export const clonar = (v) => JSON.parse(JSON.stringify(v));

export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** O conteúdo guarda caminhos relativos ao site ("./img/x.jpg"); o painel mora em /config. */
export function previa(src) {
  const s = String(src || '').trim();
  if (s.startsWith('./')) return `/${s.slice(2)}`;
  if (s.startsWith('../')) return `/${s.slice(3)}`;
  return s;
}

export function icone(id) {
  return `<svg><use href="#${id}" /></svg>`;
}

/** Aviso flutuante no canto da tela. tipo: 'ok' | 'erro'. */
export function avisar(mensagem, tipo = 'ok') {
  let caixa = document.getElementById('avisos');
  if (!caixa) {
    caixa = document.createElement('div');
    caixa.id = 'avisos';
    caixa.className = 'avisos';
    caixa.setAttribute('aria-live', 'polite');
    document.body.appendChild(caixa);
  }
  const aviso = document.createElement('div');
  aviso.className = `aviso aviso-${tipo}`;
  aviso.textContent = mensagem;
  caixa.appendChild(aviso);
  requestAnimationFrame(() => aviso.classList.add('visivel'));
  setTimeout(() => {
    aviso.classList.remove('visivel');
    setTimeout(() => aviso.remove(), 300);
  }, tipo === 'erro' ? 5000 : 2600);
}

/** Mensagem de erro de API pronta para mostrar. */
export function mensagemDeErro(erro, padrao = 'Não foi possível concluir.') {
  if (erro?.status === 401) return 'Sua sessão expirou. Entre de novo.';
  return erro?.message || padrao;
}
