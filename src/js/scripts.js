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

  // ------------------------- animação scroll storytelling: Section 1 (Hero) -> Section 2 (Portfólio)
  // Section 1: Primeira imagem do hero em tela cheia com título e botão.
  // Ao rolar: O conteúdo da Section 1 suaviza e os cartões da Section 2 montam-se em 3 colunas,
  // finalizando a animação na Section 2 com a galeria completa e preenchida.

  function cuidarDaTransicaoPinterestPortfolio() {
    var hero = document.getElementById('hero');
    var nextSection = document.getElementById('next-section');
    var pinterestGrid = document.getElementById('hero-pinterest-grid') || document.getElementById('hero-story-stage');
    var portfolioHeaderBar = document.getElementById('portfolio-header-bar');
    var featuredCard = document.getElementById('hero-featured-card') || document.getElementById('hero-main-card');
    var centerOverlay = document.getElementById('hero-center-overlay');
    var heroConteudo = document.getElementById('hero-conteudo');
    var scrollDownBtn = document.getElementById('scroll-down-btn');
    var col1 = document.getElementById('pinterest-col-left') || document.getElementById('story-col-left');
    var col2 = document.getElementById('pinterest-col-2');
    var colCenter = document.getElementById('pinterest-col-center') || document.getElementById('story-col-center');
    var col4 = document.getElementById('pinterest-col-4');
    var col5 = document.getElementById('pinterest-col-right') || document.getElementById('story-col-right');
    var cardTop = document.getElementById('pinterest-card-top') || document.getElementById('card-center-top');
    var cardBottom = document.getElementById('pinterest-card-bottom') || document.getElementById('card-center-bottom');
    var cardapioContainer = document.getElementById('cardapio-container');

    if (!hero || !pinterestGrid) return;

    // Sincroniza a localização da grade:
    // No mobile (<900px), a grade e o título fluem naturalmente dentro da Section 2 (#next-section);
    // No desktop (>=900px), residem em #hero-midia com animação fixa contínua.
    function sincronizarEstruturaMobileDesktop() {
      var isMobile = window.innerWidth < 900;
      var grid = document.getElementById('hero-pinterest-grid');
      var headerBar = document.getElementById('portfolio-header-bar');
      var heroMidia = document.getElementById('hero-midia');
      var nextSec = document.getElementById('next-section');
      if (!grid || !heroMidia || !nextSec) return;

      if (isMobile) {
        if (grid.parentElement !== nextSec) {
          if (headerBar) nextSec.appendChild(headerBar);
          nextSec.appendChild(grid);
        }
      } else {
        if (grid.parentElement !== heroMidia) {
          if (headerBar) heroMidia.appendChild(headerBar);
          heroMidia.appendChild(grid);
        }
      }
    }

    sincronizarEstruturaMobileDesktop();
    window.addEventListener('resize', sincronizarEstruturaMobileDesktop, { passive: true });

    var ticking = false;

    // Na Section 1 as imagens e cartões são puramente visuais e não clicáveis no desktop; na Section 2 tornam-se interativos
    var pinterestCards = pinterestGrid.querySelectorAll('.pinterest-card, .story-card');
    pinterestCards.forEach(function(card) {
      card.addEventListener('click', function(e) {
        var isMobile = window.innerWidth < 900;
        if (!isMobile && !pinterestGrid.classList.contains('section-2-active')) {
          e.preventDefault();
          return;
        }
        var cat = card.getAttribute('data-category');
        if (cat === 'Vilma Silva') {
          window.location.href = './pages/sobremim.html';
        } else if (cat === 'Cardápios') {
          window.location.href = './pages/servicos.html';
        } else if (cat) {
          window.location.href = './pages/galeria.html?category=' + encodeURIComponent(cat);
        }
      });
      card.addEventListener('keydown', function(e) {
        var isMobile = window.innerWidth < 900;
        if (!isMobile && !pinterestGrid.classList.contains('section-2-active')) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });

      var cardImg = card.querySelector('img');
      if (cardImg && !cardImg.complete) {
        cardImg.addEventListener('load', function() {
          if (!ticking) {
            ticking = true;
            window.requestAnimationFrame(atualizar);
          }
        });
      }
    });

    window.addEventListener('load', function() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(atualizar);
      }
    });

    var sobreSection = document.getElementById('sobre') || document.querySelector('.sobre-section');
    var heroVeu = document.querySelector('.hero-veu');

    function limparEstilos() {
      if (pinterestGrid) {
        pinterestGrid.style.gridTemplateColumns = '';
        pinterestGrid.style.paddingTop = '';
        pinterestGrid.style.pointerEvents = '';
        pinterestGrid.style.transform = '';
      }
      if (heroConteudo) {
        heroConteudo.style.opacity = '';
        heroConteudo.style.transform = '';
        heroConteudo.style.pointerEvents = '';
      }
      if (scrollDownBtn) {
        scrollDownBtn.style.opacity = '';
        scrollDownBtn.style.pointerEvents = '';
      }
      if (colCenter) {
        colCenter.style.display = '';
        colCenter.style.transform = '';
        colCenter.style.opacity = '';
        colCenter.style.filter = '';
        colCenter.style.visibility = '';
        colCenter.style.marginLeft = '';
        colCenter.style.marginRight = '';
        colCenter.style.pointerEvents = '';
      }
      if (featuredCard) {
        featuredCard.style.transform = '';
        featuredCard.style.opacity = '';
      }
      if (cardTop) {
        cardTop.style.transform = '';
        cardTop.style.opacity = '';
      }
      if (cardBottom) {
        cardBottom.style.transform = '';
        cardBottom.style.opacity = '';
      }
      if (centerOverlay) centerOverlay.style.opacity = '';
      if (col1) col1.style.transform = '';
      if (col2) col2.style.transform = '';
      if (col4) col4.style.transform = '';
      if (col5) col5.style.transform = '';
    }

    var scrollTimer = null;

    function atualizar() {
      ticking = false;

      var scrollY = window.scrollY || window.pageYOffset || 0;
      var vh = window.innerHeight || 800;

      if (window.innerWidth < 900) {
        limparEstilos();
        if (pinterestGrid) pinterestGrid.style.transform = '';
        if (heroVeu) heroVeu.style.transform = '';
        if (portfolioHeaderBar) {
          portfolioHeaderBar.style.transform = '';
          portfolioHeaderBar.style.opacity = '';
          portfolioHeaderBar.style.pointerEvents = '';
        }
        return;
      }

      // Interrompe animações de float ocioso quando o usuário estiver rolando
      var estaRolado = scrollY > 4;
      if (pinterestGrid) {
        pinterestGrid.classList.toggle('scroll-interrupted', estaRolado);
      }
      document.body.classList.toggle('is-scrolled', estaRolado);

      // Transição contínua orgânica 1:1 governada pelo scroll (Section 1 -> Section 2)
      var transDist = vh * 0.85;
      var transProg = Math.min(Math.max(scrollY / transDist, 0), 1);
      // Smoothstep: derivada zero nas duas pontas (sem aceleração repentina nem solavanco)
      var ease = transProg * transProg * (3 - 2 * transProg);

      var estaNaSecao2 = transProg >= 0.82;
      if (pinterestGrid) {
        pinterestGrid.classList.toggle('section-2-active', estaNaSecao2);
      }
      document.body.classList.toggle('section-2-active', estaNaSecao2);
      if (portfolioHeaderBar) {
        portfolioHeaderBar.classList.toggle('section-2-active', estaNaSecao2);
      }

      // 1. Hero text e botões ("Vilma Silva", "Solicitar Orçamento")
      if (heroConteudo) {
        var heroTextOpacity = Math.max(1 - ease * 2.6, 0);
        heroConteudo.style.opacity = heroTextOpacity.toFixed(3);
        heroConteudo.style.transform = 'translate3d(-50%, calc(-50% - ' + (ease * 100).toFixed(1) + 'px), 0)';
        heroConteudo.style.pointerEvents = heroTextOpacity < 0.1 ? 'none' : 'auto';
      }

      // 2. Indicador de scroll (barrinha)
      if (scrollDownBtn) {
        var scrollBtnOpacity = Math.max(1 - ease * 3.2, 0);
        scrollDownBtn.style.opacity = scrollBtnOpacity.toFixed(3);
        scrollDownBtn.style.pointerEvents = scrollBtnOpacity < 0.1 ? 'none' : 'auto';
      }

      // 3. Véu / gradiente do hero
      if (heroVeu) {
        heroVeu.style.opacity = Math.max(1 - ease * 1.5, 0).toFixed(3);
        heroVeu.style.pointerEvents = ease > 0.5 ? 'none' : '';
      }

      // 4. Vídeo da coluna central
      var centerVid = document.getElementById('hero-center-video');
      if (centerVid) {
        if (transProg > 0.65) {
          if (!centerVid.paused) centerVid.pause();
        } else {
          if (centerVid.paused) centerVid.play().catch(function() {});
        }
      }

      // 5. Reposicionamento orgânico contínuo da coluna central e expansão das 4 colunas laterais:
      // A coluna central encolhe continuamente de 1.45fr a 0fr.
      // Quando a coluna central some (ease >= 0.8), o grid reorganiza-se estritamente em 4 colunas uniformes (repeat(4, minmax(0, 1fr))),
      // eliminando completamente o espaço duplo/margem no meio.
      if (ease >= 0.8) {
        pinterestGrid.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
        if (colCenter) {
          colCenter.style.display = 'none';
          colCenter.style.margin = '0';
          colCenter.style.padding = '0';
          colCenter.style.width = '0';
          colCenter.style.height = '0';
        }
      } else {
        var centerFr = Math.max(1.45 * (1 - ease / 0.8), 0);
        pinterestGrid.style.gridTemplateColumns = 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, ' + centerFr.toFixed(4) + 'fr) minmax(0, 1fr) minmax(0, 1fr)';
        if (colCenter) {
          colCenter.style.display = '';
          colCenter.style.opacity = Math.max(1 - ease * 1.5, 0).toFixed(3);
          colCenter.style.transform = 'translate3d(0, -' + (ease * 60).toFixed(1) + 'px, 0) scale(' + (1 - ease * 0.25).toFixed(3) + ')';
          colCenter.style.pointerEvents = 'none';
        }
      }

      // 6. Alinhamento vertical físico contínuo das 4 colunas de fotos:
      // No repouso (Section 1) elas têm o escalonamento estilo Pinterest (+36px, -26px, +26px, -36px).
      // Conforme o scroll avança, elas deslizam suavemente em direções opostas até alinharem-se perfeitamente em 0px.
      var col1Y = (1 - ease) * 36;
      var col2Y = (1 - ease) * -26;
      var col4Y = (1 - ease) * 26;
      var col5Y = (1 - ease) * -36;

      if (col1) col1.style.transform = 'translate3d(0, ' + col1Y.toFixed(1) + 'px, 0)';
      if (col2) col2.style.transform = 'translate3d(0, ' + col2Y.toFixed(1) + 'px, 0)';
      if (col4) col4.style.transform = 'translate3d(0, ' + col4Y.toFixed(1) + 'px, 0)';
      if (col5) col5.style.transform = 'translate3d(0, ' + col5Y.toFixed(1) + 'px, 0)';

      // 7. Descida contínua da grade para abrir espaço ao cabeçalho "Portfólio"
      var padTop = (ease * 140).toFixed(1);
      pinterestGrid.style.paddingTop = padTop + 'px';

      // 8. Revelação suave do cabeçalho "Portfólio" que desce deslizando suavemente
      var headerProg = Math.min(Math.max((transProg - 0.25) / 0.6, 0), 1);
      var headerEase = headerProg * headerProg * (3 - 2 * headerProg);
      if (portfolioHeaderBar) {
        portfolioHeaderBar.style.opacity = headerEase.toFixed(3);
        portfolioHeaderBar.style.transform = 'translate3d(0, ' + ((1 - headerEase) * -18).toFixed(1) + 'px, 0)';
        portfolioHeaderBar.style.pointerEvents = headerProg >= 0.85 ? 'auto' : 'none';
      }

      // 9. Opção "Ver mais" em cada card surge suavemente sem salto
      var verMaisProg = Math.min(Math.max((transProg - 0.45) / 0.45, 0), 1);
      var verMaisButtons = pinterestGrid.querySelectorAll('.card-ver-mais');
      verMaisButtons.forEach(function(btn) {
        btn.style.opacity = verMaisProg.toFixed(3);
        btn.style.pointerEvents = verMaisProg >= 0.8 ? 'auto' : 'none';
      });

      // 10. Interatividade dos cartões ativada quando em Section 2
      pinterestGrid.style.pointerEvents = transProg >= 0.75 ? 'auto' : 'none';

      // 11. Rolagem contínua de todo o portfólio (Section 2) até o último item,
      // com margem de respiro antes da Section 3 (#sobre):
      // Mede dinamicamente a altura real de todas as colunas da galeria
      var col1H = col1 ? col1.scrollHeight : 0;
      var col2H = col2 ? col2.scrollHeight : 0;
      var col4H = col4 ? col4.scrollHeight : 0;
      var col5H = col5 ? col5.scrollHeight : 0;
      var maxColH = Math.max(col1H, col2H, col4H, col5H);

      var topPaddingGrid = 140;
      var margemFinalSecaoDois = 100; // Margem generosa de afastamento antes da Section 3
      var totalGalleryH = maxColH + topPaddingGrid + margemFinalSecaoDois;
      var scrollableGalleryDistance = Math.max(totalGalleryH - vh, 0);

      // Atualiza a altura do contêiner da Section 2 para garantir que o scroll cubra
      // todas as imagens até a última e preserve a margem antes da Section 3
      var targetNextH = Math.round(transDist + scrollableGalleryDistance + margemFinalSecaoDois);
      if (nextSection && targetNextH > 0) {
        nextSection.style.height = targetNextH + 'px';
      }

      if (scrollY <= transDist) {
        // Durante a transição inicial do hero
        pinterestGrid.style.transform = 'translate3d(0, 0, 0)';
        if (heroVeu) heroVeu.style.transform = 'translate3d(0, 0, 0)';
      } else {
        // Dentro da Section 2: a galeria rola 1:1 conforme o usuário dá scroll
        var galleryScroll = scrollY - transDist;
        var translateY = Math.min(galleryScroll, scrollableGalleryDistance);

        if (sobreSection) {
          var sobreRect = sobreSection.getBoundingClientRect();
          if (sobreRect.top < vh) {
            // Section 3 entrando na tela: empurra suavemente o final já visível da galeria
            var pushUp = sobreRect.top - vh;
            pinterestGrid.style.transform = 'translate3d(0, ' + (-translateY + pushUp).toFixed(1) + 'px, 0)';
            if (heroVeu) heroVeu.style.transform = 'translate3d(0, ' + pushUp.toFixed(1) + 'px, 0)';
            if (portfolioHeaderBar) portfolioHeaderBar.style.transform = 'translate3d(0, ' + pushUp.toFixed(1) + 'px, 0)';
          } else {
            // Navegação fluida por todos os itens da galeria
            pinterestGrid.style.transform = 'translate3d(0, -' + translateY.toFixed(1) + 'px, 0)';
            if (heroVeu) heroVeu.style.transform = 'translate3d(0, 0, 0)';
            if (portfolioHeaderBar) portfolioHeaderBar.style.transform = 'translate3d(0, 0, 0)';
          }
        } else {
          pinterestGrid.style.transform = 'translate3d(0, -' + translateY.toFixed(1) + 'px, 0)';
        }
      }
    }

    function aoRolar() {
      // Interrupção imediata durante o movimento do scroll
      if (pinterestGrid) {
        pinterestGrid.classList.add('is-scrolling');
      }
      document.body.classList.add('is-scrolling');

      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function() {
        if (pinterestGrid) {
          pinterestGrid.classList.remove('is-scrolling');
        }
        document.body.classList.remove('is-scrolling');
      }, 160);

      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(atualizar);
      }
    }

    window.addEventListener('scroll', aoRolar, { passive: true });
    window.addEventListener('resize', aoRolar, { passive: true });
    atualizar();
  }

  // --------------------------------------------------- vídeo hero tiktok
  function cuidarDoVideoHero() {
    var video = document.getElementById('hero-center-video');
    if (!video) return;

    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.loop = true;

    function tentarTocar() {
      if (!video.src || video.style.display === 'none') return;
      video.muted = true;
      var p = video.play();
      if (p !== undefined) {
        p.catch(function () {
          function desbloquear() {
            video.play().catch(function () {});
            ['click', 'touchstart', 'scroll', 'pointerdown'].forEach(function (ev) {
              window.removeEventListener(ev, desbloquear);
            });
          }
          ['click', 'touchstart', 'scroll', 'pointerdown'].forEach(function (ev) {
            window.addEventListener(ev, desbloquear, { once: true, passive: true });
          });
        });
      }
    }

    video.addEventListener('canplay', tentarTocar);
    video.addEventListener('loadeddata', tentarTocar);
    tentarTocar();

    // Observa mudanças de atributo src para tocar imediatamente
    if ('MutationObserver' in window) {
      var obs = new MutationObserver(function () {
        tentarTocar();
      });
      obs.observe(video, { attributes: true, attributeFilter: ['src', 'style'] });
    }
  }

  // ------------------------------------------------------------ início

  function iniciar() {
    cuidarDoSplash();
    cuidarDaGaveta();
    cuidarDoCabecalho();
    cuidarDoIndicador();
    cuidarDaTransicaoPinterestPortfolio();
    cuidarDoVideoHero();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  // content.js ainda chama isto para o botão de rolagem legado.
  window.scrollToNextSection = irParaProximaSecao;
})();
