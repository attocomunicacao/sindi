import { z } from 'zod';
import { erroJson, guardaDeEscrita, jsonSemCache } from '@/lib/http/guarda';
import { calcularNoServicoSimples, calcularNoSindi, enderecoDoServicoSimples } from '@/lib/rtc/simples-nacional';

export const runtime = 'nodejs';

const par = z.object({ cbs: z.number().min(0).max(100), ibs: z.number().min(0).max(100) }).strict();
const schema = z
  .object({
    // Reais com até 2 casas, como a calculadora oficial exige (formato 13v2).
    receita: z
      .number()
      .min(0.01)
      .max(1e11)
      .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Use no máximo 2 casas decimais.'),
    // Os anexos I e II são de comércio e indústria (documentos de mercadoria); a conferência cobre os de serviço, que é o que a NFS-e usa.
    anexo: z.enum(['III', 'IV', 'V']),
    comRedistribuicao: par,
    semRedistribuicao: par,
    retido: z.boolean(),
    semIss: z.boolean(),
    isencao: z.boolean(),
  })
  .strict();

/**
 * Confere o CBS/IBS do Simples Nacional com a calculadora oficial da Receita (serviço local, ver src/lib/rtc/simples-nacional.ts). Sempre devolve a conta do SINDI;
 * com o serviço no ar, devolve também a dele e se os valores são idênticos. Serviço fora do ar não é erro: a resposta diz `oficial: null` e o motivo.
 */
export async function POST(request: Request) {
  const lida = await guardaDeEscrita(request, { nome: 'rtc-simples-nacional', limitePorMinuto: 30, limiteBytes: 4096 });
  if ('resposta' in lida) return lida.resposta;
  const corpo = schema.safeParse(lida.json);
  if (!corpo.success)
    return erroJson('Informe receita em reais (até 2 casas), anexo III, IV ou V e os dois pares de alíquotas.', 400);
  const entrada = corpo.data;
  const local = calcularNoSindi(entrada);
  if (!enderecoDoServicoSimples())
    return jsonSemCache({ local, oficial: null, motivo: 'A calculadora oficial não está ligada neste servidor.' });
  if (entrada.isencao && entrada.anexo === 'V')
    return jsonSemCache({
      local,
      oficial: null,
      motivo:
        'A calculadora oficial só reconhece a isenção municipal do ISS nos Anexos III e IV; no Anexo V não há conferência.',
    });
  try {
    const oficial = await calcularNoServicoSimples(entrada);
    const iguais = oficial.vCBS === local.vCBS && oficial.vIBS === local.vIBS;
    return jsonSemCache({ local, oficial, iguais, motivo: null });
  } catch {
    return jsonSemCache({
      local,
      oficial: null,
      motivo: 'A calculadora oficial da Receita não respondeu agora.',
    });
  }
}
