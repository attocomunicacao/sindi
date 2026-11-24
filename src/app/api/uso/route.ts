import { obterUso } from '@/lib/infra/uso';
import { erroJson, guardaDeLeitura, jsonSemCache } from '@/lib/http/guarda';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const limite = guardaDeLeitura(request, 'uso', 120); if (limite) return limite;
  try { return jsonSemCache(await obterUso()); }
  catch { return erroJson('As métricas estão temporariamente indisponíveis.', 503); }
}
