import { esc } from './comum.js';
import { getContent, putContent } from '../../../js/api.js?v=clientes-auto-20261123';

export function montar(secao) {
  let clientes = [], carregado = false, ocupado = false, editando = null;
  let selecionados = new Set();
  function mensagemErro(err) {
    if (!err) return 'Erro desconhecido';
    if (err instanceof Error) return err.message || 'Erro';
    if (typeof err === 'string') return err;
    if (err?.message) return String(err.message);
    if (err?.target?.error?.message) return String(err.target.error.message);
    if (err instanceof Event) return 'Falha ao carregar recurso externo.';
    try { return JSON.stringify(err); } catch { return 'Erro desconhecido'; }
  }

  secao.innerHTML = `<div class="tela-cabeca"><div><h2 id="titulo-clientes">Clientes</h2><p>Cadastre nome, e-mail e WhatsApp para vincular e enviar galerias.</p></div><span class="clientes-total"></span></div>
    <div class="clientes-abas" role="tablist" aria-label="Clientes"><button id="clientes-tab-lista" role="tab" aria-selected="true" aria-controls="clientes-lista" data-aba="lista">Todos os clientes</button><button id="clientes-tab-cadastro" role="tab" aria-selected="false" aria-controls="clientes-cadastro" data-aba="cadastro">Adicionar cliente</button></div>
    <p class="clientes-status" role="status" aria-live="polite"></p>
    <div id="clientes-lista" role="tabpanel" aria-labelledby="clientes-tab-lista"><div class="clientes-busca"><input type="search" placeholder="Buscar por nome, telefone ou e-mail" aria-label="Buscar clientes"><label class="botao botao-secundario clientes-importar">Importar XLSX/CSV<input type="file" accept=".xlsx,.xls,.csv" hidden data-importar></label><button class="botao botao-perigo clientes-excluir-lote" type="button" data-excluir-lote disabled>Excluir selecionados</button></div><div class="clientes-resultados"></div></div>
    <div id="clientes-cadastro" role="tabpanel" aria-labelledby="clientes-tab-cadastro" hidden><form class="clientes-form"><div class="clientes-form-cabeca"><h3>Novo cliente</h3><p>Preencha os dados para manter seus contatos organizados.</p></div><div class="clientes-campos">
    <label>Nome completo <span>*</span><input name="nome" autocomplete="name" required maxlength="160" placeholder="Nome do cliente"></label>
    <label>Telefone / WhatsApp *<input name="telefone" type="tel" autocomplete="tel" required minlength="8" maxlength="30" placeholder="(81) 99999-9999"></label>
    <label>E-mail *<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="nome@exemplo.com"></label>
    <label>Empresa / marca<input name="empresa" autocomplete="organization" maxlength="160" placeholder="Nome da empresa, se houver"></label>
    <label>Cidade<input name="cidade" autocomplete="address-level2" maxlength="160" placeholder="Cidade do cliente"></label>
    <label class="clientes-notas">Observações<textarea name="observacoes" rows="4" maxlength="3000" placeholder="Preferências, tipo de trabalho e outras informações úteis"></textarea></label></div>
    <div class="clientes-form-rodape"><small>* Campo obrigatório</small><button type="button" data-cancelar>Cancelar</button><button type="submit" class="clientes-salvar">Salvar cliente</button></div></form></div>`;

  const form = secao.querySelector('form');
  const status = secao.querySelector('[role="status"]');
  const busca = secao.querySelector('[type="search"]');
  const inputImportar = secao.querySelector('[data-importar]');
  const btnExcluirLote = secao.querySelector('[data-excluir-lote]');

  function aba(nome) {
    secao.querySelectorAll('[role="tab"]').forEach(b => { const ativa = b.dataset.aba === nome; b.setAttribute('aria-selected', String(ativa)); b.tabIndex = ativa ? 0 : -1; });
    secao.querySelector('#clientes-lista').hidden = nome !== 'lista';
    secao.querySelector('#clientes-cadastro').hidden = nome !== 'cadastro';
  }

  function normalizarTexto(v) { return String(v ?? '').trim().replace(/\s+/g, ' '); }
  function normalizarEmail(v) { const s = normalizarTexto(v).toLowerCase(); return s || ''; }
  function normalizarTelefone(v) { return String(v ?? '').replace(/\D/g, ''); }
  function emailValido(v) { return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  function listar() {
    const termo = busca.value.trim().toLocaleLowerCase('pt-BR');
    const numeros = termo.replace(/\D/g, '');
    const visiveis = clientes.filter(c => [c.nome,c.email,c.empresa,c.cidade,c.telefone].some(v => (v || '').toLocaleLowerCase('pt-BR').includes(termo)) || numeros.length >= 3 && (c.telefone || '').replace(/\D/g,'').includes(numeros)).sort((a,b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    secao.querySelector('.clientes-total').textContent = `${clientes.length} cliente${clientes.length === 1 ? '' : 's'}`;
    secao.querySelector('.clientes-resultados').innerHTML = visiveis.length ? `<div class="clientes-tabela"><table><thead><tr><th><input type="checkbox" data-selecionar-todos aria-label="Selecionar todos"></th><th>Cliente</th><th>Telefone</th><th>E-mail</th><th>Cidade</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${visiveis.map(c => `<tr><td><input type="checkbox" data-sel="${esc(c.id)}" ${selecionados.has(c.id) ? 'checked' : ''}></td><td><div class="clientes-pessoa"><span class="clientes-avatar" aria-hidden="true">${esc(c.nome.trim().split(/\s+/).slice(0,2).map(n => n[0]).join('').toUpperCase())}</span><div><strong>${esc(c.nome)}</strong><small>${esc(c.empresa || '')}</small></div></div></td><td data-label="WhatsApp">${esc(c.telefone || '-')}</td><td data-label="E-mail">${esc(c.email || '-')}</td><td data-label="Cidade">${esc(c.cidade || '-')}</td><td><button data-editar="${esc(c.id)}" aria-label="Editar ${esc(c.nome)}">Editar</button><button data-excluir="${esc(c.id)}" class="botao-perigo" aria-label="Excluir ${esc(c.nome)}">Excluir</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="clientes-vazio"><svg><use href="#i-clientes"/></svg><h3>${termo ? 'Nenhum cliente encontrado' : 'Seu próximo trabalho começa com um contato'}</h3><p>${termo ? 'Tente buscar por outro nome ou contato.' : 'Adicione seu primeiro cliente para ter os dados sempre à mão.'}</p>${termo ? '' : '<button data-aba="cadastro">Adicionar cliente</button>'}</div>`;
    atualizarLote();
  }

  function atualizarLote() {
    const n = selecionados.size;
    btnExcluirLote.disabled = n === 0 || ocupado;
    btnExcluirLote.textContent = n ? `Excluir ${n} selecionado${n === 1 ? '' : 's'}` : 'Excluir selecionados';
  }

  async function carregar() {
    if (ocupado) return;
    status.textContent = 'Carregando clientes.';
    try { const dados = await getContent('clientes'); clientes = Array.isArray(dados) ? dados : []; carregado = true; listar(); status.textContent = ''; }
    catch(e) { status.textContent = `Não foi possível carregar os clientes. ${e?.message || e}`; }
  }

  busca.addEventListener('input', listar);
  secao.querySelector('[role="tablist"]').addEventListener('keydown', e => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
    e.preventDefault(); const nome = e.key === 'Home' || e.key === 'ArrowLeft' ? 'lista' : 'cadastro';
    secao.querySelector(`[data-aba="${nome}"]`).click(); secao.querySelector(`[data-aba="${nome}"]`).focus();
  });

  secao.addEventListener('change', (e) => {
    const cb = e.target.closest('input[type="checkbox"]');
    if (!cb) return;
    if (cb.dataset.selecionarTodos !== undefined) {
      const visiveis = secao.querySelectorAll('tbody input[data-sel]');
      const marcar = cb.checked;
      visiveis.forEach(c => { if (marcar) selecionados.add(c.dataset.sel); else selecionados.delete(c.dataset.sel); c.checked = marcar; });
      atualizarLote();
      return;
    }
    if (cb.dataset.sel) {
      if (cb.checked) selecionados.add(cb.dataset.sel); else selecionados.delete(cb.dataset.sel);
      atualizarLote();
    }
  });

  secao.addEventListener('click', async (e) => {
    if (ocupado) return;
    const botao = e.target.closest('button'); if(!botao) return;
    if (botao.dataset.aba) {
      if (botao.dataset.aba === 'cadastro') { form.reset(); editando = null; form.querySelector('h3').textContent = 'Novo cliente'; }
      aba(botao.dataset.aba); if (botao.dataset.aba === 'lista') carregar();
    }
    if (botao.hasAttribute('data-cancelar')) { form.reset(); editando = null; form.querySelector('h3').textContent = 'Novo cliente'; aba('lista'); carregar(); }
    if (botao.dataset.editar) {
      const cliente = clientes.find(c => c.id === botao.dataset.editar); if(!cliente) return;
      editando = cliente; for(const campo of ['nome','telefone','email','empresa','cidade','observacoes']) form.elements[campo].value = cliente[campo] || '';
      form.querySelector('h3').textContent = 'Editar cliente'; aba('cadastro'); form.elements.nome.focus();
    }
    if (botao.dataset.excluir) {
      const cliente = clientes.find(c => c.id === botao.dataset.excluir); if(!cliente) return;
      if (!confirm(`Excluir "${cliente.nome}"? Esta ação não pode ser desfeita.`)) return;
      ocupado = true; status.textContent = 'Excluindo cliente.';
      try {
        const lista = clientes.filter(c => c.id !== cliente.id);
        await putContent('clientes', lista);
        clientes = lista; selecionados.delete(cliente.id); listar(); status.textContent = 'Cliente excluído.';
      } catch (err) { status.textContent = `Falha ao excluir: ${mensagemErro(err)}`; }
      finally { ocupado = false; atualizarLote(); }
    }
    if (botao.hasAttribute('data-excluir-lote')) {
      const ids = [...selecionados];
      if (!ids.length) return;
      if (!confirm(`Excluir ${ids.length} cliente(s) selecionado(s)?`)) return;
      ocupado = true; status.textContent = 'Excluindo clientes.';
      try {
        const lista = clientes.filter(c => !selecionados.has(c.id));
        await putContent('clientes', lista);
        clientes = lista; selecionados.clear(); listar(); status.textContent = `${ids.length} cliente(s) excluído(s).`;
      } catch (err) { status.textContent = `Falha ao excluir: ${mensagemErro(err)}`; }
      finally { ocupado = false; atualizarLote(); }
    }
  });

  form.addEventListener('submit', async e => {
    e.preventDefault(); if(ocupado || !form.reportValidity()) return;
    const campos = Object.fromEntries([...new FormData(form)].map(([k,v]) => [k,v.trim()]));
    if(!campos.nome) { status.textContent = 'Informe o nome do cliente.'; form.elements.nome.focus(); return; }
    ocupado = true; form.querySelectorAll('input,textarea,button').forEach(el => el.disabled = true); status.textContent = 'Salvando cliente.';
    try {
      const atuais = await getContent('clientes'); const lista = Array.isArray(atuais) ? atuais : [];
      const dadosCliente = { id: editando?.id || crypto.randomUUID(), nome: campos.nome, telefone: campos.telefone, email: campos.email, empresa: campos.empresa, cidade: campos.cidade, observacoes: campos.observacoes };
      const idx = lista.findIndex(c => c.id === dadosCliente.id);
      if (idx >= 0) lista[idx] = dadosCliente; else lista.push(dadosCliente);
      await putContent('clientes', lista);
      clientes = lista; listar(); form.reset(); editando = null; form.querySelector('h3').textContent = 'Novo cliente'; aba('lista'); status.textContent = 'Cliente salvo.';
    } catch (err) { status.textContent = `Falha ao salvar: ${mensagemErro(err)}`; }
    finally { ocupado = false; form.querySelectorAll('input,textarea,button').forEach(el => el.disabled = false); }
  });

  // Importação
  function normalizarCabecalho(h) { return String(h ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' '); }
  const MAPA = {
    nome: ['nome', 'cliente', 'name', 'nome completo'],
    email: ['email', 'e-mail', 'mail'],
    telefone: ['telefone', 'celular', 'whatsapp', 'phone', 'tel', 'fone'],
    empresa: ['empresa', 'marca', 'company'],
    cidade: ['cidade', 'city'],
    observacoes: ['observacoes', 'observacao', 'obs', 'notas', 'observations']
  };
  function mapearColunas(headers) {
    const mapa = {};
    headers.forEach((h, i) => {
      const n = normalizarCabecalho(h);
      for (const [campo, aliases] of Object.entries(MAPA)) {
        if (aliases.includes(n)) { mapa[campo] = i; break; }
      }
    });
    return mapa;
  }

  async function carregarXLSX() {
    if (window.XLSX) return window.XLSX;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('../vendor/xlsx.full.min.js', import.meta.url).href;
      const prazo=setTimeout(()=>reject(new Error('A leitura da planilha demorou demais. Tente novamente.')),15000);
      s.onload = () => {clearTimeout(prazo);window.XLSX ? resolve() : reject(new Error('Biblioteca de planilhas não carregou.'));};
      s.onerror = () => {clearTimeout(prazo);reject(new Error('Não foi possível carregar a biblioteca de planilhas.'));};
      document.head.appendChild(s);
    });
    if (!window.XLSX) throw new Error('Biblioteca de planilhas indisponível.');
    return window.XLSX;
  }

  function parseCSV(texto) {
    const linhas = texto.split(/\r?\n/).filter(l => l.trim());
    const headers = linhas[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
    return { headers, rows: linhas.slice(1).map(l => l.split(',').map(v => v.replace(/^"|"$/g, '').trim())) };
  }

  function validarCliente(c) {
    const erros = [];
    if (!c.nome) erros.push('Nome obrigatório');
    if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) erros.push('E-mail inválido');
    if (c.telefone && !/^\+?[\d\s().-]{8,30}$/.test(c.telefone)) erros.push('Telefone inválido');
    return erros;
  }

  function normalizarCliente(raw, mapa, headers) {
    const get = (campo) => {
      const idx = mapa[campo];
      if (idx === undefined) return '';
      return normalizarTexto(raw[idx] ?? raw[campo] ?? '');
    };
    return {
      id: crypto.randomUUID(),
      nome: get('nome'),
      email: normalizarEmail(get('email')),
      telefone: normalizarTexto(get('telefone')),
      empresa: get('empresa'),
      cidade: get('cidade'),
      observacoes: get('observacoes')
    };
  }

  async function processarArquivo(arquivo) {
    status.textContent = 'Lendo arquivo…';
    if(arquivo.size>10*1024*1024)throw new Error('Arquivo acima de 10 MB. Divida a lista em arquivos menores.');
    let headers = [], rows = [];
    {
      const XLSX = await carregarXLSX();
      status.textContent = 'Abrindo planilha…';
      const buf = await arquivo.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if(!ws)throw new Error('A planilha está vazia.');
      const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
      headers = (json[0] || []).map(h => String(h));
      rows = json.slice(1);
    }
    status.textContent = 'Conferindo clientes…';
    const mapa = mapearColunas(headers);
    if (mapa.nome === undefined) throw new Error('Coluna NOME não encontrada.');
    const registros = rows.filter(r => (Array.isArray(r) ? r : Object.values(r)).some(v => String(v).trim())).map(r => {
      const arr = Array.isArray(r) ? r : headers.map(h => r[h]);
      return normalizarCliente(arr, mapa, headers);
    });
    return registros;
  }

  async function importarClientes(registros) {
    if(!carregado)throw new Error('A lista atual não carregou. Atualize a página antes de importar.');
    const lista=clientes.slice();
    const porEmail=new Set(lista.map(c=>normalizarEmail(c.email)).filter(Boolean));
    const porTelefone=new Set(lista.map(c=>normalizarTelefone(c.telefone)).filter(Boolean));
    let incluidos=0,duplicados=0,invalidos=0;
    for(const contato of registros){
      if(validarCliente(contato).length){invalidos++;continue;}
      const email=normalizarEmail(contato.email),telefone=normalizarTelefone(contato.telefone);
      if((email&&porEmail.has(email))||(telefone&&porTelefone.has(telefone))){duplicados++;continue;}
      lista.push(contato);incluidos++;
      if(email)porEmail.add(email);
      if(telefone)porTelefone.add(telefone);
    }
    if(!incluidos){status.textContent=`Nenhum cliente novo: ${duplicados} duplicado(s), ${invalidos} inválido(s).`;return;}
    status.textContent=`Salvando ${incluidos} cliente(s)…`;
    const controle=new AbortController();
    const prazo=setTimeout(()=>controle.abort(),30000);
    try{await putContent('clientes',lista,{signal:controle.signal});}
    catch(erro){if(erro.name==='AbortError')throw new Error('O servidor demorou para salvar. Atualize a página para conferir antes de tentar novamente.');throw erro;}
    finally{clearTimeout(prazo);}
    clientes=lista;listar();
    status.textContent=`Importação concluída: ${incluidos} incluído(s), ${duplicados} duplicado(s) e ${invalidos} inválido(s) ignorado(s).`;
  }
  inputImportar?.addEventListener('change', async (e) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (ocupado) return;
    ocupado = true;
    try {
      const registros = await processarArquivo(arquivo);
      await importarClientes(registros);
    } catch (err) {
      status.textContent = `Falha ao importar: ${mensagemErro(err)}`;
    } finally {
      ocupado = false;
      e.target.value = '';
    }
  });

  carregar();
}
