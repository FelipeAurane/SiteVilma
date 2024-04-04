function openLightbox(imageSrc) {
    document.getElementById('lightbox-image').src = imageSrc;
    document.getElementById('lightbox').style.display = 'flex'; // Alterado para 'flex' para seguir as configurações de centralização no CSS
}

function closeLightbox() {
    document.getElementById('lightbox').style.display = 'none';
}
