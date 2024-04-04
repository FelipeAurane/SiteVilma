let db;
let dbOrder;

// Função para inicializar o Firebase e atribuir a db
function inicializarFirebase() {
    const firebaseConfig = {
        apiKey: "AIzaSyAsI3KvNu06Y-vax2bR12Q2qcUWnoDi8Zc",
        authDomain: "sitevilma-3d323.firebaseapp.com",
        projectId: "sitevilma-3d323",
        storageBucket: "sitevilma-3d323.appspot.com",
        messagingSenderId: "578907751181",
        appId: "1:578907751181:web:90984ca6ff5f8beb80e644",
        measurementId: "G-RPYWXH37ML"
    };

    // Verifica se o aplicativo já foi inicializado
    if (!firebase.apps.length) {
        // Inicializa o Firebase com a configuração fornecida
        firebase.initializeApp(firebaseConfig);
    } else {
        // Se o aplicativo já foi inicializado, use o aplicativo existente
        firebase.app();
    }

    // Atribui db à coleção admin/teste/textos
    db = firebase.firestore().collection("admin").doc("teste").collection("textos");
    dbOrder = db.orderBy("teste");
}

// Função para recuperar e exibir os dados na tela
function exibirDados() {
    dbOrder.get().then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const title = data.title;

            // Log para verificar se os dados estão sendo recuperados corretamente
            console.log("Título recuperado:", title);

            // Atualiza o conteúdo da tag <h1 class="title"> com o valor recuperado
            document.querySelector('.title').textContent = title;
        });
    }).catch((error) => {
        console.error("Erro ao obter documentos: ", error);
    });
}



// Chama a função para inicializar o Firebase e atribuir a db
inicializarFirebase();

// Chama a função para exibir os dados
exibirDados();



// Your web app's Firebase configuration
var firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Set database variable
var database = firebase.database()

function save() {
  var email = document.getElementById('email').value
  var password = document.getElementById('password').value
  var username = document.getElementById('username').value
  var say_something = document.getElementById('say_something').value
  var favourite_food = document.getElementById('favourite_food').value

  database.ref('users/' + username).set({
    email : email,
    password : password,
    username : username,
    say_something : say_something,
    favourite_food : favourite_food
  })

  alert('Saved')
}

function get() {
  var username = document.getElementById('username').value

  var user_ref = database.ref('users/' + username)
  user_ref.on('value', function(snapshot) {
    var data = snapshot.val()

    alert(data.email)

  })

}

function update() {
  var username = document.getElementById('username').value
  var email = document.getElementById('email').value
  var password = document.getElementById('password').value

  var updates = {
    email : email,
    password : password
  }

  database.ref('users/' + username).update(updates)

  alert('updated')
}

function remove() {
  var username = document.getElementById('username').value

  database.ref('users/' + username).remove()

  alert('deleted')
}