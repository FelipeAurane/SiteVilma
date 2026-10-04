#!/usr/bin/env node
'use strict';

/**
 * Minifica o que o site realmente carrega.
 *
 * A versão anterior minificava uma lista solta de arquivos — styles.css,
 * main_config.css, style_desktop.css — que nenhuma página do site referenciava,
 * e gerava .min que ninguém usava. O resultado: um build que roda, passa no
 * CI e não muda nada do que o visitante recebe.
 *
 * Aqui a lista vem do que os HTML pedem. Se um arquivo deixar de ser
 * referenciado, ele sai do build sozinho; se um HTML pedir algo que não
 * existe, o build falha em vez de publicar uma página sem estilo.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Lê as referências de CSS e JS dos HTML do site. `verificar.js` usa isto
 * para falhar antes do push quando um caminho aponta para arquivo que não
 * existe — o build já faz essa conferência, mas ele só roda no CI.
 */
function referenciasDoSite() {
  const { css, js, faltando } = referencias(listarHtml());
  return { css, js, faltando };
}

/**
 * Pacote instalado e nome do executável que ele expõe. O pacote do clean-css
 * se chama clean-css-cli, mas o comando é cleancss.
 */
const MINIFICADORES = {
  cleancss: 'clean-css-cli',
  terser: 'terser'
};

/**
 * Roda um minificador pelo entry point do pacote, não pelo .bin do npm.
 *
 * No Windows o .cmd é um script de shell, e o Node moderno recusa executá-lo
 * direto (EINVAL em spawnSync). O caminho do pacote resolve para o .js real,
 * que o Node entende em qualquer sistema.
 */
function binarioDoPacote(comando) {
  const pacote = MINIFICADORES[comando];
  if (!pacote) throw new Error(`Minificador desconhecido: ${comando}`);

  const manifesto = require.resolve(`${pacote}/package.json`);
  const raizDoPacote = path.dirname(manifesto);
  const pacoteJson = JSON.parse(fs.readFileSync(manifesto, 'utf8'));
  const entrada = pacoteJson.bin?.[comando];

  if (!entrada) throw new Error(`${pacote} não expõe o executável ${comando}.`);

  return path.join(raizDoPacote, entrada);
}

const raiz = path.join(__dirname, '..');

const binarios = {};

function rodar(comando, argumentos) {
  if (!binarios[comando]) binarios[comando] = binarioDoPacote(comando);
  execFileSync(process.execPath, [binarios[comando], ...argumentos], { stdio: 'pipe' });
}

/** Todo HTML versionado: as páginas do site e o painel. */
function listarHtml() {
  const arquivos = [path.join(raiz, 'src', 'index.html'), path.join(raiz, 'src', 'config.html')];

  const paginas = path.join(raiz, 'src', 'pages');
  if (fs.existsSync(paginas)) {
    for (const entrada of fs.readdirSync(paginas)) {
      if (entrada.endsWith('.html')) arquivos.push(path.join(paginas, entrada));
    }
  }

  return arquivos.filter((arquivo) => fs.existsSync(arquivo));
}

/** Referências a /css e /js que aparecem nos HTML, resolvidas a caminho de disco. */
function referencias(htmls) {
  const css = new Set();
  const js = new Set();
  const faltando = [];

  for (const html of htmls) {
    const texto = fs.readFileSync(html, 'utf8');

    for (const [, href] of texto.matchAll(/<link[^>]+href="([^"]+\.css)"/g)) {
      const alvo = resolver(html, href);
      if (!alvo) faltando.push(`${relativo(html)} -> ${href}`);
      else css.add(alvo);
    }

    for (const [, src] of texto.matchAll(/<script[^>]+src="([^"]+\.js)"/g)) {
      const alvo = resolver(html, src);
      if (!alvo) faltando.push(`${relativo(html)} -> ${src}`);
      else js.add(alvo);
    }
  }

  return { css: [...css], js: [...js], faltando };
}

function resolver(html, href) {
  const url = href.split('?')[0];
  const base = path.resolve(path.dirname(html), url.startsWith('/') ? `.${url}` : url);

  if (!fs.existsSync(base)) return null;
  return base;
}

const relativo = (arquivo) => path.relative(raiz, arquivo).split(path.sep).join('/');

function limparMin() {
  for (const pasta of ['src/css', 'src/js']) {
    const dir = path.join(raiz, pasta);
    if (!fs.existsSync(dir)) continue;
    for (const entrada of fs.readdirSync(dir)) {
      if (entrada.endsWith('.min.css') || entrada.endsWith('.min.js')) {
        fs.unlinkSync(path.join(dir, entrada));
      }
    }
  }
}

function tamanhoDe(arquivo) {
  return fs.statSync(arquivo).size;
}

function principal() {
  const { css, js, faltando } = referenciasDoSite();

  if (faltando.length) {
    console.error('Arquivos referenciados que não existem:');
    for (const item of faltando) console.error(`  ${item}`);
    console.error('\nO build para aqui: publicar assim seria servir página sem estilo.');
    process.exit(1);
  }

  console.log(`Build: ${listarHtml().length} páginas, ${css.length} CSS, ${js.length} JS\n`);

  // Começa limpo para não deixar .min de um arquivo que saiu do site.
  limparMin();

  let antes = 0;
  let depois = 0;

  for (const arquivo of css) {
    const saida = arquivo.replace(/\.css$/, '.min.css');
    rodar('cleancss', ['-o', saida, arquivo]);
    antes += tamanhoDe(arquivo);
    depois += tamanhoDe(saida);
    console.log(`  css  ${relativo(arquivo)}  ${formatar(tamanhoDe(arquivo))} -> ${formatar(tamanhoDe(saida))}`);
  }

  for (const arquivo of js) {
    const saida = arquivo.replace(/\.js$/, '.min.js');
    // --module porque todos os arquivos do site usam import/export: sem isso o
    // terser ou quebra a sintaxe ou mexe errado em identificadores.
    rodar('terser', [arquivo, '-o', saida, '-c', '-m', '--module']);
    antes += tamanhoDe(arquivo);
    depois += tamanhoDe(saida);
    console.log(`  js   ${relativo(arquivo)}  ${formatar(tamanhoDe(arquivo))} -> ${formatar(tamanhoDe(saida))}`);
  }

  const ganho = antes ? Math.round((1 - depois / antes) * 100) : 0;
  console.log(`\nTotal: ${formatar(antes)} -> ${formatar(depois)} (${ganho}% menor)`);
  console.log('Os .min não estão no git: use --producao para gerar antes de publicar.');
}

function formatar(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

// `verificar.js` importa só a conferência de referências. Rodar o build de
// novo nesse caso gastaria tempo sem propósito.
if (require.main === module) principal();

module.exports = { referenciasDoSite };