import { estadoAtualizacao, iniciarAtualizacao, pedidoLocal } from '@/lib/atualizacao';
import { erroJson, guardaDeEscrita } from '@/lib/http/guarda';

export const runtime = 'nodejs';
const cabecalhos = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const permitido = pedidoLocal(request);
  return Response.json({ permitido, ...(permitido ? estadoAtualizacao() : {}) }, { headers: cabecalhos });
}

export async function POST(request: Request) {
  if (!pedidoLocal(request)) return erroJson('Disponível apenas no computador que hospeda a SINDI.', 403);
  const guarda = await guardaDeEscrita(request, { nome: 'atualizar', limitePorMinuto: 6, limiteBytes: 1024, corpo: 'opcional' });
  if ('resposta' in guarda) return guarda.resposta;
  const corpo = (guarda.json ?? {}) as { completa?: unknown };
  const r = iniciarAtualizacao(corpo.completa === true);
  return Response.json({ ...r, ...estadoAtualizacao() }, { status: r.ok ? 202 : 409, headers: cabecalhos });
}
