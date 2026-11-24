import { erroJson, guardaDeLeitura } from '@/lib/http/guarda';
import { grafoEmMemoria } from '@/lib/grafo/consulta';
import { grafoSoDoCerebro } from '@/lib/grafo/construir';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** O grafo do cérebro para a página /cerebro: só títulos, tipos, datas, posições e ligações (nenhum conteúdo integral). */
export function GET(request: Request) {
  const limite = guardaDeLeitura(request, 'cerebro-grafo', 30);
  if (limite) return limite;
  // Sem o grafo gerado (instalação nova, antes da primeira coleta): o do cérebro sozinho, montado na hora (especialistas, estantes e conhecimento).
  try { return Response.json(grafoEmMemoria() ?? grafoSoDoCerebro(), { headers: { 'Cache-Control': 'private, max-age=60' } }); }
  catch { return erroJson('O grafo do cérebro está indisponível no momento.', 503); }
}
