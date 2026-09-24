'use strict';

/**
 * Leitura de variáveis de ambiente com erro explícito.
 * Nenhum segredo vive no repositório: tudo vem do painel da Vercel
 * (Settings > Environment Variables) ou de um .env local não versionado.
 */
function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variável de ambiente ausente: ${name}. ` +
      `Configure-a em Settings > Environment Variables no projeto da Vercel.`
    );
  }
  return value;
}

function optionalEnv(name, fallback = null) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

module.exports = { requiredEnv, optionalEnv };
