import { z } from 'zod';

/** Esquemas de entrada dos tributos (servidor). O componente do navegador não importa este arquivo: zod fica fora do cliente. */
const pct = (max = 100) => z.number().min(0).max(max);
export const aliquotasSchema = z.object({ cbs: pct(), ibsUf: pct(), ibsMun: pct() });
export const anoSchema = z.number().int().min(2026).max(2033);
export const anexoSchema = z.enum(['III', 'IV', 'V']);

/** Tributação do orçamento: regras atuais (padrão), Reforma Tributária (CBS/IBS) ou Simples Nacional. */
export const tributacaoSchema = z.discriminatedUnion('modo', [
  z.object({ modo: z.literal('atual') }),
  z.object({ modo: z.literal('reforma'), ano: anoSchema, aliquotas: aliquotasSchema.optional() }),
  z.object({
    modo: z.literal('simples'),
    anexo: anexoSchema,
    rbt12: z.number().gt(0).max(4_800_000),
    folha12: z.number().min(0).max(1e12).optional(),
    ano: anoSchema.optional(),
    pCBSSN: pct().optional(),
    pIBSSN: pct().optional(),
  }),
]);
