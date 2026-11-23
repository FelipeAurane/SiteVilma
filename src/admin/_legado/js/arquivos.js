/**
 * Gerenciador de arquivos do painel.
 *
 * Fala com /api/arquivos. A raiz e a pasta configurada no servidor
 * (PAINEL_ARQUIVOS_RAIZ); daqui o navegador nunca escolhe um caminho absoluto,
 * so navega dentro do que o servidor devolveu.
 *
 * Nada e enviado sem passar por api.js: é lá que mora o token de sessao.
 */

import { request } from '/js/api.js';

// --------------------------------------------------------------- estado

let caminhoAtual = '';
let raizServidor = '';
const historico = [];

/** Junta a pasta atual com um nome, no formato que a API espera. */
function juntar(base, nome) {
  return base ? `${base}/${nome}` : nome;
}

function ehRaiz(base) {
  return !base;
}

/** O nome da pasta que estamos vendo, para mostrar no migalho. */
function rotuloDaPasta(base) {
  return ehRaiz(base) ? 'raiz' : base.split('/').pop();
}

// ----------------------------------------------------------------- API

async function listar(base) {
  const consulta = `?path=${encodeURIComponent(base || '')}`;
  const dados = await request(`/arquivos${consulta}`);
  raizServidor = dados.raiz || raizServidor;
  return dados;
}

async function lerTexto(caminho) {
  return request(`/arquivos?acao=ler&path=${encodeURIComponent(caminho)}`);
}

async function gravarTexto(caminho, conteudo) {
  return request('/arquivos', { method: 'PUT', body: { path: caminho, conteudo } });
}

async function criarPasta(caminho) {
  return request('/arquivos?acao=pasta', { method: 'POST', body: { path: caminho } });
}

async function renomear(de, para) {
  return request('/arquivos?acao=renomear', { method: 'POST', body: { de, para } });
}

async function apagar(caminho) {
  return request(`/arquivos?path=${encodeURIComponent(caminho)}`, { method: 'DELETE' });
}

/** Arquivo → base64. Só para o que o navegador consegue ler inteiro. */
async function enviar(caminhoPasta, arquivo) {
  const data = await new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onloadend = () => {
      const texto = String(leitor.result);
      resolve(texto.slice(texto.indexOf(',') + 1));
    };
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    leitor.readAsDataURL(arquivo);
  });

  return request('/arquivos?acao=enviar', {
    method: 'POST',
    body: {
      path: caminhoPasta,
      nome: arquivo.name,
      mime: arquivo.type,
      data
    }
  });
}

// --------------------------------------------------------------- aviso

function avisa(mensagem, tipo = 'info') {
  const cont = document.getElementById('notifications');
  if (!cont) return;

  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  const icones = {
    success: 'checkmark-circle-outline',
    error: 'close-circle-outline',
    warning: 'alert-circle-outline',
    info: 'information-circle-outline'
  };
  toast.innerHTML = `
    <div class="column">
      <ion-icon name="${icones[tipo] || icones.info}"></ion-icon>
      <span>${mensagem}</span>
    </div>
  `;
  cont.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }, 4200);
}

// --------------------------------------------------------------- desenho

function iconeDoItem(item) {
  if (item.pasta) return 'folder-outline';
  const nome = item.nome.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/.test(nome)) return 'image-outline';
  if (/\.(mp4|webm|mov)$/.test(nome)) return 'videocam-outline';
  if (/\.(html?|css|js|mjs|json|md|txt)$/.test(nome)) return 'document-text-outline';
  if (/\.(zip|pdf)$/.test(nome)) return 'archive-outline';
  return 'document-outline';
}

/** Constrói a linha da tabela. Nunca usa innerHTML com dado do disco. */
function linha(item) {
  const tr = document.createElement('tr');

  const nome = document.createElement('td');
  const botao = document.createElement('button');
  botao.className = 'arq-nome';
  botao.type = 'button';

  const icone = document.createElement('ion-icon');
  icone.name = iconeDoItem(item);
  icone.className = item.pasta ? 'arq-icone arq-icone--pasta' : 'arq-icone';

  const rotulo = document.createElement('span');
  rotulo.textContent = item.nome;

  botao.append(icone, rotulo);
  botao.addEventListener('click', () => {
    if (item.pasta) abrirPasta(juntar(caminhoAtual, item.nome));
    else if (item.texto) abrirTexto(juntar(caminhoAtual, item.nome));
    else avisa('Este tipo de arquivo não abre no painel.', 'warning');
  });
  nome.appendChild(botao);

  const tamanho = document.createElement('td');
  tamanho.className = 'arq-num';
  tamanho.textContent = item.tamanhoLegivel;

  const data = document.createElement('td');
  data.className = 'arq-data';
  data.textContent = item.modificadoLegivel;

  const acoes = document.createElement('td');
  acoes.className = 'arq-acoes';

  const btnAbrir = document.createElement('button');
  btnAbrir.className = 'btn-icon';
  btnAbrir.title = item.texto ? 'Abrir' : 'Não editável';
  btnAbrir.disabled = !item.texto;
  btnAbrir.innerHTML = '<ion-icon name="create-outline"></ion-icon>';
  btnAbrir.addEventListener('click', () => abrirTexto(juntar(caminhoAtual, item.nome)));

  const btnRenomear = document.createElement('button');
  btnRenomear.className = 'btn-icon';
  btnRenomear.title = 'Renomear';
  btnRenomear.innerHTML = '<ion-icon name="swap-horizontal-outline"></ion-icon>';
  btnRenomear.addEventListener('click', () => renomearItem(juntar(caminhoAtual, item.nome), item));

  const btnApagar = document.createElement('button');
  btnApagar.className = 'btn-icon btn-icon--perigo';
  btnApagar.title = 'Apagar';
  btnApagar.innerHTML = '<ion-icon name="trash-outline"></ion-icon>';
  btnApagar.addEventListener('click', () => apagarItem(juntar(caminhoAtual, item.nome), item));

  acoes.append(btnAbrir, btnRenomear, btnApagar);

  tr.append(nome, tamanho, data, acoes);
  return tr;
}

function desenhaMigalho(base) {
  const caixa = document.getElementById('arq-migalhos');
  if (!caixa) return;
  caixa.textContent = '';

  const raiz = document.createElement('button');
  raiz.className = 'arq-migalho';
  raiz.type = 'button';
  raiz.textContent = raizServidor || 'raiz';
  raiz.addEventListener('click', () => abrirPasta(''));
  caixa.appendChild(raiz);

  if (!base) return;

  const partes = base.split('/');
  let acumulado = '';
  partes.forEach((parte, i) => {
    acumulado = juntar(acumulado, parte);
    const alvo = acumulado;

    const sep = document.createElement('span');
    sep.className = 'arq-sep';
    sep.textContent = '/';
    caixa.appendChild(sep);

    const botao = document.createElement('button');
    botao.className = 'arq-migalho';
    botao.type = 'button';
    botao.textContent = parte;
    botao.addEventListener('click', () => abrirPasta(alvo));
    caixa.appendChild(botao);

    if (i === partes.length - 1) botao.classList.add('arq-migalho--atual');
  });
}

async function desenha(base) {
  const corpo = document.getElementById('arq-corpo');
  const vazio = document.getElementById('arq-vazio');
  const contagem = document.getElementById('arq-contagem');
  if (!corpo) return;

  desenhaMigalho(base);
  corpo.textContent = '';
  corpo.appendChild(linhaCarregando());

  try {
    const dados = await listar(base);
    caminhoAtual = dados.path || '';

    corpo.textContent = '';

    // Botão de subir, quando não estamos na raiz.
    if (!ehRaiz(caminhoAtual)) {
      const sobe = caminhoAtual.split('/').slice(0, -1).join('/');
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      const botao = document.createElement('button');
      botao.className = 'arq-nome';
      botao.type = 'button';

      const icone = document.createElement('ion-icon');
      icone.name = 'arrow-up-outline';
      icone.className = 'arq-icone arq-icone--pasta';

      const texto = document.createElement('span');
      texto.textContent = '..';

      botao.append(icone, texto);
      botao.addEventListener('click', () => abrirPasta(sobe));
      td.appendChild(botao);
      tr.appendChild(td);
      corpo.appendChild(tr);
    }

    for (const item of dados.itens) corpo.appendChild(linha(item));

    if (vazio) {
      const nada = dados.itens.length === 0;
      vazio.style.display = nada ? '' : 'none';
    }
    if (contagem) {
      const n = dados.itens.length;
      contagem.textContent = n === 0
        ? 'pasta vazia'
        : `${n} item${n === 1 ? '' : 's'}`;
    }
  } catch (erro) {
    corpo.textContent = '';
    if (vazio) {
      vazio.style.display = '';
      vazio.querySelector('h3').textContent = 'Não foi possível abrir';
      vazio.querySelector('p').textContent = erro.message;
    }
  }
}

function linhaCarregando() {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 4;
  td.className = 'arq-num';
  td.textContent = 'Carregando…';
  tr.appendChild(td);
  return tr;
}

// ------------------------------------------------------------- acoes

function abrirPasta(base) {
  historico.push(caminhoAtual);
  desenha(base);
}

async function abrirTexto(caminho) {
  const overlay = document.getElementById('modalOverlay');
  const caixa = document.getElementById('modal-arquivo');
  const area = document.getElementById('arq-texto');
  const titulo = document.getElementById('arq-texto-titulo');

  try {
    const dados = await lerTexto(caminho);
    if (titulo) titulo.textContent = `${dados.nome} — ${dados.bytes} bytes`;
    area.value = dados.conteudo;
    area.dataset.caminho = caminho;
    caixa.style.display = 'flex';
    overlay.classList.add('active');
  } catch (erro) {
    avisa(erro.message, 'error');
  }
}

function fechaTexto() {
  document.getElementById('modal-arquivo').style.display = 'none';
  document.getElementById('modalOverlay').classList.remove('active');
}

async function salvaTexto() {
  const area = document.getElementById('arq-texto');
  const caminho = area.dataset.caminho;
  if (!caminho) return;

  const botao = document.getElementById('arq-texto-salvar');
  botao.disabled = true;
  try {
    await gravarTexto(caminho, area.value);
    avisa(`${caminho.split('/').pop()} salvo.`, 'success');
    fechaTexto();
    desenha(caminhoAtual);
  } catch (erro) {
    avisa(erro.message, 'error');
  } finally {
    botao.disabled = false;
  }
}

async function novaPasta() {
  const nome = prompt('Nome da nova pasta:');
  if (!nome) return;
  try {
    await criarPasta(juntar(caminhoAtual, nome.trim()));
    avisa('Pasta criada.', 'success');
    desenha(caminhoAtual);
  } catch (erro) {
    avisa(erro.message, 'error');
  }
}

async function renomearItem(caminho, item) {
  const nome = prompt('Novo nome:', item.nome);
  if (!nome || nome === item.nome) return;
  try {
    await renomear(caminho, juntar(caminhoAtual, nome.trim()));
    avisa('Renomeado.', 'success');
    desenha(caminhoAtual);
  } catch (erro) {
    avisa(erro.message, 'error');
  }
}

async function apagarItem(caminho, item) {
  const aviso = item.pasta
    ? `Apagar a pasta "${item.nome}" e tudo dentro dela?`
    : `Apagar o arquivo "${item.nome}"?`;
  if (!confirm(aviso)) return;
  try {
    await apagar(caminho);
    avisa('Apagado.', 'success');
    desenha(caminhoAtual);
  } catch (erro) {
    avisa(erro.message, 'error');
  }
}

async function sobeArquivo() {
  const input = document.getElementById('arq-envio');
  const arquivo = input.files?.[0];
  if (!arquivo) return;
  try {
    const r = await enviar(caminhoAtual, arquivo);
    avisa(`${r.nome} enviado (${r.bytes} bytes).`, 'success');
    input.value = '';
    desenha(caminhoAtual);
  } catch (erro) {
    avisa(erro.message, 'error');
  }
}

// ---------------------------------------------------------------- init

/** Quando a tela de Arquivos entra na tela, a lista recarrega. */
export async function aoEntrarEmArquivos() {
  desenha(caminhoAtual);
}

export function registraArquivos() {
  document.getElementById('arq-nova-pasta')?.addEventListener('click', novaPasta);
  document.getElementById('arq-recarregar')?.addEventListener('click', () => desenha(caminhoAtual));
  document.getElementById('arq-envio')?.addEventListener('change', sobeArquivo);
  document.getElementById('arq-texto-salvar')?.addEventListener('click', salvaTexto);
  document.getElementById('arq-texto-fechar')?.addEventListener('click', fechaTexto);
  document.getElementById('arq-ir-raiz')?.addEventListener('click', () => abrirPasta(''));
}

// Exposto para o admin.js, que é quem navega entre telas.
window.aoEntrarEmArquivos = aoEntrarEmArquivos;
window.registraArquivos = registraArquivos;
