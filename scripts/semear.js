#!/usr/bin/env node
'use strict';

/**
 * Semeia o banco com o conteúdo que já existia em src/cache/data.json.
 *
 *   node scripts/semear.js            mostra o que seria gravado
 *   node scripts/semear.js --gravar   grava de verdade
 *
 * Precisa de DATABASE_URL (no .env local ou no ambiente). Roda uma vez;
 * depois disso o conteúdo passa a ser editado pelo painel.
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config();

const { query } = require('../lib/db');

const RAIZ = path.join(__dirname, '..');
const ORIGEM = path.join(RAIZ, 'src', 'cache', 'data.json');
const PASTA_IMAGENS = path.join(RAIZ, 'src');

const gravar = process.argv.includes('--gravar');

/**
 * Descarta caminho de imagem que não existe no disco — o data.json antigo
 * aponta para fotos que nunca foram para o repositório, e imagem quebrada
 * no site é pior que imagem nenhuma.
 */
function imagemExiste(relativa) {
  if (typeof relativa !== 'string' || relativa === '') return false;
  const limpa = relativa.replace(/^\.?\//, '');
  return fs.existsSync(path.join(PASTA_IMAGENS, limpa));
}

function manterImagem(relativa, alternativa = '') {
  return imagemExiste(relativa) ? relativa : alternativa;
}

function montarConteudo(bruto) {
  const whatsapp = bruto.contact?.whatsapp || bruto.hero?.button?.whatsapp || '';
  const capa = manterImagem('./img/capa.jpg') || './img/capa.jpg';

  return {
    hero: {
      image: manterImagem(bruto.hero?.image, capa),
      title: bruto.hero?.title || 'Vilma Silva',
      subtitle: bruto.hero?.subtitle || '',
      button: {
        text: bruto.hero?.button?.text || 'Orçamentos',
        whatsapp,
        message: bruto.hero?.button?.message || 'Olá, gostaria de solicitar um orçamento.'
      }
    },

    banner: {
      image: capa,
      title: 'Meu Portfólio',
      subtitle: 'Em forma de menu',
      titleScreen: 'Serviços'
    },

    categories: (bruto.categories || []).map((categoria) => ({
      name: categoria.name,
      subtitle: categoria.subtitle || categoria.description || '',
      image: manterImagem(categoria.image, './img/img1.jpg'),
      gallery: (categoria.gallery || []).filter(imagemExiste)
    })),

    services: (bruto.services || []).map((servico) => ({
      id: servico.id,
      name: servico.name,
      description: servico.description || '',
      price: servico.price || '',
      duration: servico.duration || '',
      image: manterImagem(servico.image, ''),
      whatsapp,
      whatsappMessage: `Olá, gostaria de saber mais sobre: ${servico.name}.`
    })),

    lastUpdated: Date.now(),
    version: 1
  };
}

(async () => {
  if (!fs.existsSync(ORIGEM)) {
    console.error(`Não encontrei ${ORIGEM}. Nada a semear.`);
    process.exit(1);
  }

  const bruto = JSON.parse(fs.readFileSync(ORIGEM, 'utf8'));
  const conteudo = montarConteudo(bruto);

  const semImagem = conteudo.categories.filter((c) => c.gallery.length === 0).map((c) => c.name);

  console.log(`Categorias : ${conteudo.categories.length}`);
  console.log(`Serviços   : ${conteudo.services.length}`);
  console.log(`Tamanho    : ${Buffer.byteLength(JSON.stringify(conteudo))} bytes`);
  if (semImagem.length > 0) {
    console.log(`\nSem foto no disco (dá para subir pelo painel depois): ${semImagem.join(', ')}`);
  }

  if (!gravar) {
    console.log('\nNada foi gravado. Rode com --gravar para aplicar.');
    process.exit(0);
  }

  const { rows } = await query(
    `INSERT INTO content (key, value, version, updated_at)
          VALUES ('siteData', $1::jsonb, 1, now())
     ON CONFLICT (key) DO UPDATE
            SET value      = EXCLUDED.value,
                version    = content.version + 1,
                updated_at = now()
      RETURNING version`,
    [JSON.stringify(conteudo)]
  );

  console.log(`\nGravado. siteData está na versão ${rows[0].version}.`);
  process.exit(0);
})().catch((err) => {
  console.error('\nFalhou:', err.message);
  process.exit(1);
});
