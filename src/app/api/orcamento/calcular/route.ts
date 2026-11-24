import { calcularOrcamento } from '@/lib/orcamento/calculo';
import { resumoDoOrcamento } from '@/lib/orcamento/resumo';
import { erro, lerRequisicao } from '@/lib/orcamento/requisicao';
import { ErroTributario } from '@/lib/tributos/decimal';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const lida = await lerRequisicao(request, { nome: 'orcamento-calcular', limitePorMinuto: 60 });
  if ('resposta' in lida) return lida.resposta;
  let r; try { r = calcularOrcamento(lida.corpo); } catch (causa) { if (causa instanceof ErroTributario) return erro(causa.message, 400); throw causa; }
  if (!r.postos.length) return Response.json({ error: 'Nenhum posto válido.' }, { status: 400 });
  return Response.json(resumoDoOrcamento(r), { headers: { 'Cache-Control': 'no-store' } });
}
