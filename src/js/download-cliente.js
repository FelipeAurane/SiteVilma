const params = new URLSearchParams(location.search);
const id = (location.pathname.split('/').pop() || params.get('g') || '').trim();
const stage = document.getElementById('stage');
const app = document.getElementById('app');
const login = document.getElementById('login');
const form = document.getElementById('form-login');
const erro = document.getElementById('erro');

let fotos = [];
let idx = 0;
let timer = null;
let pausado = false;

async function entrar(email, senha) {
  const r = await fetch('/api/galeria?modo=login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, email, senha })
  });
  if (!r.ok) throw new Error('Login inválido');
  const d = await r.json();
  // reuse cookie; fetch gallery
  const g = await fetch(`/api/galeria?id=${encodeURIComponent(id)}`, { credentials: 'include' });
  if (!g.ok) throw new Error('Sem acesso');
  const data = await g.json();
  fotos = (data.galeria?.gallery || []).map((u) => (typeof u === 'string' ? u : u.url)).filter(Boolean);
  if (!fotos.length && data.galeria?.image) fotos = [data.galeria.image];
  login.style.display = 'none';
  app.style.display = 'block';
  mostrar(0);
  iniciar();
}

function mostrar(i) {
  idx = (i + fotos.length) % fotos.length;
  stage.innerHTML = `<div class="dl-slide"><img src="${fotos[idx]}" alt="foto ${idx+1}"></div>`;
}

function iniciar() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => { if (!pausado) mostrar(idx + 1); }, 4000);
}

// drag to go back
let startX = 0;
stage.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; });
stage.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - startX;
  if (dx > 60) { pausado = true; mostrar(idx - 1); }
  if (dx < -60) { pausado = true; mostrar(idx + 1); }
});

document.getElementById('btn-baixar').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = fotos[idx];
  a.download = `foto-${idx+1}.jpg`;
  a.click();
});

document.getElementById('btn-pausar').addEventListener('click', () => {
  pausado = !pausado;
  document.getElementById('btn-pausar').textContent = pausado ? 'Retomar' : 'Pausar';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  erro.textContent = '';
  try {
    await entrar(document.getElementById('email').value, document.getElementById('senha').value);
  } catch (err) {
    erro.textContent = err.message || 'Falha no login';
  }
});