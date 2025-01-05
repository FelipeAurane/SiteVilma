// Função para buscar e exibir as imagens
// Função para buscar e exibir as imagens
function buscarImagens() {
    const db = firebase.database();
    const imagemContainer = document.getElementById('imagemContainer');

    // Limpa o conteúdo atual antes de recriar as imagens
    imagemContainer.innerHTML = '';

    db.ref('imagens').once('value', function(snapshot) {
        const imagens = snapshot.val();
        const urls = [];

        // Preencher o array com as URLs das imagens
        for (let key in imagens) {
            if (imagens.hasOwnProperty(key)) {
                urls.push(imagens[key]);
            }
        }

        // Inverter a ordem do array para mostrar o último item no topo da lista
        urls.reverse();

        // Criar elementos de imagem para cada URL e adicioná-los ao contêiner
        urls.forEach(function(imagemURL) {
            const imagemElemento = document.createElement('img');
            imagemElemento.src = imagemURL;
            imagemElemento.classList.add('imagem');
            imagemElemento.addEventListener('click', function() {
                abrirModal(imagemURL);
            });
            imagemContainer.appendChild(imagemElemento);
        });
    });
}


// Função para buscar as últimas 3 imagens e atualizar o carrossel
function atualizarCarrossel() {
    const db = firebase.database();
    const carouselContainer = document.getElementById('carouselContainer');

    db.ref('image-carrossel').orderByKey().limitToLast(3).once('value', function(snapshot) {
        const imagens = snapshot.val();

        // Verifica se há imagens no banco de dados
        if (imagens) {
            carouselContainer.innerHTML = ''; // Limpa o conteúdo atual do carrossel

            Object.values(imagens).forEach(function(imagemURL) {
                const galleryItem = document.createElement('div');
                galleryItem.classList.add('gallery-item');

                const imagemElemento = document.createElement('img');
                imagemElemento.src = imagemURL;
                imagemElemento.alt = 'Imagem';

                galleryItem.appendChild(imagemElemento);
                carouselContainer.appendChild(galleryItem);
            });
        } else {
            // Caso não haja imagens no banco de dados, exibe uma mensagem ou realiza outra ação
            console.log('Nenhuma imagem encontrada.');
        }
    });
}


// Função para abrir o modal com a imagem em tela cheia
function abrirModal(imagemURL) {
    const modal = document.getElementById('myModal');
    const modalImg = document.getElementById("modalImage");
    modal.style.display = "block";
    modalImg.src = imagemURL;
    document.body.classList.add('modal-open'); // Adicionar classe para desativar o scroll
}

// Função para fechar o modal
function fecharModal() {
    const modal = document.getElementById('myModal');
    modal.style.display = "none";
    document.body.classList.remove('modal-open'); // Remover classe para reativar o scroll
}

// Chama a função para buscar e exibir as imagens ao carregar a página
window.onload = function () {
    inicializarFirebase();
    buscarImagens();
    atualizarCarrossel(); // Adicione essa linha
};



