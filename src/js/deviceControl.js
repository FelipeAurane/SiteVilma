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
    document.querySelector('.body-mobile').classList.remove('visible');
    document.querySelector('.body-mobile').classList.add('hidden');
  }

  // Método para exibir elementos para dispositivos móveis
  exibirElementosMobile() {
    // Exibe os elementos específicos para dispositivos móveis
    document.querySelector('.body-mobile').classList.remove('hidden');
    document.querySelector('.body-mobile').classList.add('visible');

    // Oculta os elementos específicos para dispositivos desktop
    document.querySelector('.body-desktop').classList.remove('visible');
    document.querySelector('.body-desktop').classList.add('hidden');
  }
}

// Cria uma instância da classe DeviceControl ao carregar a página
window.onload = () => new DeviceControl();
