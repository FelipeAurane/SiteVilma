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

// ------------------------------------------------------------- execução

console.log('=== Testes de Frontend ===\n');

try {
  testSafeImageSrc();
  testSafePhone();
  testWhatsappUrl();
  testText();
  
  console.log('=== Todos os testes passaram! ===');
  process.exit(0);
} catch (error) {
  console.error('❌ Teste falhou:', error.message);
  process.exit(1);
}
