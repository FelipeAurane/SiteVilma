// Função para iniciar o flip automático apenas em dispositivos móveis
function startAutomaticFlip() {
  // Verifica se é um dispositivo móvel
  if (window.innerWidth <= 767) {
      // Seleciona a imagem frontal e traseira
      var frontImage = document.getElementById('pic-front');
      var backImage = document.getElementById('pic-back');
      var isFront = true; // Variável para rastrear se a imagem frontal está atualmente sendo mostrada

      // Função para alternar entre as imagens
      function flip() {
          if (isFront) {
              frontImage.style.transform = "rotateY(-180deg)";
              backImage.style.transform = "rotateY(0deg)";
          } else {
              frontImage.style.transform = "rotateY(0deg)";
              backImage.style.transform = "rotateY(180deg)";
          }
          isFront = !isFront; // Inverte o estado
      }

      // Inicia o flip automático a cada 2 segundos
      setInterval(flip, 5000);
  }
}

// Chama a função para iniciar o flip automático apenas em dispositivos móveis quando o documento estiver carregado
document.addEventListener("DOMContentLoaded", startAutomaticFlip);

function openLightbox(imageSrc) {
  document.getElementById('lightbox-image').src = imageSrc;
  document.getElementById('lightbox').style.display = 'block';
}

function closeLightbox() {
  document.getElementById('lightbox').style.display = 'none';
}

// Função para adicionar a classe 'visible' aos elementos e iniciar a animação de fade-in
function fadeInElements() {
  const sectionTextMobile = document.querySelector('.section__text-mobile');
  const btnContainerMobile = document.querySelector('.btn-container-mobile');

  // Adiciona a classe 'visible' aos elementos
  sectionTextMobile.classList.add('visible');
  btnContainerMobile.classList.add('visible');

  // Adiciona um evento de transição para garantir que os elementos permaneçam visíveis após a animação
  sectionTextMobile.addEventListener('transitionend', function() {
      sectionTextMobile.style.opacity = '1'; // Garante que a opacidade seja definida como 1 após a animação
  });

  btnContainerMobile.addEventListener('transitionend', function() {
      btnContainerMobile.style.opacity = '1'; // Garante que a opacidade seja definida como 1 após a animação
  });
}

// Chama a função fadeInElements() após o carregamento completo da página
document.addEventListener('DOMContentLoaded', function() {
  fadeInElements();
});


function voltarParaOTopo() {
  window.scrollTo({ top: 0, behavior: 'smooth' }); // Rola a página de volta para o topo suavemente
}



// Selecione o elemento HTML
const animationContainer = document.getElementById('lottie-animation');

// Carregue o arquivo JSON da animação
const animationData = {
    container: animationContainer,
    renderer: 'svg',
    loop: true,
    autoplay: true,
    path: 'star.json' // substitua pelo caminho do seu arquivo JSON
};

// Inicialize a animação
const animacao = lottie.loadAnimation(animationData);
