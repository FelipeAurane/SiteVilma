import { getContent, putContent } from '../../../js/api.js';

const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const semana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const chaveDia = (ano, mes, dia) => `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

export function montar(secao) {
  secao.querySelector('.vazio')?.remove();
  secao.insertAdjacentHTML('beforeend', `
    <div class="agenda-painel">
      <div class="agenda-topo">
        <div><h3>Agenda</h3><p class="agenda-instrucao">Toque em um dia para disponibilizá-lo no calendário do site.</p></div>
        <button type="button" class="agenda-hoje">Hoje</button>
      </div>
      <div class="agenda-modos" role="group" aria-label="Modo do calendário">
        <button type="button" data-modo="disponibilidade" aria-pressed="true">Disponibilidade</button>
        <button type="button" data-modo="lembretes" aria-pressed="false">Lembretes</button>
      </div>
      <div class="agenda-meses">
        <button type="button" class="agenda-anterior" aria-label="Mês anterior">‹</button>
        <h3 class="agenda-mes" aria-live="polite"></h3>
        <button type="button" class="agenda-proximo" aria-label="Próximo mês">›</button>
      </div>
      <div class="agenda-grade" role="group" aria-label="Dias do mês"></div>
      <div class="agenda-rodape">
        <span class="agenda-legenda"><i></i> Disponível</span>
        <p class="agenda-resumo"></p>
      </div>
      <p class="agenda-estado" role="status" aria-live="polite"></p>
      <form class="agenda-lembrete" hidden>
        <label for="agenda-lembrete-texto">Lembrete para <strong class="agenda-data"></strong></label>
        <textarea id="agenda-lembrete-texto" maxlength="2000" rows="4" placeholder="Escreva um lembrete pessoal para este dia"></textarea>
        <div class="agenda-lembrete-acoes">
          <button type="button" class="agenda-excluir">Excluir lembrete</button>
          <button type="submit" class="agenda-salvar">Salvar lembrete</button>
        </div>
        <p class="agenda-lembrete-estado" role="status" aria-live="polite"></p>
      </form>
    </div>`);

  const hoje = () => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  let mes = new Date(hoje().getFullYear(), hoje().getMonth(), 1);
  let datas = {};
  let lembretes = {};
  let lembretesCarregados = false;
  let modo = 'disponibilidade';
  let diaSelecionado = null;
  let ocupado = false;
  const grade = secao.querySelector('.agenda-grade');
  const estado = secao.querySelector('.agenda-estado');
  const formulario = secao.querySelector('.agenda-lembrete');
  const campo = secao.querySelector('#agenda-lembrete-texto');
  const estadoLembrete = secao.querySelector('.agenda-lembrete-estado');

  function selecionarDia(chave) {
    diaSelecionado = chave;
    const [ano, numeroMes, dia] = chave.split('-');
    secao.querySelector('.agenda-data').textContent = `${dia}/${numeroMes}/${ano}`;
    campo.value = lembretes[chave] || '';
    estadoLembrete.textContent = '';
    formulario.hidden = false;
    secao.querySelector('.agenda-excluir').disabled = !lembretes[chave];
    pintar();
    campo.focus();
  }

  function pintar() {
    const ano = mes.getFullYear();
    const numeroMes = mes.getMonth();
    secao.querySelector('.agenda-mes').textContent = `${meses[numeroMes][0].toUpperCase()}${meses[numeroMes].slice(1)} de ${ano}`;
    const atual = hoje();
    secao.querySelector('.agenda-anterior').disabled = mes <= new Date(atual.getFullYear(), atual.getMonth(), 1);
    grade.replaceChildren();
    for (const nome of semana) {
      const rotulo = document.createElement('span');
      rotulo.className = 'agenda-semana';
      rotulo.textContent = nome;
      grade.append(rotulo);
    }
    for (let i = 0; i < new Date(ano, numeroMes, 1).getDay(); i++) {
      const vazio = document.createElement('span');
      grade.append(vazio);
    }
    const ultimo = new Date(ano, numeroMes + 1, 0).getDate();
    for (let dia = 1; dia <= ultimo; dia++) {
      const chave = chaveDia(ano, numeroMes, dia);
      const botao = document.createElement('button');
      const selecionado = Boolean(datas[chave]);
      botao.type = 'button';
      botao.className = 'agenda-dia';
      botao.textContent = dia;
      botao.dataset.dia = chave;
      botao.classList.toggle('tem-lembrete', Boolean(lembretes[chave]));
      botao.classList.toggle('selecionado', modo === 'lembretes' && diaSelecionado === chave);
      botao.setAttribute('aria-label', `${dia} de ${meses[numeroMes]}: ${selecionado ? 'disponível' : 'indisponível'}${lembretes[chave] ? ', com lembrete' : ''}`);
      botao.setAttribute('aria-pressed', String(selecionado));
      botao.disabled = ocupado || (modo === 'disponibilidade' && new Date(ano, numeroMes, dia) < atual);
      grade.append(botao);
    }
    const futuras = Object.keys(datas).filter((chave) => datas[chave] && chave >= chaveDia(atual.getFullYear(), atual.getMonth(), atual.getDate()));
    secao.querySelector('.agenda-resumo').textContent = `${futuras.length} ${futuras.length === 1 ? 'dia disponível' : 'dias disponíveis'} a partir de hoje`;
  }

  async function carregar() {
    if (ocupado) return;
    ocupado = true;
    estado.textContent = 'Carregando agenda…';
    pintar();
    try {
      const remoto = await getContent('availableDates');
      datas = remoto && typeof remoto === 'object' && !Array.isArray(remoto) ? { ...remoto } : {};
      try {
        const lembretesRemotos = await getContent('agendaReminders');
        lembretes = lembretesRemotos && typeof lembretesRemotos === 'object' && !Array.isArray(lembretesRemotos) ? { ...lembretesRemotos } : {};
        lembretesCarregados = true;
      } catch {
        lembretesCarregados = false;
        estado.textContent = 'Datas carregadas. Não foi possível carregar os lembretes; volte a esta tela para tentar novamente.';
      }
      if (diaSelecionado && !campo.matches(':focus')) campo.value = lembretes[diaSelecionado] || '';
      if (lembretesCarregados) estado.textContent = '';
    } catch {
      estado.textContent = 'Não foi possível carregar a agenda. Volte a esta tela para tentar novamente.';
    } finally {
      ocupado = false;
      pintar();
    }
  }

  grade.addEventListener('click', async (evento) => {
    const botao = evento.target.closest('button[data-dia]');
    if (!botao || botao.disabled || ocupado) return;
    const chave = botao.dataset.dia;
    if (modo === 'lembretes') { selecionarDia(chave); return; }
    const anterior = { ...datas };
    if (datas[chave]) delete datas[chave];
    else datas[chave] = true;
    ocupado = true;
    estado.textContent = 'Salvando…';
    pintar();
    try {
      await putContent('availableDates', datas);
      estado.textContent = 'Disponibilidade salva.';
    } catch {
      datas = anterior;
      estado.textContent = 'Não foi possível salvar. Tente novamente.';
    } finally {
      ocupado = false;
      pintar();
    }
  });
  secao.querySelector('.agenda-modos').addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-modo]');
    if (!botao) return;
    if (botao.dataset.modo === 'lembretes' && !lembretesCarregados) { estado.textContent = 'Os lembretes ainda não estão disponíveis. Volte a esta tela para tentar novamente.'; return; }
    modo = botao.dataset.modo;
    for (const opcao of secao.querySelectorAll('.agenda-modos button')) opcao.setAttribute('aria-pressed', String(opcao === botao));
    secao.querySelector('.agenda-instrucao').textContent = modo === 'lembretes'
      ? 'Toque em um dia para criar ou editar um lembrete pessoal.'
      : 'Toque em um dia para disponibilizá-lo no calendário do site.';
    formulario.hidden = modo !== 'lembretes' || !diaSelecionado;
    pintar();
  });
  async function salvarLembretes(novos) {
    if (!lembretesCarregados) return;
    ocupado = true;
    estadoLembrete.textContent = 'Salvando…';
    pintar();
    try {
      await putContent('agendaReminders', novos);
      lembretes = novos;
      estadoLembrete.textContent = 'Lembrete salvo.';
      secao.querySelector('.agenda-excluir').disabled = !lembretes[diaSelecionado];
    } catch {
      estadoLembrete.textContent = 'Não foi possível salvar. Tente novamente.';
    } finally {
      ocupado = false;
      pintar();
    }
  }
  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (!diaSelecionado || ocupado) return;
    const texto = campo.value.trim();
    if (!texto) { estadoLembrete.textContent = 'Escreva o lembrete ou use Excluir lembrete.'; return; }
    salvarLembretes({ ...lembretes, [diaSelecionado]: texto });
  });
  secao.querySelector('.agenda-excluir').addEventListener('click', () => {
    if (!diaSelecionado || ocupado || !lembretes[diaSelecionado]) return;
    const novos = { ...lembretes };
    delete novos[diaSelecionado];
    salvarLembretes(novos).then(() => { if (!lembretes[diaSelecionado]) campo.value = ''; });
  });
  secao.querySelector('.agenda-anterior').addEventListener('click', () => { mes = new Date(mes.getFullYear(), mes.getMonth() - 1, 1); pintar(); });
  secao.querySelector('.agenda-proximo').addEventListener('click', () => { mes = new Date(mes.getFullYear(), mes.getMonth() + 1, 1); pintar(); });
  secao.querySelector('.agenda-hoje').addEventListener('click', () => { const atual = hoje(); mes = new Date(atual.getFullYear(), atual.getMonth(), 1); pintar(); });
  carregar();
  return carregar;
}
