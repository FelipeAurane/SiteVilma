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
function atualizarCarrossel() {
    const carouselContainer = document.getElementById('carouselContainer');
  
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
  
  // Chamar a função para buscar e exibir as imagens ao carregar a página
  window.onload = function() {
    atualizarCarrossel();
  };