'use strict';

/**
 * Leitura de variáveis de ambiente com fallbacks seguros para desenvolvimento.
 */
function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variável de ambiente ausente: ${name}. ` +
      `Configure-a no arquivo .env.`
    );
  }
  return value;
}

function optionalEnv(name, fallback = null) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

module.exports = { requiredEnv, optionalEnv };
