const raiz=document.getElementById('selecao-app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id=new URLSearchParams(location.search).get('g')||decodeURIComponent(location.pathname.split('/catalogo.html/')[1]||'').replace(/\/$/,'');
let g,cliente,escolhidas=new Set(),comentarios={},somenteEscolhidas=false,timer,fila=Promise.resolve(),enviando=false,modal=null,revisao=0,pendentes=0,iniciada=false,temaGaleria='claro';
async function pedir(method='GET',body){
  const r=await fetch(`/api/galeria?id=${encodeURIComponent(id||'')}`,{method,cache:'no-store',credentials:'same-origin',headers:{...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const dados=await r.json();if(!r.ok)throw Object.assign(new Error(dados.error||'Não foi possível acessar a galeria.'),{status:r.status});return dados;
}
const fotos=()=>g.pastas.flatMap(p=>p.fotos);
function status(texto){const el=raiz.querySelector('[role="status"]');if(el)el.textContent=texto;}
function salvar(finalizar=false){
  clearTimeout(timer);
  timer=null;
  const snapshot={selecionadas:[...escolhidas],comentarios:{...comentarios},finalizar};const numero=revisao;
  const tarefa=fila.catch(()=>{}).then(()=>pedir('POST',snapshot));fila=tarefa;
  pendentes++;
  tarefa.then(()=>pendentes--,()=>pendentes--);
  tarefa.then(r=>{if(r.finalizadaEm){cliente.finalizadaEm=r.finalizadaEm;render();}else if(numero===revisao)status('Escolhas salvas automaticamente.');}).catch(e=>status(e.message));return tarefa;
}
function agendar(){revisao++;status('Salvando suas escolhas…');clearTimeout(timer);timer=setTimeout(()=>{timer=null;salvar();},600);}
function escolher(foto){
  if(cliente.finalizadaEm||enviando)return;
  if(escolhidas.has(foto.id))escolhidas.delete(foto.id);else{if(g.limite&&escolhidas.size>=g.limite){status(`Você pode escolher até ${g.limite} fotos.`);return;}escolhidas.add(foto.id);}
  renderGrade();agendar();if(modal)atualizarModal();
}
function renderGrade(){
  const lista=fotos().filter(f=>!somenteEscolhidas||escolhidas.has(f.id));
  raiz.querySelector('.sc-grade').innerHTML=lista.map(f=>`<article class="${escolhidas.has(f.id)?'escolhida':''}"><button class="sc-abrir" data-abrir="${f.id}" aria-label="Abrir ${esc(f.nome)} em tela cheia"><img loading="lazy" decoding="async" src="${esc(f.url)}" alt="${esc(f.nome)}"></button><button class="sc-escolher" data-escolher="${f.id}" aria-label="${escolhidas.has(f.id)?'Remover':'Selecionar'} ${esc(f.nome)}" ${cliente.finalizadaEm||enviando?'disabled':''} aria-pressed="${escolhidas.has(f.id)}">${escolhidas.has(f.id)?'♥':'♡'}</button></article>`).join('')||'<p>Nenhuma foto nesta visualização.</p>';
  raiz.querySelector('.sc-contagem').textContent=`${escolhidas.size}${g.limite?' de '+g.limite:''} foto(s) escolhida(s)`;
  raiz.querySelector('.sc-nav-contagem').textContent=escolhidas.size;
  raiz.querySelector('[data-finalizar]').disabled=!!cliente.finalizadaEm||enviando||!escolhidas.size;
}
function renderFinal(){
  document.title=`${g.titulo} · Fotos finalizadas`;
  document.documentElement.dataset.tema=temaGaleria;
  const capa=g.capa||fotos()[0]?.url||'';
  const capaSemMarca=/^\/api\/media\/[0-9a-f-]{36}$/i.test(capa)?capa+'?action=cover&galeria='+encodeURIComponent(g.id):capa;
  raiz.classList.toggle('sc-iniciada',iniciada);
  const arquivos=cliente.entrega.arquivos||[];
  const url=(acao,fileId)=>`/api/entrega?acao=${acao}&galeriaId=${encodeURIComponent(g.id)}${fileId?'&fileId='+encodeURIComponent(fileId):''}`;
  raiz.innerHTML=`<header class="sc-capa">${capa?`<img src="${esc(capaSemMarca)}" alt="" fetchpriority="high">`:''}<div class="sc-capa-topo"><picture class="sc-logo-oficial"><img src="/img/logo.png" alt="Vilma Silva"></picture><span class="sc-logo-mobile">Vilma Silva</span><span class="sc-privada">GALERIA PRIVADA</span></div><div class="sc-capa-conteudo"><span class="sc-sobrelinha">SUAS FOTOS FINALIZADAS <span aria-hidden="true">—</span> ${arquivos.length} FOTOS</span><h1>${esc(g.titulo)}</h1><p class="sc-saudacao">Olá, ${esc(cliente.nome)}.</p><p class="sc-descricao">Suas fotografias editadas estão prontas para baixar em resolução original.</p><button class="sc-iniciar" data-iniciar><span>Baixar Fotos</span><span class="sc-iniciar-seta" aria-hidden="true">↓</span></button><small class="sc-capa-rodape">ACESSO RESERVADO PARA VOCÊ</small></div></header><section class="sc-biblioteca sc-entrega-final"><div class="sc-entrega-topo"><div><span class="sc-sobrelinha">ENTREGA FINAL</span><h2>${esc(cliente.empresa || g.titulo)}</h2><p>Baixe cada foto individualmente.</p></div><a class="sc-baixar-todas" href="${url('todas')}">Baixar todas</a></div><div class="sc-entrega-grade">${arquivos.map(f=>`<article><img loading="lazy" src="${url('previa',f.id)}" alt="${esc(f.nome)}" style="image-orientation:from-image"><div><a href="${url('arquivo',f.id)}" aria-label="Baixar ${esc(f.nome)}">Baixar foto ↓</a></div></article>`).join('')}</div></section>`;
}
function render(){
  if(cliente.entrega?.publicadaEm){renderFinal();return;}
  document.title=`${g.titulo} · Seleção de fotos`;document.documentElement.dataset.tema=temaGaleria;
  const capa=g.capa||fotos()[0]?.url||'';
  const capaSemMarca=/^\/api\/media\/[0-9a-f-]{36}$/i.test(capa)?capa+'?action=cover&galeria='+encodeURIComponent(g.id):capa;
  raiz.classList.toggle('sc-iniciada',iniciada);
  raiz.innerHTML=`<header class="sc-capa">${capa?`<img src="${esc(capaSemMarca)}" alt="" fetchpriority="high">`:''}<div class="sc-capa-topo"><picture class="sc-logo-oficial"><img src="/img/logo.png" alt="Vilma Fotografia"></picture><span class="sc-logo-mobile">Vilma Silva</span><span class="sc-privada">GALERIA PRIVADA</span></div><div class="sc-capa-conteudo" style="font-family:${g.fonte},${g.fonte==='Georgia'?'serif':'Arial,sans-serif'}"><span class="sc-sobrelinha">UMA SELEÇÃO PARA VOCÊ <span aria-hidden="true">—</span> ${fotos().length} FOTOS</span><h1>${esc(g.titulo)}</h1><p class="sc-saudacao">Olá, ${esc(cliente.nome)}.</p><p class="sc-descricao">${cliente.finalizadaEm?'Sua seleção foi enviada. Você ainda pode visitar a galeria.':'Explore a galeria com calma e escolha as fotografias que mais gostou.'}</p><button class="sc-iniciar" data-iniciar><span>Iniciar seleção</span><span class="sc-iniciar-seta" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button><small class="sc-capa-rodape">${cliente.finalizadaEm?'Seleção concluída':'Acesso reservado para você'}</small></div></header><section class="sc-biblioteca"><div class="sc-toolbar"><nav aria-label="Visualização das fotos"><button data-visao="todas" class="${somenteEscolhidas?'':'ativa'}" aria-pressed="${!somenteEscolhidas}">Todas as fotos</button><button data-visao="escolhidas" class="${somenteEscolhidas?'ativa':''}" aria-pressed="${somenteEscolhidas}">Escolhidas <span class="sc-nav-contagem">${escolhidas.size}</span></button></nav></div><p class="sc-status" role="status" aria-live="polite">${cliente.finalizadaEm?'Seleção finalizada em '+new Date(cliente.finalizadaEm).toLocaleDateString('pt-BR')+'. Obrigada!':'Prazo para escolher: '+new Date(new Date(g.publicadoEm).getTime()+g.prazoDias*86400000).toLocaleDateString('pt-BR')}</p><div class="sc-grade"></div></section><footer class="sc-rodape"><span class="sc-contagem"></span><button data-finalizar>Finalizar seleção</button></footer>`;
  renderGrade();
}
let fotoModal,pretoBranco=false;
function atualizarModal(){
  const f=fotoModal;if(!f)return;
  modal.querySelector('img').src=f.url;modal.querySelector('img').alt=f.nome;modal.querySelector('img').style.filter=pretoBranco?'grayscale(1)':'';
  modal.querySelector('h2').textContent=f.nome;
  const b=modal.querySelector('[data-marcar-modal]');b.textContent=escolhidas.has(f.id)?'♥ Escolhida':'♡ Escolher';b.disabled=!!cliente.finalizadaEm||enviando;
  const campo=modal.querySelector('textarea');if(campo){campo.value=comentarios[f.id]||'';campo.disabled=!!cliente.finalizadaEm;}
  const download=modal.querySelector('[download]');if(download){download.href=f.url;download.download=f.nome;}
}
function abrir(f){
  fotoModal=f;pretoBranco=false;modal=document.createElement('dialog');modal.className='sc-modal';
  modal.innerHTML=`<header><h2></h2><form method="dialog"><button aria-label="Fechar visualização">✕</button></form></header><div class="sc-imagem"><button data-anterior aria-label="Foto anterior">‹</button><img alt="" style="max-width:${g.largura}px"><button data-proxima aria-label="Próxima foto">›</button></div><div class="sc-modal-acoes"><button data-marcar-modal></button>${g.pretoBranco?'<button data-pb>Preto e branco</button>':''}${g.download?'<a download>Baixar prova</a>':''}</div>${g.comentarios?'<label class="sc-comentario">Comentário sobre esta foto<textarea maxlength="1000" rows="2" placeholder="Deixe uma observação para a fotógrafa"></textarea></label>':''}`;
  document.body.append(modal);atualizarModal();modal.showModal();
  const navegar=passo=>{const lista=fotos();fotoModal=lista[(lista.findIndex(f=>f.id===fotoModal.id)+passo+lista.length)%lista.length];atualizarModal();};
  let toqueX=0;
  modal.addEventListener('touchstart',e=>{toqueX=e.changedTouches[0]?.screenX||0;},{passive:true});
  modal.addEventListener('touchend',e=>{const distancia=(e.changedTouches[0]?.screenX||0)-toqueX;if(Math.abs(distancia)>55)navegar(distancia<0?1:-1);},{passive:true});
  modal.addEventListener('click',e=>{if(e.target.closest('[data-marcar-modal]'))escolher(fotoModal);if(e.target.closest('[data-anterior]'))navegar(-1);if(e.target.closest('[data-proxima]'))navegar(1);if(e.target.closest('[data-pb]')){pretoBranco=!pretoBranco;atualizarModal();}});
  modal.addEventListener('keydown',e=>{if(e.target.matches('textarea'))return;if(e.key==='ArrowLeft'){e.preventDefault();navegar(-1);}if(e.key==='ArrowRight'){e.preventDefault();navegar(1);}});
  modal.querySelector('textarea')?.addEventListener('input',e=>{comentarios[fotoModal.id]=e.target.value;agendar();});
  modal.addEventListener('close',()=>{modal.remove();modal=null;fotoModal=null;});
}
function confirmarFinalizacao(){
  if(!escolhidas.size||enviando||cliente.finalizadaEm)return;
  const dialogo=document.createElement('dialog');
  dialogo.className='sc-confirmar';
  dialogo.innerHTML=`<div class="sc-confirmar-icone" aria-hidden="true">♥</div><h2>Finalizar sua seleção?</h2><p>Você escolheu <strong>${escolhidas.size} foto${escolhidas.size===1?'':'s'}</strong>. Depois de enviar, não será possível mudar suas escolhas.</p><p class="sc-confirmar-status" role="status" aria-live="polite"></p><div class="sc-confirmar-acoes"><form method="dialog"><button type="submit">Continuar escolhendo</button></form><button type="button" data-confirmar-final>Sim, enviar seleção</button></div>`;
  document.body.append(dialogo);
  dialogo.addEventListener('close',()=>dialogo.remove());
  dialogo.querySelector('[data-confirmar-final]').onclick=async()=>{
    if(enviando)return;
    enviando=true;
    dialogo.querySelectorAll('button').forEach(botao=>botao.disabled=true);
    dialogo.querySelector('[role="status"]').textContent='Enviando sua seleção…';
    renderGrade();
    try{await salvar(true);dialogo.close();}
    catch(erro){dialogo.querySelector('[role="status"]').textContent=erro.message||'Não foi possível finalizar. Tente novamente.';dialogo.querySelectorAll('button').forEach(botao=>botao.disabled=false);}
    finally{enviando=false;if(raiz.querySelector('.sc-grade'))renderGrade();}
  };
  dialogo.showModal();
}
raiz.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-iniciar')){iniciada=true;raiz.classList.add('sc-iniciada');raiz.querySelector('.sc-biblioteca').scrollIntoView({block:'start'});return;}
  if(b.dataset.visao){somenteEscolhidas=b.dataset.visao==='escolhidas';render();}
  if(b.dataset.abrir)abrir(fotos().find(f=>f.id===b.dataset.abrir));
  if(b.dataset.escolher)escolher(fotos().find(f=>f.id===b.dataset.escolher));
  if(b.hasAttribute('data-finalizar')&&!enviando&&!cliente.finalizadaEm){
    confirmarFinalizacao();
  }
});
window.addEventListener('beforeunload',e=>{if(timer||enviando||pendentes){e.preventDefault();e.returnValue='';}});
async function carregarGaleria(){const [dados,tema]=await Promise.all([pedir(),fetch('/api/content?key=panelTheme',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)]);temaGaleria=tema?.value==='escuro'?'escuro':'claro';g=dados.galeria;cliente=dados.cliente;escolhidas=new Set(cliente.selecionadas||[]);comentarios=cliente.comentarios||{};render();}
if(location.hash)history.replaceState(null,'',location.pathname+location.search);
function mostrarLogin(aviso=''){
  raiz.innerHTML=`<header class="sc-capa sc-login-capa"><img class="sc-login-foto" alt=""><div class="sc-capa-topo"><picture class="sc-logo-oficial"><img src="/img/logo.png" alt="Vilma Silva"></picture><span class="sc-logo-mobile">Vilma Silva</span><span class="sc-privada">GALERIA PRIVADA</span></div><form class="sc-acesso"><span class="sc-sobrelinha">SUA GALERIA PRIVADA</span><h1>Acesse suas fotos</h1><p>Entre com o e-mail e a senha enviados pela fotógrafa.</p><label>E-mail<input name="email" type="email" autocomplete="username" required></label><label>Senha<input name="senha" type="password" autocomplete="current-password" required></label><button>Entrar na galeria →</button><p role="status" aria-live="polite">${esc(aviso)}</p></form></header>`;
  fetch(`/api/galeria?id=${encodeURIComponent(id)}&entrada=1`,{cache:'no-store'}).then(r=>r.ok?r.json():null).then(dados=>{const img=raiz.querySelector('.sc-login-foto');if(img&&dados?.capa)img.src=dados.capa;}).catch(()=>{});
  fetch('/api/content?key=panelTheme',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(dados=>{document.documentElement.dataset.tema=dados?.value==='escuro'?'escuro':'claro';}).catch(()=>{});
  raiz.querySelector('form.sc-acesso').onsubmit=async evento=>{evento.preventDefault();const form=evento.currentTarget;const botao=form.querySelector('button');botao.disabled=true;try{await pedir('POST',{acao:'login',...Object.fromEntries(new FormData(form))});await carregarGaleria();}catch(e){form.querySelector('[role="status"]').textContent=e.message;botao.disabled=false;}};
}
if(!id)raiz.innerHTML='<div class="sc-mensagem"><h1>Galeria indisponível</h1><p>Use o link individual recebido da fotógrafa.</p></div>';else try{await carregarGaleria();}catch(e){if(e.status===401)mostrarLogin();else raiz.innerHTML=`<div class="sc-mensagem"><h1>Galeria indisponível</h1><p>${esc(e.message)}</p></div>`;}

