import { getUsage } from '@/lib/usage';
import { erroJson, guardaDeLeitura } from '@/lib/http/guarda';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const limite = guardaDeLeitura(request, 'usage', 120); if (limite) return limite;
  try { return Response.json(await getUsage(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return erroJson('As métricas estão temporariamente indisponíveis.', 503); }
}
