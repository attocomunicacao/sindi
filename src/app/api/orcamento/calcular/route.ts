import { calcularOrcamento } from '@/lib/orcamento/calculo';
import { resumoDoOrcamento } from '@/lib/orcamento/resumo';
import { lerRequisicao } from '@/lib/orcamento/requisicao';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const lida = await lerRequisicao(request);
  if ('resposta' in lida) return lida.resposta;
  const r = calcularOrcamento(lida.corpo);
  if (!r.postos.length) return Response.json({ error: 'Nenhum posto válido.' }, { status: 400 });
  return Response.json(resumoDoOrcamento(r), { headers: { 'Cache-Control': 'no-store' } });
}
