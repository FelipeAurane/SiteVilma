'use strict';

const { query } = require('../lib/db');
const { getSession } = require('../lib/auth');
const {
  json,
  fail,
  methodGuard,
  sameOriginGuard,
  handleCors,
  withErrorHandling
} = require('../lib/http');

const LIMITE_FOTOS = 500;

/**
 * POST /api/selecao — a visitante finaliza a seleção da galeria.
 *
 * Aceita sessão de cliente ou de admin: quem escolhe as fotos é a visitante, não
 * a administradora, e exigir admin aqui deixaria a galeria inutilizável.
 * Grava uma linha por finalização para a Vilma ler depois.
 */
module.exports = withErrorHandling(async (req, res) => {
  if (!handleCors(req, res)) return;
  if (!methodGuard(req, res, ['POST', 'OPTIONS'])) return;
  if (!sameOriginGuard(req, res)) return;

  const session = getSession(req);
  if (!session) return fail(res, 401, 'Não autenticado');

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const fotos = Array.isArray(body.fotos) ? body.fotos : null;

  if (!fotos) return fail(res, 400, 'Seleção inválida');
  if (fotos.length > LIMITE_FOTOS) {
    return fail(res, 400, 'Seleção grande demais para este ensaio');
  }

  const ids = fotos.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim());
  if (ids.length !== fotos.length) return fail(res, 400, 'Seleção inválida');

  const cliente = String(body.cliente || session.email || session.sub || 'visitante').slice(0, 200);
  const email = body.email ? String(body.email).slice(0, 320) : null;

  const resultado = await query(
    `INSERT INTO selecoes (cliente, cliente_email, fotos, total)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id, created_at`,
    [cliente, email, JSON.stringify(ids), ids.length]
  );

  const linha = resultado.rows[0] || {};
  json(res, 201, {
    enviada: true,
    id: linha.id ?? null,
    total: ids.length,
    createdAt: linha.created_at || null
  });
});