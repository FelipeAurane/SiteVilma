#!/usr/bin/env node
'use strict';

/**
 * Instala o APK no celular ligado por USB.
 *
 *   npm run app:instalar
 *
 * O celular precisa estar com "Depuração USB" ligada (Opções do
 * desenvolvedor) e ter autorizado este computador — a autorização é um
 * aviso que aparece na tela do aparelho e só você pode aceitar.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const APK = path.join(RAIZ, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

const CANDIDATOS_ADB = [
  process.env.ADB,
  path.join(process.env.ANDROID_HOME || '', 'platform-tools', 'adb.exe'),
  path.join(process.env.ANDROID_SDK_ROOT || '', 'platform-tools', 'adb.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
  path.join(process.env.HOME || '', 'Android', 'Sdk', 'platform-tools', 'adb'),
  path.join(process.env.HOME || '', 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
  'adb'
].filter(Boolean);

function acharAdb() {
  for (const caminho of CANDIDATOS_ADB) {
    if (caminho === 'adb') {
      const teste = spawnSync('adb', ['version'], { encoding: 'utf8', shell: true });
      if (teste.status === 0) return 'adb';
      continue;
    }
    if (fs.existsSync(caminho)) return caminho;
  }
  return null;
}

const adb = acharAdb();
if (!adb) {
  console.error('\nNão encontrei o adb. Ele vem no SDK do Android, em platform-tools/.');
  process.exit(1);
}

if (!fs.existsSync(APK)) {
  console.error(`\nNão achei o APK em ${path.relative(RAIZ, APK)}.`);
  console.error('Compile antes: npm run app:build');
  process.exit(1);
}

function rodar(args) {
  return spawnSync(adb, args, { encoding: 'utf8', shell: process.platform === 'win32' });
}

// ------------------------------------------------------ estado do aparelho

const lista = rodar(['devices']);
const linhas = (lista.stdout || '')
  .split('\n')
  .slice(1)
  .map((l) => l.trim())
  .filter(Boolean);

if (linhas.length === 0) {
  console.error('\nNenhum aparelho conectado.');
  console.error('Ligue o celular por USB e habilite a Depuração USB nas Opções do desenvolvedor.');
  process.exit(1);
}

const naoAutorizados = linhas.filter((l) => l.includes('unauthorized'));
const prontos = linhas.filter((l) => /\sdevice$/.test(l));

if (prontos.length === 0) {
  console.error('\nAparelho encontrado, mas não liberado:');
  for (const linha of linhas) console.error(`  ${linha}`);

  if (naoAutorizados.length > 0) {
    console.error('\nOlhe a tela do celular: deve haver um aviso');
    console.error('"Permitir depuração USB?". Toque em Permitir e rode de novo.');
  }
  process.exit(1);
}

const serial = prontos[0].split(/\s+/)[0];
const mb = (fs.statSync(APK).size / 1024 / 1024).toFixed(1);

console.log(`Aparelho: ${serial}`);
console.log(`APK:      ${path.relative(RAIZ, APK)} (${mb}MB)\n`);

// -r reinstala mantendo os dados; -t aceita build de teste/debug.
const instalacao = spawnSync(adb, ['-s', serial, 'install', '-r', '-t', APK], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (instalacao.status !== 0) {
  console.error('\nA instalação falhou. Motivos comuns:');
  console.error('  - o celular bloqueia instalação por USB (Opções do desenvolvedor > Instalar por USB)');
  console.error('  - já existe uma versão assinada com outra chave: desinstale antes');
  console.error(`    ${adb} uninstall br.com.vilmafotografia.painel`);
  process.exit(instalacao.status || 1);
}

console.log('\nInstalado. Procure "Painel Vilma" na lista de aplicativos.');
