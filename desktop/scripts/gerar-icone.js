'use strict';

/**
 * Gera icone.png (janela) e icone.ico (executável) a partir do símbolo da Luvi
 * (src/admin/img/luvi-icon.svg) — só o símbolo, sem o nome.
 * Roda uma vez; os arquivos gerados ficam versionados.
 *
 *   node desktop/scripts/gerar-icone.js
 *
 * Usa o sharp do projeto do site (../node_modules). O .ico leva imagens PNG
 * dentro, formato aceito pelo Windows desde o Vista.
 */

const fs = require('node:fs');
const path = require('node:path');
const sharp = require(path.join(__dirname, '..', '..', 'node_modules', 'sharp'));

const PASTA = path.join(__dirname, '..');
const SIMBOLO = path.join(__dirname, '..', '..', 'src', 'admin', 'img', 'luvi-icon.svg');

// O símbolo é escuro com uma pétala verde: num quadrado claro ele aparece
// tanto na barra de tarefas escura quanto na clara.
const FUNDO = '#f6f3ee';
const LADO = 512;
const SIMBOLO_LADO = 360;

const fundo = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LADO} ${LADO}"><rect width="${LADO}" height="${LADO}" rx="112" fill="${FUNDO}"/></svg>`
);

function ico(imagens) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0);
  cabecalho.writeUInt16LE(1, 2);
  cabecalho.writeUInt16LE(imagens.length, 4);

  const entradas = [];
  let deslocamento = 6 + 16 * imagens.length;
  for (const { tamanho, png } of imagens) {
    const entrada = Buffer.alloc(16);
    entrada.writeUInt8(tamanho >= 256 ? 0 : tamanho, 0);
    entrada.writeUInt8(tamanho >= 256 ? 0 : tamanho, 1);
    entrada.writeUInt16LE(1, 4);
    entrada.writeUInt16LE(32, 6);
    entrada.writeUInt32LE(png.length, 8);
    entrada.writeUInt32LE(deslocamento, 12);
    entradas.push(entrada);
    deslocamento += png.length;
  }
  return Buffer.concat([cabecalho, ...entradas, ...imagens.map((i) => i.png)]);
}

(async () => {
  const simbolo = await sharp(SIMBOLO, { density: 300 })
    .resize(SIMBOLO_LADO, SIMBOLO_LADO, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const margem = Math.round((LADO - SIMBOLO_LADO) / 2);
  const grande = await sharp(fundo)
    .composite([{ input: simbolo, left: margem, top: margem }])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(PASTA, 'icone.png'), grande);

  const imagens = [];
  for (const tamanho of [16, 24, 32, 48, 64, 128, 256]) {
    imagens.push({ tamanho, png: await sharp(grande).resize(tamanho, tamanho).png().toBuffer() });
  }
  fs.writeFileSync(path.join(PASTA, 'icone.ico'), ico(imagens));
  console.log('icone.png e icone.ico gerados em desktop/');
})();
