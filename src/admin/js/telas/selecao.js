/**
 * Tela "Seleção de fotos" — controle completo da galeria de seleção do cliente
 * (página /catalogo).
 *
 * Abas:
 *   Seleções recebidas  lista do que os clientes escolheram (/api/selecao):
 *                       status, fotos escolhidas, copiar nomes, JSON, excluir.
 *   Fotos da galeria    as fotos que o cliente vê (catalogConfig.fotos), enviadas
 *                       COM proteção: o servidor grava a marca-d'água e guarda o
 *                       original à parte.
 *   Marca-d'água        duas camadas, com prévia ao vivo:
 *                         - gravada na foto (watermarkConfig, /api/media/protection)
 *                         - sobre a tela do cliente (catalogConfig.sobreposicao)
 *   Regras e ajustes    nome do estabelecimento, limite de fotos, aviso de
 *                       direitos e proteções da tela (catalogConfig.regras).
 *
 * O catálogo é um documento só (catalogConfig); cada aba salva as próprias
 * chaves por cima do que está publicado, sem levar junto o que outra aba ainda
 * não salvou.
 */

import {
  getCatalogConfig,
  saveCatalogConfig,
  getProtectionData,
  saveProtectionConfig,
  reprocessImages,
  getSelecoes,
  updateSelecaoStatus,
  deleteSelecao,
  uploadImage
} from '../../../js/api.js';
import { clonar, esc, previa, icone, avisar, mensagemDeErro } from './comum.js';

// ---------------------------------------------------------------- padrões

/** Camada desenhada por cima das fotos na tela do cliente. */
const SOBREPOSICAO_PADRAO = {
  ativa: true,
  repetida: true,
  selo: true,
  nome: 'Vilma Silva Fotografia',
  aviso: 'Amostra Protegida',
  posicao: 'topo', // 'topo' | 'centro' | 'baixo'
  opacidade: 0.28
};

/** Aviso de direitos e proteções da tela — os textos que o catalogo.html já mostrava. */
const REGRAS_PADRAO = {
  avisoAtivo: true,
  titulo: 'Aviso de Direitos Autorais',
  subtitulo: 'Vilma Silva Fotografia • Protegido pela Lei nº 9.610/98',
  texto: 'Todas as fotografias disponibilizadas nesta galeria são de autoria exclusiva e protegidas por lei. Para preservar a segurança e o trabalho artístico, são expressamente proibidas as seguintes práticas:',
  itens: [
    { titulo: 'Proibido Print ou Captura de Tela', texto: 'É proibido efetuar prints, capturas ou gravações de tela em qualquer dispositivo móvel ou computador.' },
    { titulo: 'Proibido Download e Cópia', texto: "As fotos são amostras digitais com marca d'água e não devem ser salvas, baixadas ou repassadas." },
    { titulo: "Proibida Remoção da Marca d'Água", texto: 'Qualquer recorte, modificação ou remoção das identificações é crime contra a propriedade intelectual.' }
  ],
  rodape: '✨ As imagens aqui servem exclusivamente para a sua seleção. As fotos finais tratadas em altíssima resolução (4K / 300 DPI) serão enviadas após a finalização da escolha.',
  botao: 'Entendi e Concordo',
  bloquearBotaoDireito: true,
  bloquearArrastar: true,
  bloquearSalvar: true,
  avisoPrint: true
};

const STATUS = {
  pendente: { rotulo: 'Pendente', tom: 'ambar' },
  em_tratamento: { rotulo: 'Em tratamento', tom: 'azul' },
  concluida: { rotulo: 'Concluída', tom: 'verde' }
};

const PADROES_GRADE = [
  { valor: 'diagonal_grid', rotulo: 'Grade diagonal' },
  { valor: 'mosaic', rotulo: 'Mosaico' },
  { valor: 'center_only', rotulo: 'Só o selo' }
];

const ABAS = [
  { id: 'marca', rotulo: "Marca-d'água", chaves: ['sobreposicao'], comMarca: true }

];

// ---------------------------------------------------------------- estado

const estado = {
  catalogo: null,   // catalogConfig em edição
  marca: null,      // watermarkConfig em edição
  selecoes: []
};
let catalogoPublicado = {};   // base do próximo save do catálogo
let marcaPadrao = {};
const salvo = {};             // id da aba -> JSON do que está publicado
const abertas = new Set();    // seleções expandidas
let filtro = 'todas';
let abaAtual = 'marca';
let enviandoFotos = null;     // { feitas, total } durante o envio
let raiz, painel, botaoSalvar, statusSalvar, barraAbas;

// ---------------------------------------------------------------- caminhos

function lerCaminho(caminho) {
  return caminho.split('.').reduce((obj, chave) => (obj == null ? undefined : obj[chave]), estado);
}

function gravarCaminho(caminho, valor) {
  const partes = caminho.split('.');
  const ultima = partes.pop();
  let obj = estado;
  for (const parte of partes) {
    if (obj[parte] == null || typeof obj[parte] !== 'object') obj[parte] = {};
    obj = obj[parte];
  }
  obj[ultima] = valor;
}

function slug(texto) {
  return String(texto || 'geral')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'geral';
}

function dataHora(valor) {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '');
}

function iniciais(nome) {
  const partes = String(nome || '?').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((partes[0]?.[0] || '?') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

/** Mesma camada que o catalogo.html desenha: texto repetido na diagonal, num SVG. */
export function padraoSobreposicao({ nome, aviso, opacidade }) {
  const xml = (t) => String(t || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const o = Math.min(Math.max(Number(opacidade) || 0.28, 0.05), 0.9);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='280' height='160' viewBox='0 0 280 160'>` +
    `<g transform='rotate(-25 140 80)' font-family='Montserrat, sans-serif' font-weight='700' text-anchor='middle' stroke='#000' stroke-width='0.4' stroke-opacity='0.6'>` +
    `<text x='140' y='64' fill='#ffffff' fill-opacity='${o.toFixed(2)}' font-size='11' letter-spacing='0.22em'>${xml(String(nome).toUpperCase())}</text>` +
    `<text x='140' y='90' fill='#93c5fd' fill-opacity='${Math.min(o * 1.3, 0.95).toFixed(2)}' font-size='8.5' letter-spacing='0.26em'>${xml(String(aviso).toUpperCase())}</text>` +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// ---------------------------------------------------------------- sujo / salvo

function fatia(idAba) {
  const aba = ABAS.find((a) => a.id === idAba);
  if (!aba.chaves) return null;
  const parte = Object.fromEntries(aba.chaves.map((k) => [k, estado.catalogo[k]]));
  if (aba.comMarca) parte.marca = estado.marca;
  return parte;
}

function marcarSalvo(idAba) {
  salvo[idAba] = JSON.stringify(fatia(idAba));
}

function estaSujo(idAba) {
  const atual = fatia(idAba);
  return atual !== null && salvo[idAba] !== undefined && JSON.stringify(atual) !== salvo[idAba];
}

function atualizarSujo() {
  for (const aba of ABAS) {
    barraAbas.querySelector(`[data-aba="${aba.id}"]`)?.classList.toggle('sujo', estaSujo(aba.id));
  }
  const temSalvar = abaAtual !== 'recebidas';
  const sujo = estaSujo(abaAtual);
  botaoSalvar.hidden = !temSalvar;
  botaoSalvar.disabled = !sujo || Boolean(enviandoFotos);
  statusSalvar.textContent = !temSalvar
    ? `${estado.selecoes.length} ${estado.selecoes.length === 1 ? 'seleção' : 'seleções'}`
    : enviandoFotos ? 'Enviando fotos…'
    : sujo ? 'Alterações não salvas' : 'Tudo salvo';
  statusSalvar.classList.toggle('pendente', temSalvar && sujo);
}

// ---------------------------------------------------------------- campos

function campo({ rotulo, caminho, tipo = 'text', dica = '', placeholder = '', linhas = 0, min, max }) {
  const valor = lerCaminho(caminho);
  const extra = tipo === 'number' ? `data-tipo="numero" min="${min ?? ''}" max="${max ?? ''}"` : '';
  const controle = linhas
    ? `<textarea rows="${linhas}" data-bind="${caminho}" placeholder="${esc(placeholder)}">${esc(valor)}</textarea>`
    : `<input type="${tipo}" value="${esc(valor)}" data-bind="${caminho}" placeholder="${esc(placeholder)}" ${extra}>`;
  return `
    <label class="campo">
      <span class="campo-rotulo">${rotulo}</span>
      ${controle}
      ${dica ? `<span class="campo-dica">${dica}</span>` : ''}
    </label>`;
}

function chave({ rotulo, caminho, dica = '' }) {
  return `
    <label class="interruptor">
      <span>${rotulo}${dica ? `<small class="sl-dica-chave">${dica}</small>` : ''}</span>
      <input type="checkbox" data-bind="${caminho}" ${lerCaminho(caminho) ? 'checked' : ''}>
      <span class="trilho-chave" aria-hidden="true"></span>
    </label>`;
}

/** Slider com o valor ao lado; formato: 'pct' | 'graus' | 'px' | '' */
function deslizar({ rotulo, caminho, min, max, passo = 1, formato = '' }) {
  const valor = Number(lerCaminho(caminho));
  return `
    <label class="campo sl-deslizar">
      <span class="campo-rotulo">${rotulo}<output data-saida="${caminho}" data-formato="${formato}">${formatar(valor, formato)}</output></span>
      <input type="range" min="${min}" max="${max}" step="${passo}" value="${valor}" data-bind="${caminho}" data-tipo="numero">
    </label>`;
}

function formatar(valor, formato) {
  if (formato === 'pct') return `${Math.round(valor * 100)}%`;
  if (formato === 'graus') return `${valor}°`;
  if (formato === 'px') return `${valor}px`;
  return String(valor);
}

/** Botões de escolha única (ex.: posição topo / centro / baixo). */
function escolha({ rotulo, caminho, opcoes }) {
  const atual = lerCaminho(caminho);
  return `
    <div class="campo">
      <span class="campo-rotulo">${rotulo}</span>
      <div class="sl-escolha" role="radiogroup">
        ${opcoes.map((o) => `
          <label class="${o.valor === atual ? 'ativa' : ''}">
            <input type="radio" name="${caminho}" value="${o.valor}" data-bind="${caminho}" ${o.valor === atual ? 'checked' : ''}>
            ${o.rotulo}
          </label>`).join('')}
      </div>
    </div>`;
}

function seletor({ rotulo, caminho, opcoes }) {
  const atual = lerCaminho(caminho);
  return `
    <label class="campo">
      <span class="campo-rotulo">${rotulo}</span>
      <select data-bind="${caminho}">
        ${opcoes.map((o) => `<option value="${o.valor}" ${o.valor === atual ? 'selected' : ''}>${o.rotulo}</option>`).join('')}
      </select>
    </label>`;
}

// ---------------------------------------------------------------- aba: seleções recebidas

function fotoDaSelecao(f) {
  const doCatalogo = (estado.catalogo.fotos || []).find((x) => x.id === f.id);
  const src = doCatalogo?.src || f.src || (f.arquivo ? `/img/provas/${f.arquivo}` : '');
  return { src: previa(src), nome: f.nome || doCatalogo?.titulo || f.id, arquivo: f.arquivo || doCatalogo?.arquivo || '' };
}

function listaFotos(s) {
  return Array.isArray(s.fotos) ? s.fotos : [];
}

function abaRecebidas() {
  const contagem = { pendente: 0, em_tratamento: 0, concluida: 0 };
  for (const s of estado.selecoes) contagem[STATUS[s.status] ? s.status : 'pendente'] += 1;

  const filtradas = estado.selecoes.filter((s) => filtro === 'todas' || (STATUS[s.status] ? s.status : 'pendente') === filtro);
  const chips = [['todas', 'Todas', estado.selecoes.length], ...Object.entries(STATUS).map(([k, v]) => [k, v.rotulo, contagem[k]])];

  return `
    <div class="sl-barra">
      <div class="sl-filtros">
        ${chips.map(([id, rotulo, n]) => `
          <button type="button" class="sl-filtro ${filtro === id ? 'ativo' : ''}" data-acao="filtro" data-filtro="${id}">${rotulo} <b>${n}</b></button>`).join('')}
      </div>
      <button class="botao botao-secundario" type="button" data-acao="atualizar">Atualizar</button>
    </div>
    <div class="lista sl-recebidas">
      ${filtradas.length ? filtradas.map(cartaoSelecao).join('') : `
        <div class="inicio-vazio">${icone('i-selecao')}<p>${estado.selecoes.length ? 'Nenhuma seleção com esse status.' : 'Nenhuma seleção recebida ainda.<br>Quando um cliente finalizar a escolha, ela aparece aqui.'}</p></div>`}
    </div>`;
}

function cartaoSelecao(s) {
  const status = STATUS[s.status] ? s.status : 'pendente';
  const fotos = listaFotos(s);
  const total = s.total ?? fotos.length;
  const aberta = abertas.has(String(s.id));
  return `
    <article class="cartao sl-selecao ${aberta ? 'aberta' : ''}">
      <div class="sl-selecao-topo">
        <span class="cliente-avatar tom-${STATUS[status].tom}">${esc(iniciais(s.cliente))}</span>
        <div class="sl-selecao-quem">
          <b>${esc(s.cliente || 'Visitante')}</b>
          <small>${esc(s.cliente_email || '')}${s.cliente_email ? ' · ' : ''}${dataHora(s.created_at)}</small>
        </div>
        <span class="sl-selecao-total"><b>${total}</b> ${total === 1 ? 'foto' : 'fotos'}</span>
        <select class="sl-status tom-${STATUS[status].tom}" data-status-de="${esc(s.id)}" aria-label="Status da seleção">
          ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === status ? 'selected' : ''}>${v.rotulo}</option>`).join('')}
        </select>
        <button class="icone-mini" type="button" data-acao="abrir" data-id="${esc(s.id)}" aria-expanded="${aberta}" aria-label="Ver fotos">
          <svg class="sl-seta ${aberta ? 'aberta' : ''}"><use href="#i-seta" /></svg>
        </button>
      </div>
      ${aberta ? `
        <div class="sl-selecao-corpo">
          <div class="sl-escolhidas">
            ${fotos.map((f, i) => {
              const foto = fotoDaSelecao(f);
              return `
                <figure>
                  ${foto.src ? `<img src="${esc(foto.src)}" alt="" loading="lazy">` : `<div class="sl-sem-foto">${icone('i-selecao')}</div>`}
                  <figcaption><b>${i + 1}. ${esc(foto.nome)}</b>${foto.arquivo ? `<code>${esc(foto.arquivo)}</code>` : ''}</figcaption>
                </figure>`;
            }).join('') || '<p class="lista-vazia">A seleção não trouxe a lista de fotos.</p>'}
          </div>
          <div class="linha-botoes">
            <button class="botao botao-secundario" type="button" data-acao="copiar" data-id="${esc(s.id)}">Copiar nomes dos arquivos</button>
            <button class="botao botao-secundario" type="button" data-acao="json" data-id="${esc(s.id)}">Baixar JSON</button>
            <button class="botao botao-fantasma" type="button" data-acao="excluir" data-id="${esc(s.id)}">Excluir seleção</button>
          </div>
        </div>` : ''}
    </article>`;
}

// ---------------------------------------------------------------- aba: fotos da galeria

function abaFotos() {
  const fotos = estado.catalogo.fotos;
  const categorias = [...new Set(fotos.map((f) => f.categoriaNome).filter(Boolean))];
  return `
    <article class="cartao sl-envio">
      <div>
        <h3>Fotos que o cliente vê</h3>
        <p class="cartao-sub">${fotos.length
          ? `${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'} na galeria. Cada foto é enviada protegida: o servidor grava a marca-d'água e guarda o original à parte.`
          : "Ainda sem fotos: a galeria do cliente mostra 12 fotos de exemplo. Envie as fotos do ensaio — elas sobem já com a marca-d'água gravada."}</p>
      </div>
      <label class="botao botao-primario ${enviandoFotos ? 'ocupado' : ''}">
        <input type="file" hidden multiple accept="image/*" data-upload="fotos" ${enviandoFotos ? 'disabled' : ''}>
        ${enviandoFotos ? `<span class="girando"></span> Enviando ${enviandoFotos.feitas + 1} de ${enviandoFotos.total}…` : `${icone('i-selecao')} Enviar fotos`}
      </label>
    </article>
    <datalist id="sl-categorias">${categorias.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="sl-fotos">
      ${fotos.map((f, i) => `
        <article class="cartao sl-foto">
          <div class="sl-foto-imagem">
            <img src="${esc(previa(f.src))}" alt="" loading="lazy">
            <div class="item-acoes">
              <button class="icone-mini" type="button" data-acao="subir" data-indice="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Mover para antes">←</button>
              <button class="icone-mini" type="button" data-acao="descer" data-indice="${i}" ${i === fotos.length - 1 ? 'disabled' : ''} aria-label="Mover para depois">→</button>
              <button class="icone-mini perigo" type="button" data-acao="remover" data-indice="${i}" aria-label="Remover foto">✕</button>
            </div>
          </div>
          ${campo({ rotulo: 'Título', caminho: `catalogo.fotos.${i}.titulo` })}
          <label class="campo">
            <span class="campo-rotulo">Categoria</span>
            <input type="text" list="sl-categorias" value="${esc(f.categoriaNome)}" data-bind="catalogo.fotos.${i}.categoriaNome" placeholder="Pratos principais">
          </label>
          ${f.arquivo ? `<code class="sl-arquivo" title="Nome que aparece na seleção do cliente">${esc(f.arquivo)}</code>` : ''}
        </article>`).join('')}
    </div>`;
}

// ---------------------------------------------------------------- aba: marca-d'água

function abaMarca() {
  return `
    <div class="sl-marca">
      <div class="sl-marca-controles">
        <article class="cartao">
          <h3>Gravada na foto</h3>
          <p class="cartao-sub">Vai para dentro do arquivo de cada foto enviada para a galeria. Não sai nem com print.</p>
          ${chave({ rotulo: "Marca-d'água na foto", caminho: 'marca.enabled' })}
          ${campo({ rotulo: 'Texto principal', caminho: 'marca.text' })}
          ${campo({ rotulo: 'Texto secundário', caminho: 'marca.secondaryText' })}
          ${seletor({ rotulo: 'Padrão', caminho: 'marca.pattern', opcoes: PADROES_GRADE })}
          ${deslizar({ rotulo: 'Opacidade', caminho: 'marca.opacity', min: 0.05, max: 0.95, passo: 0.01, formato: 'pct' })}
          ${deslizar({ rotulo: 'Ângulo', caminho: 'marca.angle', min: -90, max: 90, formato: 'graus' })}
          ${deslizar({ rotulo: 'Espaçamento', caminho: 'marca.spacing', min: 80, max: 600, passo: 10, formato: 'px' })}
          ${deslizar({ rotulo: 'Tamanho do texto', caminho: 'marca.fontSize', min: 10, max: 48, formato: 'px' })}
          ${chave({ rotulo: 'Selo de autoria', caminho: 'marca.centerMark', dica: 'Faixa com o nome, além do texto repetido.' })}
          ${escolha({ rotulo: 'Posição do selo', caminho: 'marca.badgePosition', opcoes: [{ valor: 'top', rotulo: 'Topo' }, { valor: 'center', rotulo: 'Centro' }, { valor: 'bottom', rotulo: 'Base' }] })}
        </article>

        <article class="cartao">
          <h3>Proteção extra e qualidade</h3>
          ${chave({ rotulo: 'Ruído anti-IA', caminho: 'marca.aiProtection', dica: 'Textura quase invisível que atrapalha ferramentas de remover marca-d’água.' })}
          ${deslizar({ rotulo: 'Força do ruído', caminho: 'marca.aiNoiseStrength', min: 0.005, max: 0.1, passo: 0.005, formato: 'pct' })}
          ${seletor({ rotulo: 'Formato', caminho: 'marca.format', opcoes: [{ valor: 'webp', rotulo: 'WebP (mais leve)' }, { valor: 'jpeg', rotulo: 'JPEG' }] })}
          ${deslizar({ rotulo: 'Qualidade', caminho: 'marca.quality', min: 50, max: 95 })}
          ${deslizar({ rotulo: 'Tamanho máximo da prova', caminho: 'marca.maxPreviewWidth', min: 600, max: 2560, passo: 40, formato: 'px' })}
          <div class="linha-botoes">
            <button class="botao botao-secundario" type="button" data-acao="padrao-marca">Restaurar padrão</button>
            <button class="botao botao-secundario" type="button" data-acao="reprocessar">Aplicar às fotos já enviadas</button>
          </div>
        </article>

        <article class="cartao">
          <h3>Sobre a tela do cliente</h3>
          <p class="cartao-sub">Desenhada por cima das fotos na galeria, além da que está no arquivo.</p>
          ${chave({ rotulo: 'Mostrar na tela', caminho: 'catalogo.sobreposicao.ativa' })}
          ${chave({ rotulo: 'Texto repetido por toda a foto', caminho: 'catalogo.sobreposicao.repetida' })}
          ${chave({ rotulo: 'Selo com o nome', caminho: 'catalogo.sobreposicao.selo' })}
          ${campo({ rotulo: 'Nome', caminho: 'catalogo.sobreposicao.nome' })}
          ${campo({ rotulo: 'Aviso', caminho: 'catalogo.sobreposicao.aviso' })}
          ${deslizar({ rotulo: 'Opacidade', caminho: 'catalogo.sobreposicao.opacidade', min: 0.05, max: 0.9, passo: 0.01, formato: 'pct' })}
          ${escolha({ rotulo: 'Posição do selo', caminho: 'catalogo.sobreposicao.posicao', opcoes: [{ valor: 'topo', rotulo: 'Topo' }, { valor: 'centro', rotulo: 'Centro' }, { valor: 'baixo', rotulo: 'Base' }] })}
        </article>
      </div>

      <aside class="cartao sl-previa">
        <div class="bloco-titulo"><h3>Prévia</h3><span class="sl-previa-estado" id="sl-previa-estado"></span></div>
        <div class="sl-previa-quadro">
          <img id="sl-previa-img" alt="Prévia da marca-d'água numa foto de exemplo">
          <div class="sl-camada" id="sl-camada" aria-hidden="true">
            <span class="sl-camada-repetida"></span>
            <span class="sl-camada-selo"><b></b><small></small></span>
          </div>
        </div>
        <p class="campo-dica">É assim que o cliente vê: a marca gravada no arquivo e, por cima, a camada da tela. A prévia usa a foto da capa como exemplo.</p>
      </aside>
    </div>`;
}

let previaTimer = null;
let previaUrl = null;
let previaPedido = 0;

/** Pede ao servidor a foto de exemplo com a marca-d'água do jeito que está no editor. */
function atualizarPreviaGravada() {
  clearTimeout(previaTimer);
  previaTimer = setTimeout(async () => {
    const img = document.getElementById('sl-previa-img');
    const estadoEl = document.getElementById('sl-previa-estado');
    if (!img) return;
    const m = estado.marca;
    const params = new URLSearchParams({
      preview: '1',
      enabled: String(Boolean(m.enabled)),
      text: m.text || '',
      secondaryText: m.secondaryText || '',
      opacity: String(m.opacity),
      angle: String(m.angle),
      spacing: String(m.spacing),
      fontSize: String(m.fontSize),
      pattern: m.pattern,
      centerMark: String(Boolean(m.centerMark)),
      badgePosition: m.badgePosition,
      aiProtection: String(Boolean(m.aiProtection)),
      aiNoiseStrength: String(m.aiNoiseStrength)
    });
    const pedido = ++previaPedido;
    estadoEl.textContent = 'Gerando…';
    try {
      const token = localStorage.getItem('vf_session_token');
      const resposta = await fetch(`/api/media/protection?${params}`, { cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!resposta.ok) throw new Error(`Erro ${resposta.status}`);
      const blob = await resposta.blob();
      if (pedido !== previaPedido) return; // chegou uma prévia mais nova
      if (previaUrl) URL.revokeObjectURL(previaUrl);
      previaUrl = URL.createObjectURL(blob);
      img.src = previaUrl;
      estadoEl.textContent = '';
    } catch (erro) {
      if (pedido === previaPedido) estadoEl.textContent = 'Prévia indisponível';
    }
  }, 350);
}

/** A camada da tela é só CSS: muda na hora, sem ir ao servidor. */
function atualizarCamada() {
  const camada = document.getElementById('sl-camada');
  if (!camada) return;
  const s = estado.catalogo.sobreposicao;
  camada.hidden = !s.ativa;
  const repetida = camada.querySelector('.sl-camada-repetida');
  repetida.hidden = !s.repetida;
  repetida.style.backgroundImage = padraoSobreposicao(s);
  const selo = camada.querySelector('.sl-camada-selo');
  selo.hidden = !s.selo;
  selo.dataset.posicao = s.posicao;
  selo.querySelector('b').textContent = s.nome;
  selo.querySelector('small').textContent = s.aviso;
}

// ---------------------------------------------------------------- aba: regras e ajustes

function abaRegras() {
  const r = estado.catalogo.regras;
  return `
    <div class="ms-grade">
      <article class="cartao">
        <h3>Galeria</h3>
        ${campo({ rotulo: 'Nome do estabelecimento', caminho: 'catalogo.estabelecimento', placeholder: 'Restaurante do cliente', dica: 'Aparece na capa da galeria e no título da página.' })}
        ${campo({ rotulo: 'Limite de fotos por seleção', caminho: 'catalogo.limite', tipo: 'number', min: 0, max: 999, dica: '0 = sem limite. O cliente não consegue marcar mais que isso.' })}
      </article>

      <article class="cartao">
        <h3>Proteções na tela</h3>
        <div class="interruptores">
          ${chave({ rotulo: 'Bloquear botão direito', caminho: 'catalogo.regras.bloquearBotaoDireito' })}
          ${chave({ rotulo: 'Bloquear arrastar as fotos', caminho: 'catalogo.regras.bloquearArrastar' })}
          ${chave({ rotulo: 'Bloquear Ctrl+S (salvar página)', caminho: 'catalogo.regras.bloquearSalvar' })}
          ${chave({ rotulo: 'Avisar ao tentar print ou imprimir', caminho: 'catalogo.regras.avisoPrint' })}
        </div>
      </article>

      <article class="cartao cartao-largo">
        <h3>Aviso de direitos autorais</h3>
        <p class="cartao-sub">Aparece quando o cliente abre a galeria, antes de ver as fotos.</p>
        ${chave({ rotulo: 'Mostrar o aviso', caminho: 'catalogo.regras.avisoAtivo' })}
        <div class="campo-dupla">
          ${campo({ rotulo: 'Título', caminho: 'catalogo.regras.titulo' })}
          ${campo({ rotulo: 'Subtítulo', caminho: 'catalogo.regras.subtitulo' })}
        </div>
        ${campo({ rotulo: 'Texto de abertura', caminho: 'catalogo.regras.texto', linhas: 3 })}
        ${r.itens.map((item, i) => `
          <div class="campo-dupla sl-regra">
            ${campo({ rotulo: `Regra ${i + 1}`, caminho: `catalogo.regras.itens.${i}.titulo` })}
            ${campo({ rotulo: 'Explicação', caminho: `catalogo.regras.itens.${i}.texto` })}
          </div>`).join('')}
        ${campo({ rotulo: 'Texto final', caminho: 'catalogo.regras.rodape', linhas: 2 })}
        ${campo({ rotulo: 'Botão de aceite', caminho: 'catalogo.regras.botao' })}
      </article>
    </div>`;
}

// ---------------------------------------------------------------- pintar

const RENDER = { recebidas: abaRecebidas, fotos: abaFotos, marca: abaMarca, regras: abaRegras };

function pintar() {
  for (const botao of barraAbas.querySelectorAll('[data-aba]')) {
    const ativa = botao.dataset.aba === abaAtual;
    botao.classList.toggle('ativa', ativa);
    botao.setAttribute('aria-selected', ativa);
  }
  painel.innerHTML = RENDER[abaAtual]();
  if (abaAtual === 'marca') {
    atualizarCamada();
    atualizarPreviaGravada();
  }
  atualizarSujo();
}

function trocarAba(id) {
  if (id === abaAtual) return;
  abaAtual = id;
  painel.classList.remove('entrando');
  void painel.offsetWidth; // reinicia a animação
  painel.classList.add('entrando');
  pintar();
}

// ---------------------------------------------------------------- ações

function selecaoPorId(id) {
  return estado.selecoes.find((s) => String(s.id) === String(id));
}

function baixar(nome, conteudo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function acao(botao) {
  const { acao: tipo, indice, id } = botao.dataset;
  const i = Number(indice);
  const fotos = estado.catalogo.fotos;

  switch (tipo) {
    case 'aba':
      return trocarAba(botao.dataset.aba);
    case 'salvar':
      return salvar();
    case 'filtro':
      filtro = botao.dataset.filtro;
      return pintar();
    case 'atualizar':
      await carregarSelecoes();
      avisar('Lista atualizada.');
      return;
    case 'abrir':
      abertas.has(String(id)) ? abertas.delete(String(id)) : abertas.add(String(id));
      return pintar();
    case 'copiar': {
      const s = selecaoPorId(id);
      const nomes = listaFotos(s).map((f) => fotoDaSelecao(f).arquivo || fotoDaSelecao(f).nome).join('\n');
      try {
        await navigator.clipboard.writeText(nomes);
        avisar(`${listaFotos(s).length} nomes copiados.`);
      } catch {
        avisar('Não foi possível copiar.', 'erro');
      }
      return;
    }
    case 'json': {
      const s = selecaoPorId(id);
      baixar(`selecao-${slug(s.cliente)}-${String(s.id).slice(0, 8)}.json`, JSON.stringify(s, null, 2));
      return;
    }
    case 'excluir': {
      const s = selecaoPorId(id);
      if (!confirm(`Excluir a seleção de ${s.cliente || 'visitante'}? Não dá para desfazer.`)) return;
      try {
        await deleteSelecao(s.id);
        estado.selecoes = estado.selecoes.filter((x) => x !== s);
        avisar('Seleção excluída.');
      } catch (erro) {
        avisar(mensagemDeErro(erro), 'erro');
      }
      return pintar();
    }
    case 'subir':
    case 'descer': {
      const j = tipo === 'subir' ? i - 1 : i + 1;
      if (j < 0 || j >= fotos.length) return;
      [fotos[i], fotos[j]] = [fotos[j], fotos[i]];
      return pintar();
    }
    case 'remover':
      if (!confirm(`Remover "${fotos[i].titulo || 'esta foto'}" da galeria? Ela só sai depois de salvar.`)) return;
      fotos.splice(i, 1);
      return pintar();
    case 'padrao-marca':
      estado.marca = { ...clonar(marcaPadrao), maxPreviewHeight: marcaPadrao.maxPreviewWidth };
      estado.catalogo.sobreposicao = clonar(SOBREPOSICAO_PADRAO);
      return pintar();
    case 'reprocessar': {
      if (estaSujo('marca')) {
        avisar("Salve a marca-d'água antes de aplicar às fotos.", 'erro');
        return;
      }
      if (!confirm("Gravar a marca-d'água atual em todas as fotos da galeria já enviadas? Os originais ficam guardados; as fotos do site não são alteradas.")) return;
      botao.disabled = true;
      botao.innerHTML = '<span class="girando"></span> Aplicando…';
      try {
        const r = await reprocessImages({ all: true });
        avisar(`${r.processedCount ?? 0} fotos atualizadas.`);
      } catch (erro) {
        avisar(mensagemDeErro(erro), 'erro');
      }
      return pintar();
    }
  }
}

async function enviarFotos(input) {
  const arquivos = [...input.files];
  if (!arquivos.length) return;
  enviandoFotos = { feitas: 0, total: arquivos.length };
  pintar();
  let falhas = 0;
  for (const arquivo of arquivos) {
    try {
      // Sem { protecao: false }: a foto sobe protegida (marca-d'água + original à parte)
      const url = await uploadImage(arquivo);
      const categoriaNome = estado.catalogo.fotos.at(-1)?.categoriaNome || 'Geral';
      estado.catalogo.fotos.push({
        id: `foto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        titulo: arquivo.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(),
        categoria: slug(categoriaNome),
        categoriaNome,
        src: url,
        arquivo: arquivo.name
      });
    } catch (erro) {
      falhas++;
      console.error('[selecao] envio falhou:', arquivo.name, erro);
    }
    enviandoFotos.feitas++;
    pintar();
  }
  enviandoFotos = null;
  pintar();
  if (falhas) avisar(`${falhas} ${falhas === 1 ? 'foto não foi enviada' : 'fotos não foram enviadas'}.`, 'erro');
  else avisar(`${arquivos.length} ${arquivos.length === 1 ? 'foto enviada' : 'fotos enviadas'}. Lembre de salvar.`);
}

async function mudarStatus(select) {
  const s = selecaoPorId(select.dataset.statusDe);
  const anterior = s.status;
  try {
    await updateSelecaoStatus(s.id, select.value);
    s.status = select.value;
    avisar(`${s.cliente || 'Seleção'}: ${STATUS[select.value].rotulo.toLowerCase()}.`);
  } catch (erro) {
    s.status = anterior;
    avisar(mensagemDeErro(erro), 'erro');
  }
  pintar();
}

// ---------------------------------------------------------------- salvar

function catalogoNormalizado(chaves) {
  const c = estado.catalogo;
  const novo = { ...clonar(catalogoPublicado) };
  for (const k of chaves) {
    if (k === 'fotos') {
      novo.fotos = c.fotos.map((f) => {
        const categoriaNome = String(f.categoriaNome || '').trim() || 'Geral';
        return { ...f, titulo: String(f.titulo || '').trim() || f.arquivo || 'Foto', categoriaNome, categoria: slug(categoriaNome) };
      });
    } else if (k === 'limite') {
      novo.limite = Math.max(0, Math.min(999, Math.round(Number(c.limite) || 0)));
    } else if (k === 'estabelecimento') {
      novo.estabelecimento = String(c.estabelecimento || '').trim();
    } else {
      novo[k] = clonar(c[k]);
    }
  }
  return novo;
}

async function salvar() {
  const aba = ABAS.find((a) => a.id === abaAtual);
  const rotulo = botaoSalvar.textContent;
  botaoSalvar.disabled = true;
  botaoSalvar.textContent = 'Salvando…';
  try {
    const parteCatalogo = JSON.stringify(Object.fromEntries(aba.chaves.map((k) => [k, estado.catalogo[k]])));
    const anterior = JSON.parse(salvo[aba.id]);
    const catalogoMudou = JSON.stringify(Object.fromEntries(aba.chaves.map((k) => [k, anterior[k]]))) !== parteCatalogo;

    if (catalogoMudou) {
      const novo = catalogoNormalizado(aba.chaves);
      await saveCatalogConfig(novo);
      catalogoPublicado = novo;
      for (const k of aba.chaves) estado.catalogo[k] = clonar(novo[k]);
    }
    if (aba.comMarca && JSON.stringify(anterior.marca) !== JSON.stringify(estado.marca)) {
      const r = await saveProtectionConfig({ ...estado.marca, maxPreviewHeight: estado.marca.maxPreviewWidth });
      estado.marca = { ...r.config };
    }
    marcarSalvo(aba.id);
    avisar(aba.id === 'marca'
      ? "Salvo! Fotos novas já saem com essa marca-d'água."
      : 'Salvo! A galeria do cliente já mostra as mudanças.');
  } catch (erro) {
    avisar(mensagemDeErro(erro, 'Não foi possível salvar.'), 'erro');
  } finally {
    botaoSalvar.textContent = rotulo;
    pintar();
  }
}

// ---------------------------------------------------------------- montagem

function ligarEventos() {
  raiz.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-acao]');
    if (botao && raiz.contains(botao) && !botao.disabled) acao(botao);
  });

  raiz.addEventListener('input', (evento) => {
    const alvo = evento.target;
    const caminho = alvo.dataset.bind;
    if (!caminho) return;
    if (alvo.type === 'radio' && !alvo.checked) return;
    const valor = alvo.type === 'checkbox' ? alvo.checked : alvo.dataset.tipo === 'numero' ? Number(alvo.value) : alvo.value;
    gravarCaminho(caminho, valor);

    const saida = raiz.querySelector(`[data-saida="${caminho}"]`);
    if (saida) saida.textContent = formatar(valor, saida.dataset.formato);
    if (alvo.type === 'radio') {
      for (const opcao of alvo.closest('.sl-escolha').querySelectorAll('label')) {
        opcao.classList.toggle('ativa', opcao.contains(alvo));
      }
    }
    if (caminho.startsWith('marca.')) atualizarPreviaGravada();
    if (caminho.startsWith('catalogo.sobreposicao.')) atualizarCamada();
    atualizarSujo();
  });

  raiz.addEventListener('change', (evento) => {
    const alvo = evento.target;
    if (alvo.dataset.upload) enviarFotos(alvo);
    else if (alvo.dataset.statusDe) mudarStatus(alvo);
    // select e checkbox nem sempre disparam "input" em todos os motores
    else if (alvo.dataset.bind && (alvo.tagName === 'SELECT' || alvo.type === 'checkbox')) {
      alvo.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  window.addEventListener('beforeunload', (evento) => {
    if (ABAS.some((a) => estaSujo(a.id))) {
      evento.preventDefault();
      evento.returnValue = '';
    }
  });
}

async function carregarSelecoes() {
  try {
    const r = await getSelecoes();
    estado.selecoes = [...(r?.selecoes || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch (erro) {
    avisar(`Seleções: ${mensagemDeErro(erro)}`, 'erro');
  }
  if (abaAtual === 'recebidas') pintar();
  else atualizarSujo();
}

async function carregar() {
  try {
    const [catalogo, protecao] = await Promise.all([
      getCatalogConfig().catch(() => null),
      getProtectionData()
    ]);
    catalogoPublicado = catalogo && typeof catalogo === 'object' ? catalogo : {};
    const regras = { ...REGRAS_PADRAO, ...(catalogoPublicado.regras || {}) };
    regras.itens = REGRAS_PADRAO.itens.map((padrao, i) => ({ ...padrao, ...(regras.itens?.[i] || {}) }));
    estado.catalogo = {
      estabelecimento: catalogoPublicado.estabelecimento || '',
      limite: Number(catalogoPublicado.limite) || 0,
      fotos: Array.isArray(catalogoPublicado.fotos) ? clonar(catalogoPublicado.fotos) : [],
      sobreposicao: { ...SOBREPOSICAO_PADRAO, ...(catalogoPublicado.sobreposicao || {}) },
      regras
    };
    marcaPadrao = protecao.defaults || {};
    estado.marca = { ...marcaPadrao, ...(protecao.config || {}) };
  } catch (erro) {
    painel.innerHTML = `<div class="carregando erro">Não foi possível carregar a galeria: ${esc(mensagemDeErro(erro))}</div>`;
    statusSalvar.textContent = 'Erro ao carregar';
    return;
  }
  for (const aba of ABAS) if (aba.chaves) marcarSalvo(aba.id);
  await carregarSelecoes();
  pintar();
}

export function montar(secao) {
  raiz = secao;
  secao.querySelector('.vazio')?.remove();

  secao.querySelector('.tela-cabeca').insertAdjacentHTML('beforeend', `
    <div class="ms-salvar">
      <span class="ms-status" id="sl-status">Carregando…</span>
      <button class="botao botao-primario" type="button" data-acao="salvar" id="sl-salvar" disabled hidden>Salvar alterações</button>
    </div>`);
  botaoSalvar = secao.querySelector('#sl-salvar');
  statusSalvar = secao.querySelector('#sl-status');

  secao.insertAdjacentHTML('beforeend', `
    <div class="ms-abas" role="tablist" aria-label="Partes da galeria de seleção">
      ${ABAS.map((a) => `<button class="ms-aba" type="button" role="tab" data-acao="aba" data-aba="${a.id}">${a.rotulo}<span class="ponto-sujo"></span></button>`).join('')}
    </div>
    <div class="ms-painel" role="tabpanel">
      <div class="carregando"><span class="girando"></span> Carregando a galeria de seleção…</div>
    </div>`);
  barraAbas = secao.querySelector('.ms-abas');
  painel = secao.querySelector('.ms-painel');
  ligarEventos();

  secao.carregando = carregar();
  // Nas visitas seguintes, só a lista de seleções é buscada de novo (as edições ficam)
  return () => (estado.catalogo ? carregarSelecoes() : undefined);
}
