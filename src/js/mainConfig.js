function startAutomaticFlip() {
    if (window.innerWidth <= 767) {
        var frontImage = document.getElementById("pic-front");
        var backImage = document.getElementById("pic-back");
        var isFront = true;

        function flip() {
            if (isFront) {
                frontImage.style.transform = "rotateY(-180deg)";
                backImage.style.transform = "rotateY(0deg)";
            } else {
                frontImage.style.transform = "rotateY(0deg)";
                backImage.style.transform = "rotateY(180deg)";
            }
            isFront = !isFront;
        }

        setInterval(flip, 5000);
    }
}

document.addEventListener("DOMContentLoaded", startAutomaticFlip);

function openLightbox(imageSrc) {
    document.getElementById("lightbox-image").src = imageSrc;
    document.getElementById("lightbox").style.display = "flex";
}

function closeLightbox() {
    document.getElementById("lightbox").style.display = "none";
}

function abrirEmail() {
    var email = "viilma_silva@outlook.com";
    window.location.href = "mailto:" + email;
}

function fecharTela() {
    document.getElementById('telaCentral').style.display = 'none';
  }
      


  class DeviceControl {
    constructor() {
      // Verifica o tipo de dispositivo ao inicializar a classe
      this.verificarDispositivo();
    
      // Adiciona um ouvinte de evento para verificar o dispositivo sempre que a janela for redimensionada
      window.addEventListener('resize', () => this.verificarDispositivo());
    }
  
    // Método para verificar o tipo de dispositivo
    verificarDispositivo() {
      // Verifica a largura da janela para determinar o tipo de dispositivo
      if (window.innerWidth >= 768) {
        // Se a largura for maior ou igual a 768 pixels, é considerado um dispositivo desktop
        this.exibirElementosDesktop();
      } else {
        // Caso contrário, é considerado um dispositivo móvel
        this.exibirElementosMobile();
      }
    }
  
    // Método para exibir elementos para dispositivos desktop
    exibirElementosDesktop() {
      // Exibe os elementos específicos para dispositivos desktop
      document.querySelector('.body-desktop').classList.remove('hidden');
      document.querySelector('.body-desktop').classList.add('visible');
      
      // Oculta os elementos específicos para dispositivos móveis
      document.querySelector('.section__text-mobile').classList.remove('visible');
      document.querySelector('.section__text-mobile').classList.add('hidden');
      document.querySelector('.btn-container-mobile').classList.remove('visible');
      document.querySelector('.btn-container-mobile').classList.add('hidden');
    }
  
    // Método para exibir elementos para dispositivos móveis
    exibirElementosMobile() {
      // Exibe os elementos específicos para dispositivos móveis
      document.querySelector('.body-mobile').classList.remove('hidden');
      document.querySelector('.body-mobile').classList.add('visible');
      
      // Oculta os elementos específicos para dispositivos desktop
      document.querySelector('.section__text-desktop').classList.remove('visible');
      document.querySelector('.section__text-desktop').classList.add('hidden');
      document.querySelector('.btn-container-desktop').classList.remove('visible');
      document.querySelector('.btn-container-desktop').classList.add('hidden');
    }
  }
  
  // Cria uma instância da classe DeviceControl ao carregar a página
  window.onload = () => new DeviceControl();