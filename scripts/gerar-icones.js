#!/usr/bin/env node
'use strict';

/**
 * Gera os ícones do PWA e do aplicativo Android: fundo escuro com um anel
 * de diafragma branco.
 *
 *   node scripts/gerar-icones.js             só os PNG do site (PWA)
 *   node scripts/gerar-icones.js --android   também os mipmaps do Android
 *
 * Escreve PNG na mão (zlib do próprio Node) para não trazer dependência de
 * imagem só por causa de alguns arquivos. Troque por uma arte de verdade
 * quando tiver — basta substituir os PNGs gerados.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RAIZ = path.join(__dirname, '..');
const SAIDA_WEB = path.join(RAIZ, 'src', 'img');
const SAIDA_ANDROID = path.join(RAIZ, 'android', 'app', 'src', 'main', 'res');

const FUNDO = [14, 14, 16];
const TRACO = [255, 255, 255];

// Densidades do Android: nome da pasta -> [lado do ícone, lado do foreground].
// O foreground é maior porque a máscara adaptativa corta as bordas: a arte
// só pode ocupar os ~66% centrais.
const DENSIDADES = {
  'mipmap-mdpi': [48, 108],
  'mipmap-hdpi': [72, 162],
  'mipmap-xhdpi': [96, 216],
  'mipmap-xxhdpi': [144, 324],
  'mipmap-xxxhdpi': [192, 432]
};

// ------------------------------------------------------------- PNG cru

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = TABELA_CRC[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length, 0);

  const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo), 0);

  return Buffer.concat([tamanho, corpo, crc]);
}

function montarPng(lado, linhas, comAlfa) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8;                    // 8 bits por canal
  ihdr[9] = comAlfa ? 6 : 2;      // 6 = RGBA, 2 = RGB
  ihdr[10] = 0;                   // deflate
  ihdr[11] = 0;                   // filtro adaptativo
  ihdr[12] = 0;                   // sem entrelaçamento

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(linhas), { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------------------------------------------------------- o desenho

/** Suaviza a borda do anel comparando a distância com a espessura. */
function cobertura(distancia, raio, espessura) {
  const borda = Math.abs(distancia - raio);
  const meia = espessura / 2;
  if (borda <= meia - 1) return 1;
  if (borda >= meia + 1) return 0;
  return (meia + 1 - borda) / 2;
}

/**
 * @param {number} lado           tamanho do PNG em pixels
 * @param {object} opcoes
 * @param {boolean} opcoes.transparente  fundo transparente (foreground adaptativo)
 * @param {number}  opcoes.escala        proporção do anel em relação ao lado
 */
function desenhar(lado, { transparente = false, escala = 0.3 } = {}) {
  const centro = lado / 2;
  const raio = lado * escala;
  const espessura = Math.max(2, lado * escala * 0.185);
  const raioPonto = lado * escala * 0.24;

  const canais = transparente ? 4 : 3;
  const linhas = [];

  for (let y = 0; y < lado; y++) {
    // Cada fila é prefixada pelo byte de filtro (0 = nenhum).
    const linha = Buffer.alloc(1 + lado * canais);

    for (let x = 0; x < lado; x++) {
      const dx = x - centro + 0.5;
      const dy = y - centro + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let alfa = cobertura(dist, raio, espessura);

      // Ponto central, como o miolo de uma lente.
      if (dist < raioPonto + 1) {
        alfa = Math.max(alfa, dist <= raioPonto - 1 ? 1 : (raioPonto + 1 - dist) / 2);
      }

      const base = 1 + x * canais;

      if (transparente) {
        linha[base] = TRACO[0];
        linha[base + 1] = TRACO[1];
        linha[base + 2] = TRACO[2];
        linha[base + 3] = Math.round(alfa * 255);
      } else {
        for (let canal = 0; canal < 3; canal++) {
          linha[base + canal] = Math.round(FUNDO[canal] * (1 - alfa) + TRACO[canal] * alfa);
        }
      }
    }

    linhas.push(linha);
  }

  return montarPng(lado, linhas, transparente);
}

function escrever(arquivo, buffer) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, buffer);
  console.log(`  ${path.relative(RAIZ, arquivo).padEnd(52)} ${buffer.length} bytes`);
}

// ------------------------------------------------------------- execução

console.log('PWA / site:');
for (const lado of [192, 512]) {
  escrever(path.join(SAIDA_WEB, `icon-${lado}.png`), desenhar(lado));
}

if (process.argv.includes('--android')) {
  if (!fs.existsSync(SAIDA_ANDROID)) {
    console.error(`\nNão achei ${path.relative(RAIZ, SAIDA_ANDROID)}. Rode antes: npx cap add android`);
    process.exit(1);
  }

  console.log('\nAndroid:');
  for (const [pasta, [ladoIcone, ladoForeground]] of Object.entries(DENSIDADES)) {
    const icone = desenhar(ladoIcone);
    escrever(path.join(SAIDA_ANDROID, pasta, 'ic_launcher.png'), icone);
    escrever(path.join(SAIDA_ANDROID, pasta, 'ic_launcher_round.png'), icone);

    // Anel menor: a máscara adaptativa corta as bordas do foreground.
    escrever(
      path.join(SAIDA_ANDROID, pasta, 'ic_launcher_foreground.png'),
      desenhar(ladoForeground, { transparente: true, escala: 0.21 })
    );
  }

  // O fundo do ícone adaptativo vem do tema escuro, não do branco padrão.
  const corFundo = `#${FUNDO.map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  escrever(
    path.join(SAIDA_ANDROID, 'values', 'ic_launcher_background.xml'),
    Buffer.from(
      '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<resources>\n' +
      `    <color name="ic_launcher_background">${corFundo}</color>\n` +
      '</resources>\n',
      'utf8'
    )
  );

  // O template do Capacitor traz um foreground vetorial que tem prioridade
  // sobre o PNG em API 24+. Sem remover, o ícone antigo continua aparecendo.
  const vetorAntigo = path.join(SAIDA_ANDROID, 'drawable-v24', 'ic_launcher_foreground.xml');
  if (fs.existsSync(vetorAntigo)) {
    fs.rmSync(vetorAntigo);
    console.log(`  removido ${path.relative(RAIZ, vetorAntigo)} (sobrepunha o PNG)`);
  }
}

console.log('\nPronto.');
