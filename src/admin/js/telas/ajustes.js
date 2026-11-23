import { montarAjustes as montarPasta } from './galeria-local.js';
import { montar as montarProtecao } from './selecao.js';
export function montar(secao) {
  secao.innerHTML = `<div class="ms-abas" role="tablist" aria-label="Ajustes do painel"><button class="ms-aba ativa" role="tab" data-ajuste="pasta" aria-selected="true">Pasta do computador</button><button class="ms-aba" role="tab" data-ajuste="marca" aria-selected="false">Marca-d’água</button></div><div data-painel-ajuste="pasta"></div><div data-painel-ajuste="marca" hidden></div>`;
  const pasta=secao.querySelector('[data-painel-ajuste="pasta"]'),marca=secao.querySelector('[data-painel-ajuste="marca"]');
  const atualizar=montarPasta(pasta);let marcaMontada=false;
  secao.querySelector('[role="tablist"]').addEventListener('click',e=>{
    const botao=e.target.closest('[data-ajuste]');if(!botao)return;
    for(const b of secao.querySelectorAll('[data-ajuste]')){b.classList.toggle('ativa',b===botao);b.setAttribute('aria-selected',String(b===botao));}
    pasta.hidden=botao.dataset.ajuste!=='pasta';marca.hidden=botao.dataset.ajuste!=='marca';
    if(!marca.hidden&&!marcaMontada){marcaMontada=true;marca.innerHTML='<div class="tela-cabeca"><div><h2>Marca-d’água</h2><p>Configure a proteção usada pelas galerias de seleção.</p></div></div>';montarProtecao(marca);}
  });
  if(location.hash.includes('?marca'))secao.querySelector('[data-ajuste="marca"]').click();
  return () => { atualizar?.(); if(location.hash.includes('?marca'))secao.querySelector('[data-ajuste="marca"]').click(); };
}
