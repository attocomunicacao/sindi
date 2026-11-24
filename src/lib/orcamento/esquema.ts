import { z } from 'zod';
import { CATEGORIAS_INSUMO, funcaoPorId } from '@/lib/orcamento/catalogo';
import { ISS_PERMITIDO } from '@/lib/orcamento/calculo';
import { tributacaoSchema } from '@/lib/tributos/esquema';

// Texto livre do solicitante: sem caracteres de controle e com tamanho limitado (vai para o PDF, nunca é gravado).
const texto = (max: number) => z.string().trim().max(max).transform(v => v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).optional();

export const postoSchema = z.object({
  funcaoId: z.string().max(60), quantidade: z.number().int().min(1).max(500), turno: z.enum(['diurno', 'noturno']),
  periculosidade: z.boolean().optional(), insalubridade: z.union([z.literal(0), z.literal(0.1), z.literal(0.2), z.literal(0.4)]).optional(),
  horasNoturnas: z.number().min(0).max(220).optional(),
  horasExtras: z.object({ h50: z.number().min(0).max(100).optional(), h100: z.number().min(0).max(100).optional(), h150: z.number().min(0).max(100).optional() }).optional(),
}).superRefine((posto, ctx) => {
  const he = posto.horasExtras;
  if (he && (he.h50 ?? 0) + (he.h100 ?? 0) + (he.h150 ?? 0) > 100) ctx.addIssue({ code: 'custom', message: 'Horas extras somadas acima de 100 por mês', path: ['horasExtras'] });
  const funcao = funcaoPorId(posto.funcaoId);
  if (!funcao) ctx.addIssue({ code: 'custom', message: 'Função desconhecida', path: ['funcaoId'] });
  else if (posto.turno === 'noturno' && !funcao.permiteNoturno) ctx.addIssue({ code: 'custom', message: 'Função sem turno noturno na tabela', path: ['turno'] });
});
export const clienteSchema = z.object({ empresa: texto(120), contato: texto(120), local: texto(160), observacoes: texto(500) });

export const orcamentoSchema = z.object({
  postos: z.array(postoSchema).min(1).max(30).superRefine((postos, ctx) => {
    // Dois postos idênticos são quase sempre um engano (some as quantidades): a mesma função só se repete se algo mudar (turno, adicional, horas).
    const vistos = new Set<string>();
    postos.forEach((p, i) => { const chave = JSON.stringify([p.funcaoId, p.turno, p.periculosidade ?? null, p.insalubridade ?? null, p.horasNoturnas ?? null, p.horasExtras?.h50 ?? 0, p.horasExtras?.h100 ?? 0, p.horasExtras?.h150 ?? 0]); if (vistos.has(chave)) ctx.addIssue({ code: 'custom', message: 'Posto repetido: some as quantidades', path: [i] }); vistos.add(chave); });
  }),
  iss: z.number().refine(v => ISS_PERMITIDO.some(p => Math.abs(p - v) < 1e-9), 'ISS fora da faixa de 2% a 5%').optional(),
  metrosQuadrados: z.number().min(1).max(10_000_000).optional(),
  insumos: z.array(z.object({ categoria: z.enum(CATEGORIAS_INSUMO.map(c => c.id) as [string, ...string[]]), id: z.string().max(100), quantidade: z.number().min(0).max(100_000) })).max(80).optional(),
  /** Regime tributário (regras atuais, Reforma Tributária ou Simples Nacional); ausente = regras atuais. */
  tributacao: tributacaoSchema.optional(),
  cliente: clienteSchema.optional(),
});
export type OrcamentoRequisicao = z.infer<typeof orcamentoSchema>;
