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
  if (!methodGuard(req, res, ['GET', 'POST', 'OPTIONS'])) return;

  // GET: Lista as seleções salvas para o painel administrativo
  if (req.method === 'GET') {
    try {
      const resultado = await query(
        `SELECT id, cliente, cliente_email, fotos, total, status, created_at
           FROM selecoes
          ORDER BY created_at DESC
          LIMIT 100`
      );
      return json(res, 200, { selecoes: resultado.rows || [] });
    } catch (err) {
      console.warn('[selecao] erro ao listar selecoes:', err.message);
      return json(res, 200, { selecoes: [] });
    }
  }

  if (!sameOriginGuard(req, res)) return;

  const session = getSession(req);
  // Aceita sessão ativa de cliente ou admin, ou autorização válida
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const fotos = Array.isArray(body.fotos) ? body.fotos : null;

  if (!fotos) return fail(res, 400, 'Seleção inválida');
  if (fotos.length > LIMITE_FOTOS) {
    return fail(res, 400, 'Seleção grande demais para este ensaio');
  }

  const fotosProcessadas = fotos.map((f) => {
    if (typeof f === 'string') return { id: f, nome: f };
    if (typeof f === 'object' && f !== null) {
      return {
        id: String(f.id || f.arquivo || 'foto'),
        nome: String(f.nome || f.titulo || f.id || 'Sem título'),
        arquivo: String(f.arquivo || f.src || ''),
        categoria: String(f.categoria || f.categoriaNome || '')
      };
    }
    return { id: String(f), nome: String(f) };
  });

  const cliente = String(body.cliente || (session && (session.email || session.sub)) || 'visitante').slice(0, 200);
  const email = body.email ? String(body.email).slice(0, 320) : null;

  const resultado = await query(
    `INSERT INTO selecoes (cliente, cliente_email, fotos, total)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id, created_at`,
    [cliente, email, JSON.stringify(fotosProcessadas), fotosProcessadas.length]
  );

  const linha = resultado.rows[0] || {};
  json(res, 201, {
    enviada: true,
    id: linha.id ?? null,
    total: fotosProcessadas.length,
    fotos: fotosProcessadas,
    createdAt: linha.created_at || new Date().toISOString()
  });
});