/**
 * Comportamento da interface: splash, gaveta, cabeçalho e rolagem.
 *
 * Script clássico de propósito — roda mesmo que o módulo de conteúdo falhe,
 * então a página nunca fica presa na tela de abertura.
 *
 * Quem pinta conteúdo é content.js; aqui é só a casca.
 */

(function () {
  'use strict';

  var CHAVE_SPLASH = 'hasSeenSplash';

  // ------------------------------------------------------------ splash

  function cuidarDoSplash() {
    var splash = document.getElementById('splashScreen');
    var principal = document.getElementById('mainContent');
    if (!splash || !principal) return;

    function revelar() {
      splash.classList.add('hidden');
      principal.style.display = 'block';
      setTimeout(function () {
        splash.style.display = 'none';
      }, 500);
    }

    var jaViu = false;
    try {
      jaViu = Boolean(localStorage.getItem(CHAVE_SPLASH));
    } catch (e) {
      // Modo privativo: mostra a abertura e segue.
    }

    if (jaViu) {
      splash.style.display = 'none';
      principal.style.display = 'block';
      return;
    }

    try {
      localStorage.setItem(CHAVE_SPLASH, 'true');
    } catch (e) {
      // Sem cache: a abertura aparece de novo na próxima visita.
    }

    setTimeout(revelar, 2600);
  }

  // ------------------------------------------------------------ gaveta

  function cuidarDaGaveta() {
    var botao = document.getElementById('menu-toggle');
    var gaveta = document.getElementById('navbar');
    var fundo = document.querySelector('.overlay-fundo');
    if (!botao || !gaveta || !fundo) return;

    function abrir() {
      gaveta.classList.add('open');
      fundo.classList.add('active');
      botao.classList.add('aberto');
      botao.setAttribute('aria-expanded', 'true');
      botao.setAttribute('aria-label', 'Fechar menu');
      document.body.classList.add('no-scroll');
    }

    function fechar() {
      gaveta.classList.remove('open');
      fundo.classList.remove('active');
      botao.classList.remove('aberto');
      botao.setAttribute('aria-expanded', 'false');
      botao.setAttribute('aria-label', 'Abrir menu');
      document.body.classList.remove('no-scroll');
    }

    function alternar() {
      if (gaveta.classList.contains('open')) fechar();
      else abrir();
    }

    botao.addEventListener('click', alternar);

    botao.addEventListener('keydown', function (evento) {
      if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        alternar();
      }
    });

    fundo.addEventListener('click', fechar);

    document.addEventListener('keydown', function (evento) {
      if (evento.key === 'Escape') fechar();
    });

    // Clicar num item leva para a seção e fecha a gaveta.
    gaveta.addEventListener('click', function (evento) {
      if (evento.target.closest('a')) fechar();
    });

    // Se a tela virar desktop com a gaveta aberta, a gaveta some do CSS —
    // sem isto o body ficaria travado sem rolagem.
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 900 && gaveta.classList.contains('open')) fechar();
    });
  }

  // --------------------------------------------------------- cabeçalho

  function cuidarDoCabecalho() {
    var cabecalho = document.getElementById('cabecalho');
    var hero = document.getElementById('hero');
    var indicador = document.getElementById('scroll-down-btn');
    if (!cabecalho) return;

    function aoRolar() {
      var passouDoTopo = window.scrollY > 40;
      cabecalho.classList.toggle('rolado', passouDoTopo);

      if (hero && indicador) {
        // Some assim que o hero começa a sair da tela.
        var heroVisivel = hero.getBoundingClientRect().bottom > window.innerHeight * 0.75;
        indicador.classList.toggle('hidden', !heroVisivel);
      }
    }

    window.addEventListener('scroll', aoRolar, { passive: true });
    aoRolar();
  }

  // ---------------------------------------------------------- rolagem

  function irParaProximaSecao() {
    var alvo = document.getElementById('next-section');
    if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cuidarDoIndicador() {
    // É um <button> de verdade, então Enter e espaço já funcionam sozinhos.
    var indicador = document.getElementById('scroll-down-btn');
    if (indicador) indicador.addEventListener('click', irParaProximaSecao);
  }

  // ------------------------------------------------------------ início

  function iniciar() {
    cuidarDoSplash();
    cuidarDaGaveta();
    cuidarDoCabecalho();
    cuidarDoIndicador();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  // content.js ainda chama isto para o botão de rolagem legado.
  window.scrollToNextSection = irParaProximaSecao;
})();
