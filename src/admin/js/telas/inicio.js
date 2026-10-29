/**
 * Tela "Início" — resumo do dia.
 *
 * Só leitura. Junta o que já existe no servidor:
 *   siteData        -> categorias, fotos do portfólio, serviços
 *   faqs            -> quantidade de dúvidas
 *   availableDates  -> { 'AAAA-MM-DD': true } — próximas datas livres
 *   /api/selecao    -> seleções de fotos dos clientes (exige sessão de admin)
 *
 * `montar` devolve `atualizar`, que o painel chama a cada nova visita à tela
 * para os números não ficarem velhos depois de editar o site.
 */

import { getContent, getSelecoes } from '../../../js/api.js';

const STATUS = {
  pendente: { rotulo: 'Pendente', tom: 'ambar' },
  em_tratamento: { rotulo: 'Em tratamento', tom: 'azul' },
  concluida: { rotulo: 'Concluída', tom: 'verde' }
};

const ATALHOS = [
  { rotulo: 'Editar site', icone: 'i-site', href: '#site', destaque: true },
  { rotulo: 'Seleções', icone: 'i-selecao', href: '#selecao' },
  { rotulo: 'Agenda', icone: 'i-agenda', href: '#agenda' },
  { rotulo: 'Ver site', icone: 'i-externo', href: '/', externo: true }
];

let painel;

// ---------------------------------------------------------------- utilidades

function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const icone = (id) => `<svg><use href="#${id}" /></svg>`;
const numero = (n) => Number(n || 0).toLocaleString('pt-BR');

function iniciais(nome) {
  const partes = String(nome || '?').trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] || '?') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

function dataCurta(valor) {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');
}

/** "há 5 min", "há 2 dias"… para a última seleção recebida. */
function haQuanto(valor) {
  const minutos = Math.round((Date.now() - new Date(valor).getTime()) / 60000);
  if (!Number.isFinite(minutos)) return '';
  if (minutos < 1) return 'agora mesmo';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

function chaveHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Próximas datas marcadas como livres, de hoje em diante. */
function proximasDatas(datas, limite = 5) {
  const hoje = chaveHoje();
  return Object.keys(datas || {})
    .filter((chave) => datas[chave] && /^\d{4}-\d{2}-\d{2}$/.test(chave) && chave >= hoje)
    .sort()
    .slice(0, limite)
    .map((chave) => {
      const [a, m, d] = chave.split('-').map(Number);
      const data = new Date(a, m - 1, d);
      const inicio = new Date();
      inicio.setHours(0, 0, 0, 0);
      const dias = Math.round((data - inicio) / 86400000);
      const semana = data.toLocaleDateString('pt-BR', { weekday: 'long' });
      return {
        dia: String(d).padStart(2, '0'),
        mes: data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        semana: semana.charAt(0).toUpperCase() + semana.slice(1),
        quando: dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`
      };
    });
}

// ---------------------------------------------------------------- pedaços

/** Rosca com as seleções por status; os arcos são círculos com stroke-dasharray. */
function rosca(contagem, total) {
  const raio = 70;
  const volta = 2 * Math.PI * raio;
  let deslocamento = 0;
  const arcos = total === 0 ? '' : Object.keys(STATUS).map((chave) => {
    const parte = contagem[chave] / total;
    if (!parte) return '';
    // Pequeno vão entre os arcos, como na referência
    const comprimento = Math.max(parte * volta - (parte < 1 ? 6 : 0), 0);
    const arco = `<circle class="arco tom-${STATUS[chave].tom}" r="${raio}" cx="90" cy="90"
      stroke-dasharray="${comprimento} ${volta}" stroke-dashoffset="${-deslocamento}"><title>${STATUS[chave].rotulo}: ${contagem[chave]}</title></circle>`;
    deslocamento += parte * volta;
    return arco;
  }).join('');

  return `
    <div class="rosca">
      <svg viewBox="0 0 180 180" role="img" aria-label="Seleções por status">
        <circle class="arco-fundo" r="${raio}" cx="90" cy="90" />
        <g transform="rotate(-90 90 90)">${arcos}</g>
      </svg>
      <div class="rosca-centro">
        <span>Total</span>
        <strong>${numero(total)}</strong>
        <span>${total === 1 ? 'seleção' : 'seleções'}</span>
      </div>
    </div>
    <ul class="legenda">
      ${Object.entries(STATUS).map(([chave, s]) => `
        <li><span class="marca tom-${s.tom}"></span>${s.rotulo}<b>${numero(contagem[chave])}</b></li>`).join('')}
    </ul>`;
}

function tabelaSelecoes(selecoes, erro) {
  if (erro) return `<div class="inicio-vazio">Não foi possível carregar as seleções. ${esc(erro)}</div>`;
  if (!selecoes.length) {
    return `<div class="inicio-vazio">${icone('i-selecao')}<p>Nenhuma seleção recebida ainda.<br>Quando um cliente escolher as fotos, ela aparece aqui.</p></div>`;
  }
  return `
    <div class="tabela" role="table">
      <div class="tabela-cabeca" role="row">
        <span role="columnheader">Cliente</span>
        <span role="columnheader">Data</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Fotos</span>
      </div>
      ${selecoes.slice(0, 5).map((s) => {
        const status = STATUS[s.status] || STATUS.pendente;
        const fotos = s.total ?? (Array.isArray(s.fotos) ? s.fotos.length : 0);
        return `
          <a class="tabela-linha" role="row" href="#selecao">
            <span class="cliente" role="cell">
              <span class="cliente-avatar tom-${status.tom}">${esc(iniciais(s.cliente))}</span>
              <span class="cliente-nome">
                <b>${esc(s.cliente || 'Visitante')}</b>
                ${s.cliente_email ? `<small>${esc(s.cliente_email)}</small>` : ''}
              </span>
            </span>
            <span role="cell" class="tabela-data">${dataCurta(s.created_at)}</span>
            <span role="cell"><span class="pilula tom-${status.tom}">${status.rotulo}</span></span>
            <span role="cell" class="tabela-fotos">${numero(fotos)}</span>
          </a>`;
      }).join('')}
    </div>`;
}

function listaDatas(datas) {
  if (!datas.length) {
    return `<div class="inicio-vazio pequeno">Nenhuma data livre marcada.<br><a href="#agenda">Abrir a agenda</a></div>`;
  }
  return `
    <ul class="datas">
      ${datas.map((d) => `
        <li>
          <span class="data-bloco"><b>${d.dia}</b><small>${d.mes}</small></span>
          <span class="data-texto"><b>${d.semana}</b><small>Disponível para sessão</small></span>
          <span class="data-quando">${d.quando}</span>
        </li>`).join('')}
    </ul>`;
}

// ---------------------------------------------------------------- tela

function pintar({ site, faqs, datas, selecoes, erroSelecoes }) {
  const categorias = Array.isArray(site?.categories) ? site.categories : [];
  const fotos = categorias.reduce((soma, c) => soma + (Array.isArray(c.gallery) ? c.gallery.length : 0), 0);
  const servicos = Array.isArray(site?.services) ? site.services.length : 0;
  const duvidas = Array.isArray(faqs) ? faqs.length : 0;

  const contagem = { pendente: 0, em_tratamento: 0, concluida: 0 };
  for (const s of selecoes) contagem[STATUS[s.status] ? s.status : 'pendente'] += 1;
  const ultima = selecoes[0];

  painel.innerHTML = `
    <div class="inicio">
      <div class="inicio-principal">
        <div class="bloco-titulo"><h3>Visão geral</h3><a href="#selecao">Ver seleções</a></div>

        <div class="cartoes-resumo">
          <a class="resumo escuro" href="#selecao">
            <span class="resumo-icone">${icone('i-selecao')}</span>
            <strong>${numero(selecoes.length)}</strong>
            <span class="resumo-rotulo">${selecoes.length === 1 ? 'seleção recebida' : 'seleções recebidas'}</span>
            <span class="resumo-rodape">
              <span>${contagem.pendente ? `${numero(contagem.pendente)} aguardando você` : 'Nada pendente'}</span>
              <span>${ultima ? haQuanto(ultima.created_at) : ''}</span>
            </span>
          </a>
          <a class="resumo claro" href="#site">
            <span class="resumo-icone">${icone('i-site')}</span>
            <strong>${numero(fotos)}</strong>
            <span class="resumo-rotulo">fotos em ${numero(categorias.length)} ${categorias.length === 1 ? 'categoria' : 'categorias'}</span>
            <span class="resumo-rodape">
              <span>${numero(servicos)} ${servicos === 1 ? 'serviço' : 'serviços'} · ${numero(duvidas)} ${duvidas === 1 ? 'dúvida' : 'dúvidas'}</span>
              <span>no site</span>
            </span>
          </a>
        </div>

        <nav class="atalhos" aria-label="Atalhos">
          ${ATALHOS.map((a) => `
            <a class="atalho ${a.destaque ? 'destaque' : ''}" href="${a.href}" ${a.externo ? 'target="_blank" rel="noopener"' : ''}>
              <span class="atalho-icone">${icone(a.icone)}</span>${a.rotulo}
            </a>`).join('')}
        </nav>

        <div class="bloco-titulo"><h3>Seleções recentes</h3></div>
        ${tabelaSelecoes(selecoes, erroSelecoes)}
      </div>

      <aside class="inicio-lateral cartao">
        <section class="lateral-bloco">
          <div class="bloco-titulo"><h3>Seleções por status</h3></div>
          ${rosca(contagem, selecoes.length)}
        </section>
        <section class="lateral-bloco">
          <div class="bloco-titulo"><h3>Próximas datas livres</h3><a href="#agenda">Agenda</a></div>
          ${listaDatas(proximasDatas(datas))}
        </section>
      </aside>
    </div>`;
}

async function carregar() {
  const [site, faqs, datas, resultadoSelecoes] = await Promise.all([
    getContent('siteData').catch(() => null),
    getContent('faqs').catch(() => null),
    getContent('availableDates').catch(() => null),
    getSelecoes().then((r) => ({ lista: r?.selecoes || [] }), (e) => ({ lista: [], erro: e.status === 401 ? 'Entre de novo para ver.' : e.message }))
  ]);
  const selecoes = [...resultadoSelecoes.lista]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  pintar({ site, faqs, datas, selecoes, erroSelecoes: resultadoSelecoes.erro });
}

export function montar(secao) {
  secao.querySelector('.vazio')?.remove();
  secao.insertAdjacentHTML('beforeend', `
    <div class="inicio-painel"><div class="carregando"><span class="girando"></span> Montando o resumo…</div></div>`);
  painel = secao.querySelector('.inicio-painel');
  // O painel espera esta primeira carga antes de dizer ao app que está pronto
  secao.carregando = carregar();
  return carregar;
}
