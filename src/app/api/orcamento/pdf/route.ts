import { calcularOrcamento } from '@/lib/orcamento/calculo';
import { gerarOrcamentoPdf, gerarRelatorioCustoPdf } from '@/lib/orcamento/pdf';
import { erro, lerRequisicao } from '@/lib/orcamento/requisicao';

export const runtime = 'nodejs';

const ARQUIVOS = { orcamento: 'orcamento-terceirizacao.pdf', custo: 'relatorio-de-custo.pdf' } as const;

/** `?tipo=orcamento` (para o contratante) ou `?tipo=custo` (composição detalhada). O PDF é gerado na hora e não é guardado. */
export async function POST(request: Request) {
  const tipo = new URL(request.url).searchParams.get('tipo');
  if (tipo !== 'orcamento' && tipo !== 'custo') return erro('Tipo de documento inválido.', 400);
  const lida = await lerRequisicao(request);
  if ('resposta' in lida) return lida.resposta;
  const { cliente, ...entrada } = lida.corpo;
  const resultado = calcularOrcamento(entrada);
  if (!resultado.postos.length) return erro('Nenhum posto válido.', 400);
  const bytes = tipo === 'orcamento' ? await gerarOrcamentoPdf(entrada, resultado, cliente) : await gerarRelatorioCustoPdf(entrada, resultado, cliente);
  return new Response(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${ARQUIVOS[tipo]}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
