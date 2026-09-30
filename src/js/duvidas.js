/**
 * Página de dúvidas.
 *
 * Mesma política de conteúdo do resto do site: pinta primeiro o que está no
 * localStorage e troca quando o servidor responde. Nada aqui usa innerHTML
 * com dado vindo da rede — pergunta e resposta são texto, nunca marcação.
 */

import { getContent } from './api.js';

const CACHE_KEY = 'vilma_silva_faq_data';

/** Conteúdo de arranque, usado só antes de qualquer resposta chegar. */
const defaultFaqs = [
  {
    question: 'Quais são os serviços oferecidos?',
    answer:
      'Cardápio digital, ensaio de lançamento, fotografia de produtos para redes e atualização de bancada. Cada projeto é orçado sob medida: primeiro entendo o cenário, depois fecho escopo, prazo e valor.'
  },
  {
    question: 'Quanto tempo leva um ensaio?',
    answer:
      'De duas a cinco horas de produção na maior parte dos projetos. A entrega das fotos leva de cinco a sete dias úteis, e pode ser negociada em entregas parciais quando existe campanha no ar.'
  },
  {
    question: 'Em qual região você atende?',
    answer:
      'Atendo Recife e região para ensaios presentes, e o Brasil inteiro para os demais. Sessões com deslocamento já incluem o custo da viagem no orçamento.'
  },
  {
    question: 'Preciso enviar o produto para algum lugar?',
    answer:
      'Depende do serviço. Em muitos casos faço a coleta do ingrediente ou do preparado; em outros, você envia por transportadora. Confirmo tudo com você antes de começar.'
  }
];

function normalizar(faqs) {
  if (!Array.isArray(faqs) || faqs.length === 0) return null;

  const itens = faqs
    .map((faq) => ({
      question: typeof faq?.question === 'string' ? faq.question.trim() : '',
      answer: typeof faq?.answer === 'string' ? faq.answer.trim() : ''
    }))
    .filter((faq) => faq.question && faq.answer);

  return itens.length > 0 ? itens : null;
}

function lerCache() {
  try {
    return normalizar(JSON.parse(localStorage.getItem(CACHE_KEY))?.faqs);
  } catch {
    return null;
  }
}

function gravarCache(faqs) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ faqs }));
  } catch {
    // Cota cheia ou modo privativo: a página funciona igual, só sem cache.
  }
}

function criarSeta() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const caminho = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  caminho.setAttribute('d', 'M6 9l6 6 6-6');
  svg.appendChild(caminho);
  return svg;
}

function construirItem(faq, indice) {
  const botaoId = `faq-botao-${indice}`;
  const painelId = `faq-painel-${indice}`;

  const item = document.createElement('div');
  item.className = 'faq';
  item.dataset.aberto = 'false';

  const pergunta = document.createElement('button');
  pergunta.type = 'button';
  pergunta.id = botaoId;
  pergunta.className = 'faq__pergunta';
  pergunta.setAttribute('aria-expanded', 'false');
  pergunta.setAttribute('aria-controls', painelId);

  const texto = document.createElement('span');
  texto.textContent = faq.question;
  pergunta.appendChild(texto);

  const sinal = document.createElement('span');
  sinal.className = 'faq__sinal';
  sinal.setAttribute('aria-hidden', 'true');
  sinal.appendChild(criarSeta());
  pergunta.appendChild(sinal);

  // 0fr → 1fr em CSS anima a altura real do texto sem medir em JavaScript.
  // A cortina é quem recebe overflow:hidden.
  const painel = document.createElement('div');
  painel.className = 'faq__painel';
  painel.id = painelId;
  painel.setAttribute('role', 'region');
  painel.setAttribute('aria-labelledby', botaoId);

  const cortina = document.createElement('div');

  const resposta = document.createElement('p');
  resposta.className = 'faq__resposta';
  resposta.textContent = faq.answer;
  cortina.appendChild(resposta);
  painel.appendChild(cortina);

  item.append(pergunta, painel);
  return item;
}

function pintar(faqs) {
  const lista = document.getElementById('lista-faq');
  const vazio = document.getElementById('faq-vazio');
  if (!lista) return;

  const itens = normalizar(faqs) || [];
  lista.replaceChildren();
  lista.hidden = itens.length === 0;
  if (vazio) vazio.hidden = itens.length > 0;
  if (itens.length === 0) return;

  const frag = document.createDocumentFragment();
  itens.forEach((faq, i) => frag.appendChild(construirItem(faq, i)));
  lista.appendChild(frag);
}

/**
 * Um item aberto por vez. O estado mora em data-aberto e o CSS tira a
 * animação dele; o JavaScript só troca o atributo.
 */
function ligarAcordeao(lista) {
  lista.addEventListener('click', (evento) => {
    const pergunta = evento.target.closest('.faq__pergunta');
    if (!pergunta) return;

    const item = pergunta.closest('.faq');
    const jaAberto = item.dataset.aberto === 'true';

    for (const outro of lista.querySelectorAll('.faq')) {
      outro.dataset.aberto = 'false';
      outro.querySelector('.faq__pergunta')?.setAttribute('aria-expanded', 'false');
    }

    if (!jaAberto) {
      item.dataset.aberto = 'true';
      pergunta.setAttribute('aria-expanded', 'true');
    }
  });
}

async function iniciar() {
  const lista = document.getElementById('lista-faq');
  if (!lista) return;

  ligarAcordeao(lista);

  // Cache primeiro: a página responde na hora, sem esperar a rede.
  pintar(lerCache() || defaultFaqs);

  if (!navigator.onLine) return;

  try {
    const remoto = normalizar(await getContent('faqs'));
    if (!remoto) return;

    gravarCache(remoto);
    pintar(remoto);
  } catch {
    // Sem rede ou sem chave cadastrada: a página segue com o que já tinha.
  }
}

document.addEventListener('DOMContentLoaded', iniciar);
