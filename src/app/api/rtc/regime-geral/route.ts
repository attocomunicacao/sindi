import { z } from 'zod';
import { erroJson, guardaDeEscrita, jsonSemCache } from '@/lib/http/guarda';
import { calcularNoServicoOficial, enderecoDoServicoRtc } from '@/lib/rtc/regime-geral';
import { calcularCbsIbsServico } from '@/lib/tributos/regime-regular';
import { aliquotasSchema, anoSchema } from '@/lib/tributos/esquema';
import { SERVICOS } from '@/lib/tributos/servicos';

export const runtime = 'nodejs';

const schema = z
  .object({
    ano: anoSchema,
    // Reais com até 2 casas, como a calculadora oficial exige (acima disso ela recusa com VAL-010).
    base: z
      .number()
      .min(0.01)
      .max(1e12)
      .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Use no máximo 2 casas decimais.'),
    servicoId: z.enum(SERVICOS.map((s) => s.id) as [string, ...string[]]),
    aliquotas: aliquotasSchema.optional(),
  })
  .strict();

/**
 * Confere um cálculo de CBS/IBS com a calculadora oficial da Receita Federal (serviço local, ver src/lib/rtc). Sempre devolve a conta do SINDI; se o serviço oficial
 * está no ar, devolve também a dele e se os valores são idênticos. Serviço fora do ar não é erro: a resposta diz `oficial: null` e o motivo.
 */
export async function POST(request: Request) {
  const lida = await guardaDeEscrita(request, { nome: 'rtc-regime-geral', limitePorMinuto: 30, limiteBytes: 4096 });
  if ('resposta' in lida) return lida.resposta;
  const corpo = schema.safeParse(lida.json);
  if (!corpo.success) return erroJson('Informe ano (2026 a 2033), base em reais (até 2 casas) e serviço.', 400);
  const { ano, base, servicoId, aliquotas } = corpo.data;
  const local = calcularCbsIbsServico({ base, ano, servicoId, aliquotas });
  const doSindi = { vCBS: local.vCBS, vIBSUF: local.vIBSUF, vIBSMun: local.vIBSMun, vIBS: local.vIBS };
  if (!enderecoDoServicoRtc())
    return jsonSemCache({
      local: doSindi,
      oficial: null,
      motivo: 'A calculadora oficial não está ligada neste servidor.',
    });
  try {
    const oficial = await calcularNoServicoOficial({ ano, base, servicoId, aliquotas });
    const iguais =
      oficial.vCBS === doSindi.vCBS &&
      oficial.vIBSUF === doSindi.vIBSUF &&
      oficial.vIBSMun === doSindi.vIBSMun &&
      oficial.vIBS === doSindi.vIBS;
    return jsonSemCache({ local: doSindi, oficial, iguais, motivo: null });
  } catch {
    return jsonSemCache({
      local: doSindi,
      oficial: null,
      motivo: 'A calculadora oficial da Receita não respondeu agora.',
    });
  }
}
