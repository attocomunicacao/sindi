import { statusDoConhecimento } from '@/lib/recuperacao/legado/status';
import { guardaDeLeitura } from '@/lib/http/guarda';

export const runtime = 'nodejs';
// Público: só se a coleta existe e em que fase está. Contagens, falhas e configuração da nuvem ficam na página /base, que roda no servidor.
export async function GET(request: Request) {
  const limite = guardaDeLeitura(request, 'conhecimento', 120); if (limite) return limite;
  const { available, phase } = await statusDoConhecimento() as { available: boolean; phase?: string };
  return Response.json({ available, phase: phase ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}
