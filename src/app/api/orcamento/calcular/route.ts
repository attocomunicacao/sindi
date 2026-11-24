import { resumoDoOrcamento } from '@/lib/orcamento/resumo';
import { calcularOuErro, lerRequisicao } from '@/lib/orcamento/requisicao';
import { jsonSemCache } from '@/lib/http/guarda';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const lida = await lerRequisicao(request, { nome: 'orcamento-calcular', limitePorMinuto: 60 });
  if ('resposta' in lida) return lida.resposta;
  const calculo = calcularOuErro(lida.corpo);
  if ('resposta' in calculo) return calculo.resposta;
  const r = calculo.resultado;
  if (!r.postos.length) return Response.json({ error: 'Nenhum posto válido.' }, { status: 400 });
  return jsonSemCache(resumoDoOrcamento(r));
}
