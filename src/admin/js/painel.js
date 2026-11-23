/**
 * Luvi — painel de controle do site. Casca de navegação.
 *
 * Cada entrada de TELAS vira um botão no trilho lateral e uma <section> vazia.
 * A troca entre telas usa o hash da URL (#agenda, #site...), então o botão
 * voltar do navegador e links diretos funcionam.
 *
 * Para preencher uma tela: crie um módulo em js/telas/<id>.js que exporte
 * `montar(secao)` e registre em MONTADORES abaixo.
 */

import { exigirLogin } from './auth.js';
import { putContent } from '../../js/api.js';
import { montar as montarSite } from './telas/site.js';
import { montar as montarInicio } from './telas/inicio.js';
import { montar as montarAgenda } from './telas/agenda.js';
import { montar as montarSelecao } from './telas/selecoes.js?v=entrega-20261123';
import { montar as montarClientes } from './telas/clientes.js?v=clientes-20261122';
import { montar as montarGaleria, ligarSeletorLocal } from './telas/galeria-local.js';
import { montar as montarAjustes } from './telas/ajustes.js';

const TELAS = [
  { id: 'inicio',       rotulo: 'Início',           icone: 'i-inicio',       descricao: 'Resumo do dia: agenda, seleções em andamento e números do site.' },
  { id: 'site',         rotulo: 'Meu site',         icone: 'i-site',         descricao: 'Editor do site: capa, portfólio, serviços, dúvidas e visibilidade.' },
  { id: 'selecao',      rotulo: 'Seleção de fotos', icone: 'i-selecao',      descricao: 'Organize as galerias de seleção e acompanhe as escolhas dos clientes.' },
  { id: 'clientes',      rotulo: 'Clientes',         icone: 'i-clientes',     descricao: 'Cadastre e edite os contatos usados para enviar galerias.' },
  { id: 'agenda',       rotulo: 'Agenda',           icone: 'i-agenda',       descricao: 'Organize sua disponibilidade e seus lembretes pessoais.' },
];

// id da tela -> função que monta o conteúdo (preenchidas aos poucos).
// Se ela devolver uma função, essa é chamada a cada nova visita à tela.
const MONTADORES = {
  inicio: montarInicio,
  selecao: montarSelecao,
  clientes: montarClientes,
  site: montarSite,
  galeria: montarGaleria,
  ajustes: montarAjustes,
  agenda: montarAgenda,
};
const ATUALIZADORES = {};

const TELA_PADRAO = 'inicio';
const nav = document.getElementById('rail-nav');
const palco = document.getElementById('telas');
const botoes = new Map();
const secoes = new Map();
let telaAtual = null;

function icone(id) {
  return `<svg><use href="#${id}" /></svg>`;
}

function construir() {
  for (const tela of TELAS) {
    const botao = document.createElement('a');
    botao.className = 'rail-btn';
    botao.href = `#${tela.id}`;
    botao.dataset.rotulo = tela.rotulo;
    botao.setAttribute('aria-label', tela.rotulo);
    botao.innerHTML = icone(tela.icone) + (tela.aviso ? '<span class="ponto"></span>' : '');
    nav.appendChild(botao);
    botoes.set(tela.id, botao);

    const secao = document.createElement('section');
    secao.className = 'tela';
    secao.dataset.tela = tela.id;
    secao.setAttribute('aria-labelledby', `titulo-${tela.id}`);
    secao.innerHTML = `
      <div class="tela-cabeca">
        <div>
          <h2 id="titulo-${tela.id}">${tela.rotulo}</h2>
          <p>${tela.descricao}</p>
        </div>
      </div>
      <div class="vazio">
        <div class="vazio-icone">${icone(tela.icone)}</div>
        <h3>Em construção</h3>
        <p>Esta tela ainda está vazia. Vamos preenchê-la aos poucos.</p>
      </div>`;
    palco.appendChild(secao);
    secoes.set(tela.id, secao);
  }
}

function mostrar(id) {
  if (!secoes.has(id)) id = TELA_PADRAO;
  if (id === telaAtual) return;

  const anterior = telaAtual && secoes.get(telaAtual);
  if (anterior) {
    anterior.classList.remove('ativa');
    anterior.classList.add('saindo');
    setTimeout(() => anterior.classList.remove('saindo'), 320);
    botoes.get(telaAtual).classList.remove('ativo');
    botoes.get(telaAtual).removeAttribute('aria-current');
  }

  const secao = secoes.get(id);
  // Monta o conteúdo só na primeira visita
  if (MONTADORES[id] && !secao.dataset.montada) {
    secao.dataset.montada = '1';
    const atualizar = MONTADORES[id](secao);
    if (typeof atualizar === 'function') ATUALIZADORES[id] = atualizar;
    // Montagem assíncrona (ex.: Meu site): o app espera por ela antes de mostrar a janela
    else if (typeof atualizar?.then === 'function') secao.carregando = atualizar;
  } else {
    ATUALIZADORES[id]?.();
  }
  secao.classList.add('ativa');
  secao.scrollTop = 0;
  botoes.get(id).classList.add('ativo');
  botoes.get(id).setAttribute('aria-current', 'page');

  // O topo (saudação, busca, conta) só aparece no Início — ver painel.css
  document.querySelector('.palco').dataset.tela = id;

  const tela = TELAS.find((t) => t.id === id);
  document.title = `${tela.rotulo} · Luvi`;
  telaAtual = id;
}

function rotaAtual() {
  return location.hash.replace('#', '').split('?')[0] || TELA_PADRAO;
}

function saudar() {
  const hora = new Date().getHours();
  const periodo = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  document.getElementById('saudacao-titulo').textContent = `${periodo}, Vilma! 👋`;
}

function temaEscuroAtivo() {
  const tema = document.documentElement.dataset.tema;
  if (tema) return tema === 'escuro';
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

function ligarTema() {
  document.getElementById('btn-tema').addEventListener('click', () => {
    const novo = temaEscuroAtivo() ? 'claro' : 'escuro';
    document.documentElement.dataset.tema = novo;
    try { localStorage.setItem('painelTema', novo); } catch (e) { /* modo privado */ }
    putContent('panelTheme',novo).catch(e=>console.warn('Não foi possível sincronizar o tema:',e.message));
  });
}

/**
 * App desktop (window.luvi, do preload): a janela não tem a barra do Windows,
 * então a página mostra a própria; a sessão já vem aberta pela splash (com a
 * chave do app), então não há PIN; e "Sair" fecha o app.
 */
const desktop = window.luvi?.desktop ? window.luvi : null;

function ligarBarraDaJanela() {
  const barra = document.getElementById('barra-app');
  barra.hidden = false;

  for (const botao of barra.querySelectorAll('[data-janela]')) {
    botao.addEventListener('click', () => desktop.janela(botao.dataset.janela));
  }
  // Duplo clique na barra maximiza/restaura, como na barra nativa
  barra.querySelector('.barra-marca').addEventListener('dblclick', () => desktop.janela('maximizar'));

  const marcar = (maximizada) => {
    document.documentElement.classList.toggle('janela-maximizada', maximizada);
    barra.querySelector('[data-janela="maximizar"]').setAttribute('aria-label', maximizada ? 'Restaurar' : 'Maximizar');
  };
  marcar(desktop.maximizada());
  desktop.aoMaximizar(marcar);

  const conexao = document.getElementById('barra-conexao');
  const mostrarConexao = ({ online }) => {
    conexao.dataset.online = String(online);
    conexao.querySelector('span').textContent = online ? 'Conectado' : 'Sem conexão · reconectar';
    conexao.title = online ? `Conectado a ${new URL(desktop.info.servidor).host}` : 'Clique para tentar de novo agora';
  };
  mostrarConexao(desktop.conexao());
  desktop.aoConexao(mostrarConexao);
  conexao.addEventListener('click', () => {
    if (conexao.dataset.online === 'false') desktop.reconectar();
  });


}

document.getElementById('avatar').src = new URL('../img/profile.jpg', import.meta.url).href;
construir();
ligarSeletorLocal();
saudar();
ligarTema();

if (desktop) {
  ligarBarraDaJanela();

  document.body.classList.remove('auth-locked');
} else {

  // No navegador as telas só montam depois do login: algumas leem rotas que exigem sessão.
  await exigirLogin();
  document.body.classList.remove('auth-locked');
}

window.addEventListener('hashchange', () => mostrar(rotaAtual()));
mostrar(rotaAtual());



// Avisa o app que o painel montou com os dados da sincronia — só então a janela aparece
if (desktop) {
  await secoes.get(telaAtual)?.carregando;
  await document.fonts.ready;
  // setTimeout e não requestAnimationFrame: a janela ainda está escondida, e janela escondida não pinta quadros
  setTimeout(() => desktop.pronto(), 0);
}
