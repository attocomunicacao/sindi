import { allowedChatOrigin } from '@/lib/origin';
import { orcamentoSchema, type OrcamentoRequisicao } from './schema';

const LIMITE_BYTES = 64 * 1024;
export const erro = (mensagem: string, status: number) => Response.json({ error: mensagem }, { status, headers: { 'Cache-Control': 'no-store' } });

/** Mesmas proteções do chat: origem, tipo de conteúdo, tamanho máximo e validação do corpo. Nada é registrado nem gravado. */
export async function lerRequisicao(request: Request): Promise<{ corpo: OrcamentoRequisicao } | { resposta: Response }> {
  const host = request.headers.get('host') || new URL(request.url).host;
  if (!allowedChatOrigin(request.headers.get('origin'), host, process.env.SINDI_PUBLIC_ORIGIN, Boolean(process.env.VERCEL))) return { resposta: erro('Origem não permitida.', 403) };
  if (!request.headers.get('content-type')?.includes('application/json')) return { resposta: erro('Formato inválido.', 415) };
  let json: unknown;
  try {
    const leitor = request.body?.getReader(); if (!leitor) return { resposta: erro('Requisição inválida.', 400) };
    let tamanho = 0; const partes: Uint8Array[] = [];
    while (true) {
      const { value, done } = await leitor.read(); if (done) break;
      tamanho += value.length; if (tamanho > LIMITE_BYTES) { await leitor.cancel(); return { resposta: erro('Requisição grande demais.', 413) }; }
      partes.push(value);
    }
    json = JSON.parse(Buffer.concat(partes).toString('utf8'));
  } catch { return { resposta: erro('Requisição inválida.', 400) }; }
  const resultado = orcamentoSchema.safeParse(json);
  if (!resultado.success) return { resposta: erro('Revise os dados do orçamento: ' + (resultado.error.issues[0]?.message ?? 'valor inválido') + '.', 400) };
  return { corpo: resultado.data };
}
