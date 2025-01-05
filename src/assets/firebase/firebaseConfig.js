// Função para inicializar o Firebase e atribuir a db
function inicializarFirebase() {
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

  try {
    // Inicializar o Firebase
    firebase.initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Erro ao inicializar o Firebase: ", error);
  }

  const db = firebase.database();
  const storage = firebase.storage();
}