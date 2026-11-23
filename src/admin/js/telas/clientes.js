import { esc } from './comum.js';
import { getContent, putContent } from '../../../js/api.js';

export function montar(secao) {
  let clientes = [], carregado = false, ocupado = false, editando = null;
  secao.innerHTML = `<div class="tela-cabeca"><div><h2 id="titulo-clientes">Clientes</h2><p>Cadastre nome, e-mail e WhatsApp para vincular e enviar galerias.</p></div><span class="clientes-total"></span></div>
    <div class="clientes-abas" role="tablist" aria-label="Clientes"><button id="clientes-tab-lista" role="tab" aria-selected="true" aria-controls="clientes-lista" data-aba="lista">Todos os clientes</button><button id="clientes-tab-cadastro" role="tab" aria-selected="false" aria-controls="clientes-cadastro" data-aba="cadastro">Adicionar cliente</button></div>
    <p class="clientes-status" role="status" aria-live="polite"></p>
    <div id="clientes-lista" role="tabpanel" aria-labelledby="clientes-tab-lista"><div class="clientes-busca"><input type="search" placeholder="Buscar por nome, telefone ou e-mail" aria-label="Buscar clientes"><label class="botao botao-secundario clientes-importar">Importar XLSX<input type="file" accept=".xlsx,.xls" hidden data-importar></label></div><div class="clientes-resultados"></div></div>
    <div id="clientes-cadastro" role="tabpanel" aria-labelledby="clientes-tab-cadastro" hidden><form class="clientes-form"><div class="clientes-form-cabeca"><h3>Novo cliente</h3><p>Preencha os dados para manter seus contatos organizados.</p></div><div class="clientes-campos">
    <label>Nome completo <span>*</span><input name="nome" autocomplete="name" required maxlength="160" placeholder="Nome do cliente"></label>
    <label>Telefone / WhatsApp *<input name="telefone" type="tel" autocomplete="tel" required minlength="8" maxlength="30" placeholder="(81) 99999-9999"></label>
    <label>E-mail *<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="nome@exemplo.com"></label>
    <label>Empresa / marca<input name="empresa" autocomplete="organization" maxlength="160" placeholder="Nome da empresa, se houver"></label>
    <label>Cidade<input name="cidade" autocomplete="address-level2" maxlength="160" placeholder="Cidade do cliente"></label>
    <label class="clientes-notas">Observações<textarea name="observacoes" rows="4" maxlength="3000" placeholder="Preferências, tipo de trabalho e outras informações úteis"></textarea></label></div>
    <div class="clientes-form-rodape"><small>* Campo obrigatório</small><button type="button" data-cancelar>Cancelar</button><button type="submit" class="clientes-salvar">Salvar cliente</button></div></form></div>`;
  const form = secao.querySelector('form'), status = secao.querySelector('[role="status"]'), busca = secao.querySelector('[type="search"]');
  function aba(nome) {
    secao.querySelectorAll('[role="tab"]').forEach(b => { const ativa = b.dataset.aba === nome; b.setAttribute('aria-selected', String(ativa)); b.tabIndex = ativa ? 0 : -1; });
    secao.querySelector('#clientes-lista').hidden = nome !== 'lista';
    secao.querySelector('#clientes-cadastro').hidden = nome !== 'cadastro';
  }
  function listar() {
    const termo = busca.value.trim().toLocaleLowerCase('pt-BR');
    const numeros = termo.replace(/\D/g, '');
    const visiveis = clientes.filter(c => [c.nome,c.email,c.empresa,c.cidade,c.telefone].some(v => (v || '').toLocaleLowerCase('pt-BR').includes(termo)) || numeros.length >= 3 && (c.telefone || '').replace(/\D/g,'').includes(numeros)).sort((a,b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    secao.querySelector('.clientes-total').textContent = `${clientes.length} cliente${clientes.length === 1 ? '' : 's'}`;
    secao.querySelector('.clientes-resultados').innerHTML = visiveis.length ? `<div class="clientes-tabela"><table><thead><tr><th>Cliente</th><th>Telefone</th><th>E-mail</th><th>Cidade</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${visiveis.map(c => `<tr><td><div class="clientes-pessoa"><span class="clientes-avatar" aria-hidden="true">${esc(c.nome.trim().split(/\s+/).slice(0,2).map(n => n[0]).join('').toUpperCase())}</span><div><strong>${esc(c.nome)}</strong><small>${esc(c.empresa || '')}</small></div></div></td><td data-label="WhatsApp">${esc(c.telefone || '—')}</td><td data-label="E-mail">${esc(c.email || '—')}</td><td data-label="Cidade">${esc(c.cidade || '—')}</td><td><button data-editar="${esc(c.id)}" aria-label="Editar ${esc(c.nome)}">Editar</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="clientes-vazio"><svg><use href="#i-clientes"/></svg><h3>${termo ? 'Nenhum cliente encontrado' : 'Seu próximo trabalho começa com um contato'}</h3><p>${termo ? 'Tente buscar por outro nome ou contato.' : 'Adicione seu primeiro cliente para ter os dados sempre à mão.'}</p>${termo ? '' : '<button data-aba="cadastro">Adicionar cliente</button>'}</div>`;
  }
  async function carregar() {
    if (ocupado || !secao.querySelector('#clientes-cadastro').hidden) return;
    status.textContent = 'Carregando clientes…';
    try { const dados = await getContent('clientes'); clientes = Array.isArray(dados) ? dados : []; carregado = true; listar(); status.textContent = ''; }
    catch(e) { status.textContent = `Não foi possível carregar os clientes. ${e.message}`; }
  }
  busca.addEventListener('input', listar);
  const inputImportar = secao.querySelector('[data-importar]');
  inputImportar?.addEventListener('change', async (e) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    status.textContent = 'Importando clientes…';
    try {
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
      const buf = await arquivo.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const novos = linhas.map((l) => ({
        id: crypto.randomUUID(),
        nome: String(l.nome || l.Nome || '').trim(),
        telefone: String(l.telefone || l.Telefone || l.whatsapp || '').trim(),
        email: String(l.email || l.Email || l['e-mail'] || '').trim(),
        empresa: String(l.empresa || l.Empresa || l.marca || '').trim(),
        cidade: String(l.cidade || l.Cidade || '').trim(),
        observacoes: String(l.observacoes || l.Observações || l.obs || '').trim()
      })).filter((c) => c.nome);
      const atuais = await getContent('clientes');
      const lista = Array.isArray(atuais) ? atuais : [];
      const mesclados = [...lista, ...novos];
      await putContent('clientes', mesclados);
      clientes = mesclados; carregado = true; listar();
      status.textContent = `${novos.length} cliente(s) importado(s).`;
    } catch (err) {
      status.textContent = `Falha ao importar: ${err.message}`;
    } finally {
      e.target.value = '';
    }
  });
  secao.querySelector('[role="tablist"]').addEventListener('keydown', e => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
    e.preventDefault(); const nome = e.key === 'Home' || e.key === 'ArrowLeft' ? 'lista' : 'cadastro';
    secao.querySelector(`[data-aba="${nome}"]`).click(); secao.querySelector(`[data-aba="${nome}"]`).focus();
  });
  secao.addEventListener('click', e => {
    if (ocupado) return;
    const botao = e.target.closest('button'); if(!botao) return;
    if(botao.dataset.aba) { if(botao.dataset.aba === 'cadastro') { form.reset(); editando = null; form.querySelector('h3').textContent = 'Novo cliente'; } aba(botao.dataset.aba); if(botao.dataset.aba === 'lista') carregar(); }
    if(botao.hasAttribute('data-cancelar')) { form.reset(); editando = null; form.querySelector('h3').textContent = 'Novo cliente'; aba('lista'); carregar(); }
    if(botao.dataset.editar) {
      const cliente = clientes.find(c => c.id === botao.dataset.editar); if(!cliente) return;
      editando = cliente; for(const campo of ['nome','telefone','email','empresa','cidade','observacoes']) form.elements[campo].value = cliente[campo] || '';
      form.querySelector('h3').textContent = 'Editar cliente'; aba('cadastro'); form.elements.nome.focus();
    }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault(); if(ocupado || !form.reportValidity()) return;
    const campos = Object.fromEntries([...new FormData(form)].map(([k,v]) => [k,v.trim()]));
    if(!campos.nome) { status.textContent = 'Informe o nome do cliente.'; form.elements.nome.focus(); return; }
    ocupado = true; form.querySelectorAll('input,textarea,button').forEach(el => el.disabled = true); status.textContent = 'Salvando cliente…';
    try {
      // Relê antes de salvar para preservar clientes cadastrados em outra tela.
      const atuais = await getContent('clientes'); const lista = Array.isArray(atuais) ? atuais : [];
      if(editando && !lista.some(c => c.id === editando.id)) throw new Error('Este cliente não existe mais. Atualize a lista.');
      const cliente = {...campos, id: editando?.id || crypto.randomUUID(), criadoEm: editando?.criadoEm || new Date().toISOString()};
      const novos = editando ? lista.map(c => c.id === cliente.id ? cliente : c) : [...lista, cliente];
      await putContent('clientes', novos); clientes = novos; carregado = true; editando = null; form.reset(); form.querySelector('h3').textContent = 'Novo cliente'; busca.value = ''; listar(); aba('lista'); status.textContent = 'Cliente salvo com sucesso.';
    } catch(e) { status.textContent = `Não foi possível salvar. ${e.message}`; }
    finally { ocupado = false; form.querySelectorAll('input,textarea,button').forEach(el => el.disabled = false); }
  });
  carregar(); return () => { if(!carregado || secao.querySelector('#clientes-cadastro').hidden) carregar(); };
}
