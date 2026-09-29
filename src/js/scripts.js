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

    // Listas em cache: evita querySelectorAll a cada frame de scroll.
    // colCards guarda os cards das 4 colunas LATERAIS (a coluna central é
    // tratada em bloco, pois encolhe junto com a própria coluna).
    var padFinalPx = null;
    var galeriaMaxH = null;
    var headerInsetPx = null;
    var verMaisButtons = pinterestGrid.querySelectorAll('.card-ver-mais');
    var colCards = [];
    [col1, col2, col4, col5].forEach(function(col) {
      if (!col) return;
      Array.prototype.forEach.call(col.querySelectorAll('.pinterest-card'), function(card, row) {
        colCards.push({ el: card, row: row });
      });
    });

    // Altura real da galeria, medida no layout FINAL (4 colunas, sem
    // transforms). Medir no estado atual criaria um laço de realimentação:
    // scrollHeight inclui o overflow dos transforms, que dependem do ease,
    // que mudaria a altura da Section 2, que mudaria a altura do documento,
    // que por sua vez altera o scroll. Medindo só no layout final e
    // cacheando, a altura da Section 2 vira função pura do layout — o que
    // torna a transição reversível.
    function medirAlturaGaleria() {
      var cols = [col1, col2, col4, col5];
      var savedGridCols = pinterestGrid.style.gridTemplateColumns;
      var savedColTfs = [];
      var savedCardTfs = [];

      for (var ci = 0; ci < cols.length; ci++) {
        if (cols[ci]) { savedColTfs.push([cols[ci], cols[ci].style.transform]); cols[ci].style.transform = ''; }
      }
      for (var cj = 0; cj < colCards.length; cj++) {
        savedCardTfs.push(colCards[cj].el.style.transform);
        colCards[cj].el.style.transform = '';
      }
      // Força o layout final da galeria (coluna central em 0).
      pinterestGrid.style.gridTemplateColumns =
        'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0fr) minmax(0, 1fr) minmax(0, 1fr)';

      var max = 0;
      for (var ck = 0; ck < cols.length; ck++) {
        if (cols[ck]) max = Math.max(max, cols[ck].scrollHeight);
      }

      // Restaura exatamente o estado anterior.
      pinterestGrid.style.gridTemplateColumns = savedGridCols;
      for (var ti = 0; ti < savedColTfs.length; ti++) savedColTfs[ti][0].style.transform = savedColTfs[ti][1];
      for (var tj = 0; tj < savedCardTfs.length; tj++) colCards[tj].el.style.transform = savedCardTfs[tj];

      return max;
    }

    // Altura da faixa reservada ao cabeçalho "Portfólio", medida uma única
    // vez por layout. É o `bottom` do título em coordenadas de viewport,
    // que é também a borda superior da região onde a galeria pode desenhar.
    // O transform do cabeçalho é neutralizado durante a medição (ele é dirigido
    // pelo scroll e muda a cada frame), senão a leitura herdaria o deslocamento
    // da revelação em curso.
    function medirHeaderInset() {
      if (!portfolioHeaderBar) return 0;
      var savedTransform = portfolioHeaderBar.style.transform;
      portfolioHeaderBar.style.transform = 'none';
      var bottom = portfolioHeaderBar.getBoundingClientRect().bottom;
      portfolioHeaderBar.style.transform = savedTransform;
      if (!bottom || isNaN(bottom) || bottom <= 0) return 0;
      return bottom;
    }

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

    // Pool de reserva: as fotos que já estão no deploy. Só entra quando não há
    // categoria nenhuma cadastrada no painel, para a home nunca abrir vazia.
    var PINTEREST_POOL_PADRAO = [
      { src: './img/p-burger.jpg', badge: 'Hambúrgueres', category: 'Hambúrgueres', alt: 'Hambúrguer gourmet artesanal com queijo derretido e bacon' },
      { src: './img/p-pizza.jpg', badge: 'Pizzas Artesanais', category: 'Pizzas', alt: 'Pizza napolitana artesanal com manjericão e mozzarella' },
      { src: './img/p-drink.jpg', badge: 'Drinks & Coquetéis', category: 'Bebidas', alt: 'Coquetel artesanal sofisticado com gelo esculpido e laranja' },
      { src: './img/p-massa.jpg', badge: 'Massas & Molhos', category: 'Gastronomia', alt: 'Fettuccine artesanal com molho de trufas e parmesão' },
      { src: './img/p-sobremesa.jpg', badge: 'Doces Finos', category: 'Confeitaria', alt: 'Entremet de chocolate fino com framboesa e ouro comestível' },
      { src: './img/p-cafe.jpg', badge: 'Cafeteria & Brunch', category: 'Bebidas', alt: 'Café cappuccino com latte art e croissant folhado dourado' },
      { src: './img/p-steak.jpg', badge: 'Carnes Nobres', category: 'Restaurantes', alt: 'Corte nobre de picanha grelhada suculenta com sal grosso' },
      { src: './img/p-2.JPG', badge: 'Confeitaria', category: 'Confeitaria', alt: 'Doces artesanais e sobremesas especiais' },
      { src: './img/p-3.JPG', badge: 'Restaurantes', category: 'Restaurantes', alt: 'Empratamento e ambientação de restaurante' },
      { src: './img/p-4.JPG', badge: 'Produção Culinária', category: 'Gastronomia', alt: 'Produção gastronômica profissional para estabelecimentos' },
      { src: './img/p-5.jpg', badge: 'Alta Gastronomia', category: 'Alta Gastronomia', alt: 'Alta gastronomia e pratos autorais sofisticados' },
      { src: './img/p-6.JPG', badge: 'Textura & Sabor', category: 'Confeitaria', alt: 'Texturas marcantes da culinária autoral' },
      { src: './img/p-7.jpg', badge: 'Bebidas Especiais', category: 'Bebidas', alt: 'Bebidas refrescantes e drinks especiais' },
      { src: './img/img1.jpg', badge: 'Cardápios', category: 'Cardápios', alt: 'Fotografia gastronômica comercial para cardápios' },
      { src: './img/vilma.jpg', badge: 'Vilma Silva', category: 'Vilma Silva', alt: 'Vilma Silva - Fotógrafa gastronômica profissional' },
      { src: './img/capa.jpg', badge: 'Editorial', category: 'Gastronomia', alt: 'Editorial de gastronomia em estúdio profissional' }
    ];

    function embaralharArray(arr) {
      var copia = arr.slice();
      for (var i = copia.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = copia[i];
        copia[i] = copia[j];
        copia[j] = temp;
      }
      return copia;
    }

    // Uma entrada da grade por foto de galeria, com a categoria dona da foto.
    // O painel é a fonte da verdade: trocar a categoria lá troca a foto aqui.
    // Devolve também o índice categoria -> fotos, usado no clique do cartão.
    function montarPool(categories) {
      var pool = [];
      var porCategoria = {};

      if (!Array.isArray(categories)) return { pool: pool, porCategoria: porCategoria };

      for (var i = 0; i < categories.length; i++) {
        var categoria = categories[i];
        if (!categoria || typeof categoria !== 'object') continue;

        var nome = typeof categoria.name === 'string' ? categoria.name.trim() : '';
        if (!nome) continue;

        var fotos = [];
        if (Array.isArray(categoria.gallery)) {
          for (var g = 0; g < categoria.gallery.length; g++) {
            var foto = categoria.gallery[g];
            if (typeof foto === 'string' && foto.trim()) fotos.push(foto.trim());
          }
        }
        // Categoria sem galeria ainda mostra a capa, senão o cartão fica vazio.
        if (!fotos.length && typeof categoria.image === 'string' && categoria.image.trim()) {
          fotos.push(categoria.image.trim());
        }
        if (!fotos.length) continue;

        var legenda = typeof categoria.subtitle === 'string' ? categoria.subtitle.trim() : '';
        for (var f = 0; f < fotos.length; f++) {
          pool.push({
            src: fotos[f],
            badge: legenda || nome,
            category: nome,
            alt: 'Fotografia de ' + nome
          });
        }
        porCategoria[nome] = fotos;
      }

      return { pool: pool, porCategoria: porCategoria };
    }

    // Enquanto a API não responde, a cópia em localStorage (escrita pelo
    // content.js) já deixa a primeira visita com as fotos certas.
    function categoriasDoCache() {
      try {
        var bruto = localStorage.getItem('vilma_fotografia_data');
        if (!bruto) return null;
        var dados = JSON.parse(bruto);
        return dados && Array.isArray(dados.categories) ? dados.categories : null;
      } catch (e) {
        return null;
      }
    }

    var montagemInicial = montarPool(categoriasDoCache());
    var poolGrade = montagemInicial.pool.length ? montagemInicial.pool : PINTEREST_POOL_PADRAO;
    var fotosPorCategoria = montagemInicial.porCategoria;

    // Embaralha dinamicamente as fotos e posições de todos os cartões da grade a cada recarregamento da tela
    function randomizarGradePinterest() {
      var cards = pinterestGrid.querySelectorAll('.pinterest-card:not(#hero-featured-card):not(.card-main-hero)');
      if (!cards || cards.length === 0) return;

      var shuffled1 = embaralharArray(poolGrade);
      var shuffled2 = embaralharArray(poolGrade);
      var shuffledPool = shuffled1.concat(shuffled2);

      cards.forEach(function(card, idx) {
        var item = shuffledPool[idx % shuffledPool.length];
        if (!item) return;

        var img = card.querySelector('img');
        if (img) {
          img.src = item.src;
          img.alt = item.alt;
        }

        var badge = card.querySelector('.pinterest-badge');
        if (badge) {
          badge.textContent = item.badge;
        }

        card.setAttribute('data-category', item.category);
        card.setAttribute('aria-label', 'Ver galeria de ' + item.category);
      });
    }

    // Executa a randomização inicial imediatamente para mudar a posição das fotos a cada carregamento/recarregamento
    randomizarGradePinterest();

    // O content.js avisa quando o conteúdo chega do servidor. Na primeira visita
    // sem cache a grade começa na reserva e é refeita aqui com as categorias do
    // painel; nas seguintes o cache já acerta e nada muda.
    document.addEventListener('vilma:conteudo', function (evento) {
      var detalhe = evento && evento.detail ? evento.detail : null;
      var montagem = montarPool(detalhe ? detalhe.categories : null);
      // Pool vazio = servidor sem categorias, aí a reserva continua valendo.
      if (!montagem.pool.length) return;

      poolGrade = montagem.pool;
      fotosPorCategoria = montagem.porCategoria;
      randomizarGradePinterest();
      // Na Section 2 a altura do cartão segue a proporção real da foto, então a
      // medição em cache mediu as imagens antigas e precisa ser refeita.
      galeriaMaxH = null;
    });

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
        var badge = card.querySelector('.pinterest-badge');
        var badgeText = badge ? badge.textContent.trim() : (cat || '');

        if (cat === 'Vilma Silva') {
          window.location.href = './pages/sobremim.html';
          return;
        }
        if (cat === 'Cardápios') {
          window.location.href = './pages/servicos.html';
          return;
        }
        if (cat) {
          try {
            var galeriaFotos = [
              './img/p-burger.jpg',
              './img/p-pizza.jpg',
              './img/p-massa.jpg',
              './img/p-steak.jpg',
              './img/p-drink.jpg',
              './img/p-sobremesa.jpg',
              './img/p-cafe.jpg',
              './img/p-2.JPG',
              './img/p-3.JPG',
              './img/p-4.JPG',
              './img/p-5.jpg',
              './img/p-6.JPG',
              './img/p-7.jpg',
              './img/img1.jpg'
            ];
            // Primeiro o índice que o painel montou, que já é o que está na tela.
            // O localStorage é só a rede de segurança para categorias que ainda
            // não chegaram neste carregamento.
            var fotosCat = fotosPorCategoria[cat] || [];
            if (fotosCat.length === 0) {
              var cached = localStorage.getItem('vilma_fotografia_data');
              if (cached) {
                var parsed = JSON.parse(cached);
                var encontrada = (parsed.categories || []).find(function(c) {
                  return c.name && c.name.toLowerCase() === cat.toLowerCase();
                });
                if (encontrada && encontrada.gallery && encontrada.gallery.length > 0) {
                  fotosCat = encontrada.gallery;
                }
              }
            }
            if (fotosCat.length === 0) {
              fotosCat = embaralharArray(galeriaFotos);
            }
            localStorage.setItem('current_gallery_data', JSON.stringify({
              name: cat,
              subtitle: badgeText,
              gallery: fotosCat,
              timestamp: Date.now()
            }));
          } catch (err) {}
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
      padFinalPx = null;
      galeriaMaxH = null;
      headerInsetPx = null;
      if (pinterestGrid) {
        pinterestGrid.style.gridTemplateColumns = '';
        pinterestGrid.style.paddingTop = '';
        pinterestGrid.style.pointerEvents = '';
        pinterestGrid.style.transform = '';
        pinterestGrid.style.clipPath = '';
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
      // Cards individuais (bloco 5.8) e a altura da Section 2 (bloco 6)
      // também precisam ser limpos, senão um resize no meio da transição
      // deixa transform/opacity/height obsoletos no mobile.
      for (var ci = 0; ci < colCards.length; ci++) {
        colCards[ci].el.style.transform = '';
        colCards[ci].el.style.opacity = '';
      }
      if (nextSection) nextSection.style.height = '';
      if (verMaisButtons.length) {
        for (var vm2 = 0; vm2 < verMaisButtons.length; vm2++) {
          verMaisButtons[vm2].style.opacity = '';
          verMaisButtons[vm2].style.pointerEvents = '';
        }
      }
      if (portfolioHeaderBar) {
        portfolioHeaderBar.style.opacity = '';
        portfolioHeaderBar.style.pointerEvents = '';
      }
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
      // A transição agora é mais longa (2.5vh) para permitir um fluxo suave dos elementos
      var transDist = vh * 2.5;
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

      // ============================================================
      // 5. TRANSIÇÃO CONTÍNUA E REVERSÍVEL (Section 1 -> Section 2)
      // ============================================================
      // Regra de ouro: TODOS os valores abaixo são função pura de `ease`
      // (0 no topo, 1 na galeria). Nenhum elemento é movido no DOM,
      // nenhum estilo é condicional a um threshold. Isso garante que
      // rolar para cima reproduza EXATAMENTE o estado original.
      // ============================================================

      // 5.1 Grade: a coluna central encolhe de 1.45fr -> 0fr de forma
      // contínua; ao chegar em 0 o grid fica com 4 colunas uniformes.
      var centerFr = Math.max(1.45 * (1 - ease), 0);
      pinterestGrid.style.gridTemplateColumns =
        'minmax(0, 1fr) minmax(0, 1fr) minmax(0, ' + centerFr.toFixed(4) + 'fr) minmax(0, 1fr) minmax(0, 1fr)';

      // 5.2 Coluna central: encolhe, sobe e some gradualmente junto com a
      // coluna que a hospeda (sem display:none, sem salto).
      if (colCenter) {
        colCenter.style.opacity = Math.max(1 - ease * 1.6, 0).toFixed(3);
        colCenter.style.transform =
          'translate3d(0, ' + (-ease * 70).toFixed(1) + 'px, 0) scale(' + (1 - ease * 0.35).toFixed(3) + ')';
        colCenter.style.pointerEvents = 'none';
        colCenter.style.display = '';
        colCenter.style.width = '';
        colCenter.style.height = '';
        colCenter.style.overflow = '';
      }
      if (centerOverlay) centerOverlay.style.opacity = Math.max(1 - ease * 1.6, 0).toFixed(3);

      // 5.3 Alinhamento vertical das 4 colunas laterais:
      // no repouso (Section 1) têm o escalonamento estilo Pinterest
      // (+36, -26, +26, -36) e vão para 0 conforme o scroll avança.
      // Em ease = 0 o transform inline é removido para devolver o controle
      // às animações ociosas de flutuação (evita "pulo" ao voltar ao topo).
      if (ease > 0.0005) {
        if (col1) col1.style.transform = 'translate3d(0, ' + ((1 - ease) * 36).toFixed(1) + 'px, 0)';
        if (col2) col2.style.transform = 'translate3d(0, ' + ((1 - ease) * -26).toFixed(1) + 'px, 0)';
        if (col4) col4.style.transform = 'translate3d(0, ' + ((1 - ease) * 26).toFixed(1) + 'px, 0)';
        if (col5) col5.style.transform = 'translate3d(0, ' + ((1 - ease) * -36).toFixed(1) + 'px, 0)';
      } else {
        if (col1) col1.style.transform = '';
        if (col2) col2.style.transform = '';
        if (col4) col4.style.transform = '';
        if (col5) col5.style.transform = '';
      }

      // 5.4 Desce a grade para abrir espaço ao cabeçalho "Portfólio".
      // O destino vem de --grid-pad-final (responsivo no CSS) e é
      // interpolado de 0 -> final, ficando contínuo e reversível.
      if (padFinalPx === null) {
        var rawPad = getComputedStyle(pinterestGrid).getPropertyValue('--grid-pad-final');
        padFinalPx = parseFloat(rawPad);
        if (!padFinalPx || isNaN(padFinalPx)) padFinalPx = 200;
      }
      pinterestGrid.style.paddingTop = (ease * padFinalPx).toFixed(1) + 'px';

      // 5.9 Recorte da faixa do cabeçalho.
      // O título "Portfólio" é `position: fixed` e a galeria é transladada
      // para cima (bloco 6): sem recorte, os cards passam por baixo do texto.
      // `clip-path` corta a grade exatamente na borda inferior do cabeçalho,
      // então os cards desaparecem sob o título em vez de se sobrepor a ele.
      // Função pura de `ease` (0 -> headerInsetPx), logo reversível por
      // construção; em ease = 0 volta a `''`, o estado original sem recorte.
      if (headerInsetPx === null) headerInsetPx = medirHeaderInset();
      var clipPx = ease * headerInsetPx;
      pinterestGrid.style.clipPath = ease > 0.0005
        ? 'inset(' + clipPx.toFixed(1) + 'px 0px 0px 0px)'
        : '';

      // 5.5 Revelação do cabeçalho "Portfólio".
      var headerProg = Math.min(Math.max((ease - 0.15) / 0.5, 0), 1);
      var headerEase = headerProg * headerProg * (3 - 2 * headerProg);
      if (portfolioHeaderBar) {
        portfolioHeaderBar.style.opacity = headerEase.toFixed(3);
        portfolioHeaderBar.style.transform = 'translate3d(0, ' + ((1 - headerEase) * -18).toFixed(1) + 'px, 0)';
        portfolioHeaderBar.style.pointerEvents = headerProg >= 0.85 ? 'auto' : 'none';
      }

      // 5.6 Botões "Ver mais" surgem suavemente.
      var verMaisProg = Math.min(Math.max((ease - 0.35) / 0.4, 0), 1);
      for (var vm = 0; vm < verMaisButtons.length; vm++) {
        verMaisButtons[vm].style.opacity = verMaisProg.toFixed(3);
        verMaisButtons[vm].style.pointerEvents = verMaisProg >= 0.8 ? 'auto' : 'none';
      }

      // 5.7 Interatividade dos cartões apenas na galeria.
      pinterestGrid.style.pointerEvents = ease >= 0.65 ? 'auto' : 'none';

      // 5.8 FLUXO SUAVE dos cards das 4 colunas laterais.
      // Cada card recebe um atraso (cascata) calculado a partir da sua
      // posição original na coluna. Como o atraso é determinístico e fixo,
      // o movimento é exatamente reversível ao rolar para cima.
      for (var ci = 0; ci < colCards.length; ci++) {
        var entry = colCards[ci];
        var delay = entry.row * 0.02;
        var cardProg = Math.min(Math.max((ease - delay) / Math.max(1 - delay, 0.001), 0), 1);
        var cardEase = cardProg * cardProg * (3 - 2 * cardProg);

        var dx = 0;
        var dy = cardEase * (18 + (entry.row % 3) * 6);
        var sc = 1 - cardEase * 0.04;
        var op = 1 - cardEase * 0.12;

        entry.el.style.transform = 'translate3d(' + dx.toFixed(1) + 'px, ' + dy.toFixed(1) + 'px, 0) scale(' + sc.toFixed(3) + ')';
        entry.el.style.opacity = op.toFixed(3);
      }

      // 6. Rolagem contínua de todo o portfólio (Section 2) até o último item,
      // com margem de respiro antes da Section 3 (#sobre).
      // A altura da galeria é medida uma única vez por layout (ver
      // medirAlturaGaleria) para não depender do progresso do scroll.
      if (galeriaMaxH === null) galeriaMaxH = medirAlturaGaleria();
      var maxColH = galeriaMaxH;

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
            // O recorte acompanha o título, que também sobe: mantém a borda
            // de recorte colada na base do cabeçalho em vez de deixar uma
            // faixa vazia no topo.
            if (clipPx > 0) {
              pinterestGrid.style.clipPath =
                'inset(' + Math.max(clipPx + pushUp, 0).toFixed(1) + 'px 0px 0px 0px)';
            }
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
    window.addEventListener('resize', function () {
      // --grid-pad-final, a faixa do cabeçalho e a altura da galeria dependem
      // do viewport/layout: revalida todas as três no resize.
      padFinalPx = null;
      galeriaMaxH = null;
      headerInsetPx = null;
      aoRolar();
    }, { passive: true });
    atualizar();
  }

  // --------------------------------------------------- vídeo hero tiktok
  function cuidarDoVideoHero() {
    var video = document.getElementById('hero-center-video');
    if (!video) return;

    // O som é decisão de quem assiste, não deste arquivo. `data-som` é o que
    // o botão de som grava: enquanto a visitante não mandar ligar, o vídeo
    // entra mudo — que é a única forma de o autoplay ser concedido.
    function aplicarMudoPadrao() {
      if (video.dataset.som === 'ligado') return;
      video.muted = true;
      video.setAttribute('muted', '');
    }

    video.playsInline = true;
    video.autoplay = true;
    video.loop = true;
    aplicarMudoPadrao();

    function tentarTocar() {
      if (!video.src || video.style.display === 'none') return;
      aplicarMudoPadrao();
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
