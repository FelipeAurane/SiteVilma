#!/usr/bin/env node
'use strict';

/**
 * Compila o APK do painel.
 *
 *   npm run app:build
 *
 * Cuida das variáveis que o Gradle precisa (JDK do Android Studio e caminho
 * do SDK), que não estão no ambiente desta máquina por padrão.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const ANDROID = path.join(RAIZ, 'android');

const CANDIDATOS_SDK = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
  path.join(process.env.HOME || '', 'Android', 'Sdk'),
  path.join(process.env.HOME || '', 'Library', 'Android', 'sdk')
].filter(Boolean);

const CANDIDATOS_JDK = [
  process.env.JAVA_HOME,
  'C:/Program Files/Android/Android Studio/jbr',
  '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  '/usr/lib/jvm/default-java'
].filter(Boolean);

function primeiroQueExiste(lista, dica) {
  const achado = lista.find((caminho) => caminho && fs.existsSync(caminho));
  if (!achado) {
    console.error(`\nNão encontrei ${dica}. Procurei em:`);
    for (const caminho of lista) console.error(`  ${caminho}`);
    process.exit(1);
  }
  return achado;
}

if (!fs.existsSync(ANDROID)) {
  console.error('\nA pasta android/ não existe. Rode antes: npx cap add android');
  process.exit(1);
}

const sdk = primeiroQueExiste(CANDIDATOS_SDK, 'o SDK do Android');
const jdk = primeiroQueExiste(CANDIDATOS_JDK, 'um JDK (o Android Studio traz um em jbr/)');

// O Gradle lê o caminho do SDK daqui; barra normal evita problema de escape.
fs.writeFileSync(
  path.join(ANDROID, 'local.properties'),
  `sdk.dir=${sdk.replace(/\\/g, '/')}\n`
);

console.log(`SDK  ${sdk}`);
console.log(`JDK  ${jdk}`);

const alvo = process.argv.includes('--release') ? 'assembleRelease' : 'assembleDebug';
console.log(`\nGradle: ${alvo}\n`);

// Caminho absoluto: com shell no Windows, um nome solto seria procurado no
// PATH e não na pasta do projeto, mesmo com cwd apontando para android/.
const gradlew = path.join(ANDROID, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');

const resultado = spawnSync(gradlew, [alvo, '--console=plain'], {
  cwd: ANDROID,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk }
});

if (resultado.status !== 0) {
  console.error('\nO build falhou. A saída do Gradle acima diz o motivo.');
  process.exit(resultado.status || 1);
}

const apk = path.join(
  ANDROID,
  'app', 'build', 'outputs', 'apk',
  alvo === 'assembleRelease' ? 'release' : 'debug',
  alvo === 'assembleRelease' ? 'app-release-unsigned.apk' : 'app-debug.apk'
);

if (fs.existsSync(apk)) {
  const mb = (fs.statSync(apk).size / 1024 / 1024).toFixed(1);
  console.log(`\nAPK pronto: ${path.relative(RAIZ, apk)}  (${mb}MB)`);
  console.log('Para instalar no celular ligado por USB: npm run app:instalar');
} else {
  console.log('\nBuild terminou, mas não achei o APK no caminho esperado.');
}
