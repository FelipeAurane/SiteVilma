'use strict';

/**
 * Testes de frontend para funções de sanitização e utilitários.
 */

const assert = require('assert');

// Simular localStorage para testes
const localStorageMock = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, value) { this.store[key] = String(value); },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};

Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });

// Simular navigator
Object.defineProperty(global, 'navigator', { value: { onLine: true }, writable: true });

// Simular window
Object.defineProperty(global, 'window', {
  value: {
    addEventListener: () => {},
    location: { pathname: '/' }
  },
  writable: true
});

// Importar as funções de sanitização (extraídas para testabilidade)
function safeImageSrc(value, fallback = '') {
  if (typeof value !== 'string' || value.trim() === '') return fallback;

  const src = value.trim();
  if (src.startsWith('/api/media/')) return src;
  if (src.startsWith('./') || src.startsWith('../')) return src;
  if (src.startsWith('/') && !src.startsWith('//')) return src;

  return fallback;
}

function safePhone(value) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function whatsappUrl(phone, message) {
  const number = safePhone(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(String(message || ''))}`;
}

function text(value, fallback = '') {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

// ------------------------------------------------------------- testes

function testSafeImageSrc() {
  console.log('Testando safeImageSrc...');
  
  // Deve aceitar caminhos relativos válidos
  assert.strictEqual(safeImageSrc('./img/capa.jpg'), './img/capa.jpg');
  assert.strictEqual(safeImageSrc('../img/capa.jpg'), '../img/capa.jpg');
  assert.strictEqual(safeImageSrc('/api/media/123'), '/api/media/123');
  assert.strictEqual(safeImageSrc('/img/capa.jpg'), '/img/capa.jpg');
  
  // Deve rejeitar URLs externas
  assert.strictEqual(safeImageSrc('https://evil.com/x.jpg'), '');
  assert.strictEqual(safeImageSrc('http://evil.com/x.jpg'), '');
  assert.strictEqual(safeImageSrc('//evil.com/x.jpg'), '');
  
  // Deve rejeitar javascript:
  assert.strictEqual(safeImageSrc('javascript:alert(1)'), '');
  
  // Deve rejeitar data:
  assert.strictEqual(safeImageSrc('data:image/svg+xml,...'), '');
  
  // Deve usar fallback para valores inválidos
  assert.strictEqual(safeImageSrc(null, 'fallback.jpg'), 'fallback.jpg');
  assert.strictEqual(safeImageSrc('', 'fallback.jpg'), 'fallback.jpg');
  assert.strictEqual(safeImageSrc(123, 'fallback.jpg'), 'fallback.jpg');
  
  console.log('✓ safeImageSrc OK\n');
}

function testSafePhone() {
  console.log('Testando safePhone...');
  
  assert.strictEqual(safePhone('5581998370180'), '5581998370180');
  assert.strictEqual(safePhone('(55) 81 99837-0180'), '5581998370180');
  assert.strictEqual(safePhone('+55 81 99837-0180'), '5581998370180');
  assert.strictEqual(safePhone(''), '');
  assert.strictEqual(safePhone(null), '');
  assert.strictEqual(safePhone(undefined), '');
  
  console.log('✓ safePhone OK\n');
}

function testWhatsappUrl() {
  console.log('Testando whatsappUrl...');
  
  const url = whatsappUrl('5581998370180', 'Olá!');
  assert.ok(url.startsWith('https://wa.me/5581998370180?text='));
  assert.ok(url.includes('Ol%C3%A1'));
  
  // Deve retornar null para telefone inválido
  assert.strictEqual(whatsappUrl('', 'msg'), null);
  assert.strictEqual(whatsappUrl(null, 'msg'), null);
  
  console.log('✓ whatsappUrl OK\n');
}

function testText() {
  console.log('Testando text...');
  
  assert.strictEqual(text('hello'), 'hello');
  assert.strictEqual(text(123), '123');
  assert.strictEqual(text(null, 'fallback'), 'fallback');
  assert.strictEqual(text(undefined, 'fallback'), 'fallback');
  assert.strictEqual(text({}, 'fallback'), 'fallback');
  assert.strictEqual(text(''), '');
  
  console.log('✓ text OK\n');
}

// O selo de publicação decide se a página troca o cache velho pelo conteúdo do
// servidor. Ele mora em `metadata` quando vem do banco e no topo quando veio
// de um save do painel; ler só um dos dois fazia o site ignorar o painel.
async function testLerSeloPublicacao() {
  console.log('Testando lerSeloPublicacao...');

  const { lerSeloPublicacao } = await import('../src/js/dataManager.js');

  // Forma do servidor: version/lastUpdated dentro de metadata.
  assert.deepStrictEqual(
    lerSeloPublicacao({ metadata: { version: 2, lastUpdated: '2026-09-29T12:00:00.000Z' } }),
    { version: 2, lastUpdated: 0 }
  );

  // Forma do save do painel: no topo do objeto.
  assert.deepStrictEqual(
    lerSeloPublicacao({ version: 7, lastUpdated: 1755000000000 }),
    { version: 7, lastUpdated: 1755000000000 }
  );

  // O topo tem precedência: um save é mais novo que o metadata que ficou atrás.
  assert.deepStrictEqual(
    lerSeloPublicacao({ version: 8, lastUpdated: 1, metadata: { version: 2, lastUpdated: 0 } }),
    { version: 8, lastUpdated: 1 }
  );

  // Sem dado nenhum, o site precisa ver versão 0 para aceitar o servidor
  // como novidade em vez de concluir que nada mudou.
  assert.deepStrictEqual(lerSeloPublicacao(null), { version: 0, lastUpdated: 0 });
  assert.deepStrictEqual(lerSeloPublicacao({}), { version: 0, lastUpdated: 0 });
  assert.deepStrictEqual(lerSeloPublicacao({ metadata: null }), { version: 0, lastUpdated: 0 });

  console.log('✓ lerSeloPublicacao OK\n');
}

// O destaque central aceita foto OU vídeo, e o site precisa saber qual dos
// dois é. O caso que realmente dói é o do /api/media/<uuid>: a URL não tem
// extensão, então sem o tipo gravado pelo painel o vídeo viraria imagem.
async function testIsVideoMedia() {
  console.log('Testando isVideoMedia...');

  const { isVideoMedia } = await import('../src/js/dataManager.js');

  // O que o painel grava junto da URL.
  assert.strictEqual(isVideoMedia('/api/media/abc-123', 'video'), true);
  assert.strictEqual(isVideoMedia('/api/media/abc-123', 'imagem'), false);

  // Sem o tipo gravado, o id não dá pista: cai em imagem, que é o
  // comportamento do conteúdo salvo antes de o campo existir.
  assert.strictEqual(isVideoMedia('/api/media/abc-123', ''), false);
  assert.strictEqual(isVideoMedia('/api/media/abc-123', undefined), false);

  // Caminho com nome de arquivo: a extensão serve de palpite.
  assert.strictEqual(isVideoMedia('./img/hero.mp4', ''), true);
  assert.strictEqual(isVideoMedia('./img/hero.MP4', ''), true);
  assert.strictEqual(isVideoMedia('./img/hero.webm', ''), true);
  assert.strictEqual(isVideoMedia('./img/clipe.mov', ''), true);
  assert.strictEqual(isVideoMedia('./img/clipe.m4v', ''), true);
  assert.strictEqual(isVideoMedia('./img/capa.jpg', ''), false);
  assert.strictEqual(isVideoMedia('./img/capa.JPG', ''), false);

  // Query string não pode enganar o palpite da extensão.
  assert.strictEqual(isVideoMedia('/api/media/abc?v=2', 'video'), true);
  assert.strictEqual(isVideoMedia('./img/foto.mp4?v=2', ''), true);
  assert.strictEqual(isVideoMedia('./img/foto.jpg?v=2', ''), false);

  // .mp4 no meio do nome não é extensão.
  assert.strictEqual(isVideoMedia('./img/foto.mp4.orig.jpg', ''), false);

  // Vazio nunca vira vídeo.
  assert.strictEqual(isVideoMedia('', ''), false);
  assert.strictEqual(isVideoMedia(null, null), false);

  console.log('✓ isVideoMedia OK\n');
}

// ------------------------------------------------------------- execução

console.log('=== Testes de Frontend ===\n');

(async () => {
  try {
    testSafeImageSrc();
    testSafePhone();
    testWhatsappUrl();
    testText();
    await testLerSeloPublicacao();
    await testIsVideoMedia();

    console.log('=== Todos os testes passaram! ===');
    process.exit(0);
  } catch (error) {
    console.error('❌ Teste falhou:', error.message);
    process.exit(1);
  }
})();
