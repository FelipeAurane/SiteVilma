import {esc} from './comum.js';

const TAMANHO_PARTE=1024*1024;
const base64=blob=>new Promise((resolve,reject)=>{const leitor=new FileReader();leitor.onload=()=>resolve(String(leitor.result).split(',')[1]);leitor.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));leitor.readAsDataURL(blob);});

export function abrirEntrega(galeria,clienteId,atualizar){
  let g=galeria;
  const cliente=()=>g.clientes.find(c=>c.id===clienteId);
  if(!cliente()?.finalizadaEm)return;
  const d=document.createElement('dialog');d.className='gs-dialog gs-entrega gs-entrega-fotos';
  const status=texto=>{d.querySelector('.gs-entrega-status').textContent=texto;};
  const api=async corpo=>{
    const token=localStorage.getItem('vf_session_token');
    const r=await fetch('/api/entrega',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({galeriaId:g.id,clienteId,...corpo})});
    const payload=await r.json();if(!r.ok)throw new Error(payload.error||'Não foi possível enviar a foto.');
    if(payload.galeria){g=payload.galeria;atualizar(g);}return payload;
  };
  const mensagem=()=>`Olá, ${cliente().nome}! Suas fotos finalizadas da galeria "${g.titulo}" estão prontas. Entre em https://vila-fotografia.vercel.app/catalogo.html/${encodeURIComponent(g.id)} com o e-mail e a senha recebidos para baixar uma foto ou todas de uma vez.`;
  function listar(){
    const arquivos=cliente().entrega?.arquivos||[];
    d.querySelector('.gs-entrega-lista').innerHTML=arquivos.map((f,i)=>`<li><span class="gs-entrega-numero">${i+1}</span><span><strong>${esc(f.nome)}</strong><small>${(f.tamanho/1048576).toFixed(1)} MB · resolução original</small></span>${cliente().entrega?.publicadaEm?'':`<button data-remover-entrega="${f.id}" aria-label="Remover ${esc(f.nome)}">×</button>`}</li>`).join('')||'<li class="gs-entrega-vazio">Nenhuma foto editada adicionada.</li>';
    d.querySelector('[data-publicar-entrega]').hidden=!!cliente().entrega?.publicadaEm;
    d.querySelector('[data-publicar-entrega]').disabled=!arquivos.length;
    const enviar=d.querySelector('[data-enviar-entrega]');
    enviar.hidden=!cliente().entrega?.publicadaEm;
    if(!enviar.hidden)enviar.href=`https://wa.me/${cliente().telefone}?text=${encodeURIComponent(mensagem())}`;
    d.querySelector('.gs-entrega-upload').hidden=!!cliente().entrega?.publicadaEm;
  }
  d.innerHTML=`<div class="gs-entrega-cabeca"><div><span class="gs-modal-sobrelinha">ENTREGA FINAL</span><h3>Fotos editadas</h3><p>${esc(cliente().nome)} · ${cliente().selecionadas?.length||0} fotos escolhidas</p></div><form method="dialog"><button class="gs-fechar" aria-label="Fechar janela" title="Fechar">×</button></form></div><div class="gs-entrega-corpo"><p>Adicione as imagens finais sem redução de resolução. Depois de publicar, o cliente poderá baixar cada foto ou todas juntas na galeria.</p><label class="gs-entrega-upload">+ Adicionar fotos editadas<input data-arquivos-entrega type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label><ol class="gs-entrega-lista"></ol><div class="gs-entrega-acoes"><button type="button" class="gs-primario" data-publicar-entrega>Publicar fotos</button><a data-enviar-entrega target="_blank" rel="noopener noreferrer" hidden>Avisar pelo WhatsApp ↗</a></div><progress data-progresso-entrega max="100" value="0" hidden></progress><p class="gs-entrega-status" role="status" aria-live="polite"></p></div>`;
  document.body.append(d);d.onclose=()=>d.remove();d.showModal();listar();status(cliente().entrega?.publicadaEm?'Entrega publicada. Avise o cliente pelo WhatsApp.':'Adicione as fotos finais e publique a entrega.');
  const entrada=d.querySelector('[data-arquivos-entrega]'),progresso=d.querySelector('[data-progresso-entrega]');
  entrada.onchange=async()=>{
    const arquivos=[...entrada.files];if(!arquivos.length)return;
    entrada.disabled=true;progresso.hidden=false;let concluidas=0;
    try{
      for(const arquivo of arquivos){
        if(!['image/jpeg','image/png','image/webp'].includes(arquivo.type)||arquivo.size>60*1048576)throw new Error(`${arquivo.name}: use JPEG, PNG ou WebP de até 60 MB.`);
        const fileId=crypto.randomUUID(),total=Math.ceil(arquivo.size/TAMANHO_PARTE);if(!total)throw new Error('Arquivo vazio.');
        for(let idx=0;idx<total;idx++){status(`Enviando ${arquivo.name} · parte ${idx+1} de ${total}`);await api({acao:'parte',fileId,idx,data:await base64(arquivo.slice(idx*TAMANHO_PARTE,(idx+1)*TAMANHO_PARTE))});progresso.value=Math.round(100*(concluidas+(idx+1)/total)/arquivos.length);}
        await api({acao:'adicionar',fileId,nome:arquivo.name,mime:arquivo.type,total});concluidas++;listar();
      }
      status(`${concluidas} foto(s) adicionada(s). Publique para liberar o download.`);
    }catch(e){status(e.message);}finally{entrada.value='';entrada.disabled=false;progresso.hidden=true;}
  };
  d.querySelector('.gs-entrega-lista').onclick=async e=>{const b=e.target.closest('[data-remover-entrega]');if(!b||!confirm('Remover esta foto da entrega?'))return;b.disabled=true;try{await api({acao:'remover',fileId:b.dataset.removerEntrega});listar();status('Foto removida da entrega.');}catch(err){status(err.message);b.disabled=false;}};
  d.querySelector('[data-publicar-entrega]').onclick=async e=>{const b=e.currentTarget;b.disabled=true;status('Publicando entrega…');try{await api({acao:'publicar'});listar();status('Fotos publicadas. O cliente já pode baixar na galeria.');}catch(err){status(err.message);b.disabled=false;}};
  d.querySelector('[data-enviar-entrega]').onclick=e=>{e.currentTarget.href=`https://wa.me/${cliente().telefone}?text=${encodeURIComponent(mensagem())}`;status('Conversa aberta. Confirme o envio no WhatsApp.');};
}
