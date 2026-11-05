import { allowedChatOrigin } from '@/lib/origin';
import { estadoAtualizacao, hostLocal, iniciarAtualizacao } from '@/lib/atualizacao';
export const runtime = 'nodejs';
const cabecalhos = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const permitido = hostLocal(request.headers.get('host')) && !process.env.VERCEL;
  return Response.json({ permitido, ...(permitido ? estadoAtualizacao() : {}) }, { headers: cabecalhos });
}

export async function POST(request: Request) {
  const host = request.headers.get('host') || new URL(request.url).host;
  if (process.env.VERCEL || !hostLocal(host)) return Response.json({ error: 'Disponível apenas no computador que hospeda a SINDI.' }, { status: 403, headers: cabecalhos });
  if (!allowedChatOrigin(request.headers.get('origin'), host)) return Response.json({ error: 'Origem não permitida.' }, { status: 403, headers: cabecalhos });
  const corpo = await request.json().catch(() => ({})) as { completa?: unknown };
  const r = iniciarAtualizacao(corpo.completa === true);
  return Response.json({ ...r, ...estadoAtualizacao() }, { status: r.ok ? 202 : 409, headers: cabecalhos });
}
