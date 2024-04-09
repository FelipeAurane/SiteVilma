// Configurar o Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAsI3KvNu06Y-vax2bR12Q2qcUWnoDi8Zc",
  authDomain: "sitevilma-3d323.firebaseapp.com",
  databaseURL: "https://sitevilma-3d323-default-rtdb.firebaseio.com",
  projectId: "sitevilma-3d323",
  storageBucket: "sitevilma-3d323.appspot.com",
  messagingSenderId: "578907751181",
  appId: "1:578907751181:web:f0953c012634742780e644",
  measurementId: "G-S1SXQ397HM"
};

// Inicializar o Firebase
firebase.initializeApp(firebaseConfig);
// Função para buscar as últimas imagens e atualizar o carrossel
function atualizarCarrossel(carouselId) {
  const carouselContainer = document.getElementById(carouselId);

  // Referência ao banco de dados
  const dbRef = firebase.database().ref('image-carrossel');

  dbRef.once('value', function(snapshot) {
      const imagens = snapshot.val();

      // Limpar o conteúdo atual do carrossel
      carouselContainer.innerHTML = '';

      if (imagens) {
          // Adicionar as imagens ao carrossel
          Object.values(imagens).forEach(function(imagemURL) {
              const galleryItem = document.createElement('div');
              galleryItem.classList.add('gallery-item');

              // Criar elemento de imagem e definir dimensões
              const imagemElemento = document.createElement('img');
              imagemElemento.src = imagemURL;
              imagemElemento.alt = 'Imagem';
              imagemElemento.style.width = '90%'; // Definir largura da imagem
              imagemElemento.style.height = 'auto'; // Permitir que a altura seja ajustada automaticamente

              galleryItem.appendChild(imagemElemento);
              carouselContainer.appendChild(galleryItem);
          });
      } else {
          // Caso não haja imagens, exibir uma mensagem ou realizar outra ação
          console.log('Não há imagens disponíveis.');
      }
  });
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
      const bodyDesktop = document.querySelector('.body-desktop');
      if (bodyDesktop) {
          bodyDesktop.classList.remove('hidden');
          bodyDesktop.classList.add('visible');
      }

      // Oculta os elementos específicos para dispositivos móveis
      const bodyMobile = document.querySelector('.body-mobile');
      if (bodyMobile) {
          bodyMobile.classList.remove('visible');
          bodyMobile.classList.add('hidden');
      }
  }

  // Método para exibir elementos para dispositivos móveis
  exibirElementosMobile() {
      // Exibe os elementos específicos para dispositivos móveis
      const bodyMobile = document.querySelector('.body-mobile');
      if (bodyMobile) {
          bodyMobile.classList.remove('hidden');
          bodyMobile.classList.add('visible');
      }

      // Oculta os elementos específicos para dispositivos desktop
      const bodyDesktop = document.querySelector('.body-desktop');
      if (bodyDesktop) {
          bodyDesktop.classList.remove('visible');
          bodyDesktop.classList.add('hidden');
      }
  }
}


// Cria uma instância da classe DeviceControl ao carregar a página
window.onload = () => {
  atualizarCarrossel('carouselContainer1');
  atualizarCarrossel('carouselContainer2');
  const deviceControl = new DeviceControl();
  atualizarCarrossel(); // Chama a função para atualizar o carrossel após instanciar a classe DeviceControl
};
