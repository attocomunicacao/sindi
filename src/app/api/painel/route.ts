import { emptyPainel, readPainel } from '@/lib/dados/painel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Somente dados públicos agregados das fontes oficiais; nenhuma mensagem, IP ou credencial.
export async function GET() {
  let body;
  try { body = readPainel(); } catch { body = emptyPainel(); }
  return Response.json(body, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
