import { erroJson, guardaDeEscrita } from '@/lib/http/guarda';
import { orcamentoSchema, type OrcamentoRequisicao } from '@/lib/orcamento/esquema';

const LIMITE_BYTES = 64 * 1024;
export const erro = erroJson;

/** Proteções comuns das rotas (origem, tipo, limite por minuto, tamanho do corpo) e a validação do orçamento. Nada é registrado nem gravado. */
export async function lerRequisicao(request: Request, rota: { nome: string; limitePorMinuto: number }): Promise<{ corpo: OrcamentoRequisicao } | { resposta: Response }> {
  const lida = await guardaDeEscrita(request, { ...rota, limiteBytes: LIMITE_BYTES });
  if ('resposta' in lida) return lida;
  const resultado = orcamentoSchema.safeParse(lida.json);
  if (!resultado.success) return { resposta: erro('Revise os dados do orçamento: ' + (resultado.error.issues[0]?.message ?? 'valor inválido') + '.', 400) };
  return { corpo: resultado.data };
}
