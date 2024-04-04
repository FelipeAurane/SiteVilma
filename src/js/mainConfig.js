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
      