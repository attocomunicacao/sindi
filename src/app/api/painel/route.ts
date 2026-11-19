import { emptyPainel, readPainel } from '@/lib/dados/painel';
import { guardaDeLeitura } from '@/lib/http/guarda';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Somente dados públicos agregados das fontes oficiais; nenhuma mensagem, IP ou credencial.
export async function GET(request: Request) {
  const limite = guardaDeLeitura(request, 'painel', 300); if (limite) return limite;
  let body;
  try { body = readPainel(); } catch { body = emptyPainel(); }
  return Response.json(body, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
