import { erroJson, guardaDeEscrita } from '@/lib/http/guarda';
import { calcularOrcamento } from '@/lib/orcamento/calculo';
import { ErroTributario } from '@/lib/tributos/decimal';
import { orcamentoSchema, type OrcamentoRequisicao } from '@/lib/orcamento/esquema';

const LIMITE_BYTES = 64 * 1024;
export const erro = erroJson;

/** Calcula o orçamento; um valor que a regra tributária recusa vira resposta 400 com a mensagem dela, e qualquer outra falha segue como erro. */
export function calcularOuErro(
  entrada: Parameters<typeof calcularOrcamento>[0],
): { resultado: ReturnType<typeof calcularOrcamento> } | { resposta: Response } {
  try {
    return { resultado: calcularOrcamento(entrada) };
  } catch (causa) {
    // RangeError é a recusa da conta (taxas informadas somando 100% ou mais); a mensagem é fixa e segura.
    if (causa instanceof ErroTributario || causa instanceof RangeError) return { resposta: erro(causa.message, 400) };
    throw causa;
  }
}

/** Proteções comuns das rotas (origem, tipo, limite por minuto, tamanho do corpo) e a validação do orçamento. Nada é registrado nem gravado. */
export async function lerRequisicao(
  request: Request,
  rota: { nome: string; limitePorMinuto: number },
): Promise<{ corpo: OrcamentoRequisicao } | { resposta: Response }> {
  const lida = await guardaDeEscrita(request, { ...rota, limiteBytes: LIMITE_BYTES });
  if ('resposta' in lida) return lida;
  const resultado = orcamentoSchema.safeParse(lida.json);
  if (!resultado.success)
    return {
      resposta: erro(
        'Revise os dados do orçamento: ' + (resultado.error.issues[0]?.message ?? 'valor inválido') + '.',
        400,
      ),
    };
  return { corpo: resultado.data };
}
