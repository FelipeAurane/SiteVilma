const api = (acao, args) => window.luvi.galeria(acao, args);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function pastaVisual(caminho) {
  return '<span class="hd-pasta-3d" aria-hidden="true" data-previa="'+esc(caminho)+'"><span class="hd-pasta-costas"></span><span class="hd-pasta-fotos"><span></span><span></span><span></span></span><span class="hd-pasta-frente"></span></span>';
}
const imagem = (p, mini = false) => `painel://app/_galeria/imagem?caminho=${encodeURIComponent(p)}${mini ? '&miniatura=1' : ''}`;

function formulario(titulo, valor = '') {
  return new Promise(resolve => {
    const modal = document.createElement('dialog');
    modal.className = 'hd-dialog';
    modal.innerHTML = `<form method="dialog"><h3>${esc(titulo)}</h3><input name="nome" required value="${esc(valor)}" autocomplete="off"><div class="hd-acoes"><button value="cancelar" formnovalidate>Cancelar</button><button value="salvar">Salvar</button></div></form>`;
    document.body.append(modal);
    modal.addEventListener('close', () => { resolve(modal.returnValue === 'salvar' ? modal.querySelector('input').value : null); modal.remove(); }, { once: true });
    modal.showModal(); modal.querySelector('input').select();
  });
}

function navegador(host, escolher) {
  let atual = '', itens = [], selecionadas = new Set(), limite = 120, sequencia = 0, ocupado = false;
  host.innerHTML = `<div class="hd-navegacao"><button class="hd-voltar" data-hd="voltar" hidden aria-label="Voltar à pasta anterior">← Voltar</button><nav class="hd-caminho" aria-label="Caminho da pasta"></nav><input type="search" aria-label="Buscar nesta pasta" placeholder="Buscar nesta pasta"></div><p class="hd-status" role="status" aria-live="polite"></p><div class="hd-grade" role="listbox" aria-label="Fotos e pastas" aria-multiselectable="true"></div><div class="hd-acoes"><button data-hd="mais" hidden>Mostrar mais</button>${escolher ? '<button data-hd="usar">Usar fotos selecionadas</button>' : ''}</div>`;

  const status = host.querySelector('.hd-status'), grade = host.querySelector('.hd-grade');
  const cachePrevias = new Map();
  const observador = new IntersectionObserver(entradas => {
    for(const entrada of entradas) {
      if(!entrada.isIntersecting) continue;
      const alvo=entrada.target; observador.unobserve(alvo);
      const caminho=alvo.dataset.previa;
      const promessa=cachePrevias.get(caminho) || api('previas', {pasta:caminho}).catch(()=>[]);
      cachePrevias.set(caminho,promessa);
      promessa.then(fotos => {
        if(!alvo.isConnected) return;
        const slots=alvo.querySelectorAll('.hd-pasta-fotos>span');
        fotos.slice(0,3).forEach((foto,i)=> {
          const img=document.createElement('img'); img.src=imagem(foto,true); img.alt=''; img.loading='lazy';
          img.addEventListener('error',()=>img.remove(),{once:true}); slots[i].append(img);
        });
      });
    }
  }, {rootMargin:'100px'});
  function desenhar() {
    const busca = host.querySelector('input').value.toLocaleLowerCase();
    const filtrados = itens.filter(i => i.nome.toLocaleLowerCase().includes(busca));
    grade.innerHTML = filtrados.slice(0, limite).map(i => `<article role="option" aria-selected="${selecionadas.has(i.caminho)}" tabindex="0" class="hd-item ${selecionadas.has(i.caminho) ? 'selecionada' : ''}" data-caminho="${esc(i.caminho)}" ${i.pasta ? 'data-pasta="1"' : 'draggable="true" data-foto="1"'}>${i.pasta ? pastaVisual(i.caminho) : `<div class="hd-foto"><img loading="lazy" decoding="async" src="${imagem(i.caminho, true)}" alt=""></div>`}<span class="hd-nome" title="${esc(i.nome)}">${esc(i.nome)}</span></article>`).join('');
    if (!filtrados.length) grade.innerHTML = `<div class="hd-sem-fotos"><svg><use href="#i-selecao"/></svg><h3>${busca ? 'Nenhum resultado' : 'Uma pasta, novas possibilidades'}</h3><p>${busca ? 'Tente outro nome para encontrar suas fotos.' : 'Esta pasta ainda não contém imagens ou subpastas.'}</p></div>`;
    observador.disconnect(); grade.querySelectorAll('[data-previa]').forEach(e=>observador.observe(e));
    host.querySelector('[data-hd="mais"]').hidden = filtrados.length <= limite;
    status.textContent = `${itens.filter(i => i.pasta).length} pastas · ${itens.filter(i => !i.pasta).length} imagens · ${selecionadas.size} selecionadas`;


  }
  async function carregar(pasta = atual) {
    const id = ++sequencia;
    status.textContent = 'Lendo pasta…';
    try {
      const dados = await api('listar', { pasta });
      if (id !== sequencia) return;
      atual = pasta; itens = dados.itens; limite = 120;
      host.querySelector('[data-hd="voltar"]').hidden = !atual;
      host.querySelector('.hd-caminho').innerHTML = `<button data-abrir="">Fotos do HD</button>` + atual.split('/').filter(Boolean).map((parte, i, partes) => ` / <button data-abrir="${esc(partes.slice(0, i+1).join('/'))}">${esc(parte)}</button>`).join('');
      host.querySelector('.hd-caminho').title = dados.raiz;
      desenhar();
    } catch(e) { if (id === sequencia) { grade.replaceChildren(); status.textContent = `${e.message} Verifique o HD e a pasta em Ajustes.`; } }
  }
  async function mover(caminhos, destino) {
    if (ocupado || !caminhos.length) return;
    ocupado = true;
    let feitos = 0, erro;
    try {
      for (const caminho of caminhos) { await api('mover', { caminho, destino }); selecionadas.delete(caminho); feitos++; }
    } catch(e) { erro = e.message; }
    finally { ocupado = false; await carregar(); status.textContent = `${feitos} foto(s) movida(s). ${erro || ''}`; }
  }
  host.addEventListener('input', e => { if (e.target.type === 'search') { limite = 120; desenhar(); } });
  const interagir = async e => {
    const abrir = e.target.closest('[data-abrir]'), ver = e.type === 'dblclick' ? e.target.closest('[data-foto]') : null;
    const card = e.target.closest('.hd-item');
    if(card && e.type === 'click') {
      if(!e.ctrlKey && !e.metaKey) selecionadas.clear();
      if((e.ctrlKey || e.metaKey) && selecionadas.has(card.dataset.caminho)) selecionadas.delete(card.dataset.caminho);
      else if(card.dataset.foto) selecionadas.add(card.dataset.caminho);
      grade.querySelectorAll('.hd-item').forEach(el=> { const ativo=selecionadas.has(el.dataset.caminho) || el === card && !!el.dataset.pasta; el.classList.toggle('selecionada',ativo); el.setAttribute('aria-selected',String(ativo)); });
    }
    if(card?.dataset.pasta && e.type === 'dblclick') return carregar(card.dataset.caminho);
    if (abrir) return carregar(abrir.dataset.abrir);
    if (ver) {
      const d = document.createElement('dialog'); d.className = 'hd-preview';
      const fotos = itens.filter(i => !i.pasta);
      let indice = fotos.findIndex(i => i.caminho === ver.dataset.caminho);
      d.innerHTML = '<header><div><span class="hd-eyebrow">VISUALIZAÇÃO</span><h3></h3></div><form method="dialog"><button aria-label="Fechar visualização">✕</button></form></header><div class="hd-preview-corpo"><button data-passo="-1" aria-label="Foto anterior">‹</button><img alt=""><button data-passo="1" aria-label="Próxima foto">›</button></div><footer></footer>';
      const atualizar = () => { const foto = fotos[indice]; const img = d.querySelector('img'); img.src = imagem(foto.caminho, true); const grande = new Image(); grande.onload = () => { if(fotos[indice].caminho === foto.caminho) img.src = grande.src; }; grande.src = imagem(foto.caminho); d.querySelector('img').alt = foto.nome; d.querySelector('h3').textContent = foto.nome; d.querySelector('footer').textContent = `${indice + 1} de ${fotos.length} · Use as setas para navegar · Esc para fechar`; };
      const passo = n => { indice = (indice + n + fotos.length) % fotos.length; atualizar(); };
      d.addEventListener('click', ev => { const b = ev.target.closest('[data-passo]'); if(b) passo(Number(b.dataset.passo)); });
      d.addEventListener('keydown', ev => { if(ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); passo(ev.key === 'ArrowLeft' ? -1 : 1); } });
      atualizar();
      document.body.append(d); d.addEventListener('close', () => d.remove(), { once:true }); d.showModal(); return;
    }
    const acao = e.target.closest('[data-hd]')?.dataset.hd;
    if (!acao || ocupado) return;
    try {
      if (acao === 'voltar') await carregar(atual.split('/').slice(0,-1).join('/'));
      if (acao === 'atualizar') { cachePrevias.clear(); await carregar(); }
      if (acao === 'mais') { limite += 120; desenhar(); }
      if (acao === 'mover') await mover([...selecionadas], atual);
      if (acao === 'criar' || acao === 'renomear') {
        const nome = await formulario(acao === 'criar' ? 'Nova pasta' : 'Renomear pasta', acao === 'renomear' ? atual.split('/').pop() : '');
        if (nome === null) return;
        await api(acao, { pasta: atual, caminho: atual, nome });
        selecionadas.clear();
        await carregar(acao === 'renomear' ? atual.split('/').slice(0,-1).join('/') : atual);
      }
      if (acao === 'usar') {
        if (!selecionadas.size) throw new Error('Selecione uma foto.');
        ocupado = true; status.textContent = 'Preparando fotos…';
        try { await escolher([...selecionadas]); } finally { ocupado = false; }
      }
    } catch(e) { status.textContent = e.message; }
  };
  host.addEventListener('click', interagir);
  host.addEventListener('dblclick', interagir);
  host.addEventListener('keydown', e => {
    if(e.key === 'Enter' && e.target.matches('.hd-item')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); }
    if(e.altKey && e.key === 'ArrowUp') { e.preventDefault(); carregar(atual.split('/').slice(0,-1).join('/')); }
    if(e.key === 'F2' && atual) { e.preventDefault(); executarMenu('renomear'); }
  });
  async function executarMenu(acao) {
    try {
      if(acao === 'atualizar') { cachePrevias.clear(); await carregar(); }
      if(acao === 'mover') await mover([...selecionadas],atual);
      if(acao === 'criar' || acao === 'renomear') {
        const nome=await formulario(acao === 'criar' ? 'Nova pasta' : 'Renomear pasta',acao === 'renomear' ? atual.split('/').pop() : '');
        if(nome === null) return;
        await api(acao,{pasta:atual,caminho:atual,nome}); selecionadas.clear();
        await carregar(acao === 'renomear' ? atual.split('/').slice(0,-1).join('/') : atual);
      }
    } catch(e) { status.textContent=e.message; }
  }
  host.addEventListener('contextmenu', e => {
    if(escolher) return; e.preventDefault();
    document.querySelector('.hd-menu')?.remove();
    const menu=document.createElement('div'); menu.className='hd-menu'; menu.setAttribute('role','menu');
    menu.innerHTML='<button data-menu="criar">Nova pasta</button><button data-menu="renomear" '+(!atual?'disabled':'')+'>Renomear pasta atual</button><button data-menu="atualizar">Atualizar</button>'+ (selecionadas.size?'<button data-menu="mover">Mover selecionadas para cá</button>':'');
    menu.style.left=Math.min(e.clientX,innerWidth-230)+'px'; menu.style.top=Math.min(e.clientY,innerHeight-180)+'px';
    document.body.append(menu); menu.querySelector('button').focus();
    menu.addEventListener('click', ev=>{const acao=ev.target.dataset.menu;if(acao){menu.remove();executarMenu(acao);}});
    setTimeout(()=>document.addEventListener('click',()=>menu.remove(),{once:true}),0);
    menu.addEventListener('keydown',ev=>{if(ev.key==='Escape')menu.remove();});
  });
  host.addEventListener('dragstart', e => {
    const card = e.target.closest('[draggable]'); if (!card || escolher) { e.preventDefault(); return; }
    e.dataTransfer.setData('application/x-luvi-fotos', JSON.stringify(selecionadas.has(card.dataset.caminho) ? [...selecionadas] : [card.dataset.caminho]));
    e.dataTransfer.effectAllowed = 'move';
  });
  host.addEventListener('dragover', e => { if (e.target.closest('[data-pasta], [data-abrir]') && e.dataTransfer.types.includes('application/x-luvi-fotos')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
  host.addEventListener('drop', e => {
    const destino = e.target.closest('[data-pasta], [data-abrir]'); if (!destino || escolher) return;
    e.preventDefault();
    try { const caminhos = JSON.parse(e.dataTransfer.getData('application/x-luvi-fotos')); if(Array.isArray(caminhos)) mover(caminhos, destino.dataset.abrir ?? destino.dataset.caminho); } catch { /* arrasto externo */ }
  });
  return carregar;
}

export function montar(secao) {
  let raizAtual, atualizarBiblioteca, pedido = 0;
  const boasVindas = (erro = '') => {
    secao.innerHTML = `<div class="hd-boas-vindas"><div class="hd-fotos-convite" aria-hidden="true"><img src="${new URL('../../img/galeria-1.jpg', import.meta.url).href}" alt=""><img src="${new URL('../../img/galeria-2.jpg', import.meta.url).href}" alt=""><img src="${new URL('../../img/galeria-3.jpg', import.meta.url).href}" alt=""></div><span class="hd-eyebrow">SUA GALERIA, POR PERTO</span><h2 id="titulo-galeria">Suas imagens começam aqui</h2><p>Selecione uma pasta ou HD do seu PC onde estão suas imagens.</p><button class="hd-primario" data-escolher-pasta><svg><use href="#i-selecao"/></svg>Abrir pasta</button><p class="hd-convite-nota">Suas fotos continuam no seu computador.</p><p class="hd-convite-erro" role="status">${esc(erro)}</p></div>`;
  };
  const atualizar = async () => {
    const id = ++pedido;
    try {
      const raiz = window.luvi?.galeria ? await api('config') : '';
      if(id !== pedido) return;
      if(!raiz) { raizAtual = ''; boasVindas(); return; }
      if(raiz !== raizAtual || !atualizarBiblioteca) {
        raizAtual = raiz;
        const nome = raiz.split(/[\\/]/).filter(Boolean).pop() || raiz;
        secao.innerHTML = `<div class="tela-cabeca hd-cabeca"><div><h2 id="titulo-galeria">Fotos do HD</h2></div></div><div class="hd-biblioteca"></div><p class="hd-erro-raiz" role="status"></p>`;
        atualizarBiblioteca = navegador(secao.querySelector('.hd-biblioteca'));
      }
      await atualizarBiblioteca();
    } catch(e) { boasVindas(e.message); raizAtual = null; }
  };
  secao.addEventListener('click', async e => {
    const botao = e.target.closest('[data-escolher-pasta]'); if(!botao) return;
    if(!window.luvi?.galeria) { secao.querySelector('[role="status"]').textContent = 'Abra o aplicativo Luvi no computador para escolher sua pasta.'; return; }
    botao.disabled = true;
    try { const pasta = await api('escolher'); if(pasta) await atualizar(); }
    catch(e) { secao.querySelector('[role="status"]').textContent = e.message; }
    finally { botao.disabled = false; }
  });
  boasVindas(); atualizar(); return atualizar;
}

export function montarAjustes(secao) {
  secao.innerHTML = '<div class="tela-cabeca"><div><h2 id="titulo-ajustes">Ajustes</h2><p>Biblioteca de fotos deste computador</p></div></div><div class="hd-config"><h3>Pasta das fotos no HD</h3><p>Escolha a pasta principal que contém as pastas dos clientes. As alterações feitas na galeria serão aplicadas aos arquivos do HD.</p><label>Caminho da pasta<input id="hd-raiz" placeholder="E:\\Fotos\\Clientes"></label><div class="hd-acoes"><button data-config="escolher">Procurar pasta…</button><button data-config="salvar">Salvar caminho</button><a href="#galeria">Abrir Fotos do HD →</a></div><p role="status"></p></div>';
  const campo = secao.querySelector('input'), status = secao.querySelector('[role="status"]');
  if (!window.luvi?.galeria) { campo.disabled = true; secao.querySelectorAll('button').forEach(b => b.disabled = true); status.textContent = 'Disponível no aplicativo desktop Luvi.'; return; }
  const atualizar = async () => { try { campo.value = await api('config'); } catch(e) { status.textContent = e.message; } };
  secao.addEventListener('click', async e => {
    const acao = e.target.dataset.config; if (!acao) return;
    e.target.disabled = true;
    try { const pasta = await api(acao === 'salvar' ? 'configurar' : 'escolher', { pasta: campo.value }); if(pasta) { campo.value = pasta; status.textContent = 'Pasta salva. Abra Fotos do HD para navegar.'; } }
    catch(e) { status.textContent = e.message; }
    finally { e.target.disabled = false; }
  });
  atualizar(); return atualizar;
}

export function ligarSeletorLocal() {
  if (!window.luvi?.galeria) return;
  const adicionar = () => document.querySelectorAll('input[type="file"][data-upload]').forEach(input => {
    if (input.dataset.hdLigado || !input.accept.includes('image')) return;
    input.dataset.hdLigado = '1';
    const botao = document.createElement('button'); botao.type = 'button'; botao.className = 'hd-escolher'; botao.textContent = 'Fotos do HD'; botao.disabled = input.disabled;
    (input.closest('label') || input).after(botao);
    botao.addEventListener('click', () => {
      const modal = document.createElement('dialog'); modal.className = 'hd-dialog hd-seletor';
      modal.innerHTML = '<form method="dialog"><button>Cancelar</button></form><h2>Escolher fotos do HD</h2><div class="hd-biblioteca"></div>';
      document.body.append(modal); modal.addEventListener('close', () => modal.remove(), { once:true });
      const atualizar = navegador(modal.querySelector('.hd-biblioteca'), async caminhos => {
        if (!input.multiple && caminhos.length > 1) throw new Error('Este campo aceita apenas uma foto.');
        const arquivos = new DataTransfer();
        for (const caminho of caminhos) { const foto = await api('ler', { caminho }); arquivos.items.add(new File([foto.bytes], foto.nome, { type: foto.tipo })); }
        input.files = arquivos.files; input.dispatchEvent(new Event('change', { bubbles:true })); modal.close();
      });
      modal.showModal(); atualizar();
    });
  });
  new MutationObserver(adicionar).observe(document.getElementById('telas'), { childList:true, subtree:true }); adicionar();
}
