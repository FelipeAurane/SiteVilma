'use strict';

/**
 * Leitura de variáveis de ambiente com fallbacks seguros para desenvolvimento.
 */
function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    if (name === 'SESSION_SECRET') {
      return 'vilma-fotografia-dev-session-secret-key-32chars!';
    }
    if (name === 'DATABASE_URL') {
      return 'postgresql://mock:mock@localhost:5432/mock';
    }
    if (name === 'ADMIN_PASSWORD_HASH') {
      return 'scrypt$16384$8$1$YWRtaW4=$YWRtaW4=';
    }
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
