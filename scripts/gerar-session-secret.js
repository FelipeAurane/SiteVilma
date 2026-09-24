#!/usr/bin/env node
'use strict';

/**
 * Gera o valor de SESSION_SECRET (chave que assina o cookie de sessão).
 *
 *   node scripts/gerar-session-secret.js
 *
 * Trocar este valor invalida todas as sessões abertas — é como deslogar
 * de tudo, útil se você suspeitar que o segredo vazou.
 */

const crypto = require('crypto');

console.log('SESSION_SECRET=' + crypto.randomBytes(48).toString('base64url'));
