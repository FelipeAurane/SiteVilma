'use strict';

/**
 * Copia o painel para desktop/build/painel antes de empacotar.
 *
 *   src/admin/            -> build/painel/admin/   (sem a pasta _legado)
 *   src/js/<compartilhados> -> build/painel/js/
 *
 * Só os módulos do site que o painel importa vão junto; o resto do site
 * continua vindo do servidor.
 */

const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..', '..');
const DESTINO = path.join(__dirname, '..', 'build', 'painel');
const COMPARTILHADOS = ['api.js', 'dataManager.js', 'visibility.js'];
const FORA = new Set(['_legado']);

fs.rmSync(DESTINO, { recursive: true, force: true });

fs.cpSync(path.join(RAIZ, 'src', 'admin'), path.join(DESTINO, 'admin'), {
  recursive: true,
  filter: (origem) => !FORA.has(path.basename(origem))
});

fs.mkdirSync(path.join(DESTINO, 'js'), { recursive: true });
for (const arquivo of COMPARTILHADOS) {
  fs.copyFileSync(path.join(RAIZ, 'src', 'js', arquivo), path.join(DESTINO, 'js', arquivo));
}

console.log(`Painel copiado para ${path.relative(RAIZ, DESTINO)}`);
