import { z } from 'zod';
import { CATEGORIAS_INSUMO, funcaoPorId } from './catalogo';
import { ISS_PERMITIDO } from './calculo';

// Texto livre do solicitante: sem caracteres de controle e com tamanho limitado (vai para o PDF, nunca é gravado).
const texto = (max: number) => z.string().trim().max(max).transform(v => v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).optional();

export const postoSchema = z.object({
  funcaoId: z.string().max(60), quantidade: z.number().int().min(1).max(500), turno: z.enum(['diurno', 'noturno']),
  periculosidade: z.boolean().optional(), insalubridade: z.union([z.literal(0), z.literal(0.1), z.literal(0.2), z.literal(0.4)]).optional(),
  horasNoturnas: z.number().min(0).max(220).optional(),
  horasExtras: z.object({ h50: z.number().min(0).max(100).optional(), h100: z.number().min(0).max(100).optional(), h150: z.number().min(0).max(100).optional() }).optional(),
}).superRefine((posto, ctx) => {
  const funcao = funcaoPorId(posto.funcaoId);
  if (!funcao) ctx.addIssue({ code: 'custom', message: 'Função desconhecida', path: ['funcaoId'] });
  else if (posto.turno === 'noturno' && !funcao.permiteNoturno) ctx.addIssue({ code: 'custom', message: 'Função sem turno noturno na tabela', path: ['turno'] });
});
export const clienteSchema = z.object({ empresa: texto(120), contato: texto(120), local: texto(160), observacoes: texto(500) });

export const orcamentoSchema = z.object({
  postos: z.array(postoSchema).min(1).max(30),
  iss: z.number().refine(v => ISS_PERMITIDO.some(p => Math.abs(p - v) < 1e-9), 'ISS fora da faixa de 2% a 5%').optional(),
  metrosQuadrados: z.number().min(1).max(10_000_000).optional(),
  insumos: z.array(z.object({ categoria: z.enum(CATEGORIAS_INSUMO.map(c => c.id) as [string, ...string[]]), id: z.string().max(100), quantidade: z.number().min(0).max(100_000) })).max(80).optional(),
  cliente: clienteSchema.optional(),
});
export type OrcamentoRequisicao = z.infer<typeof orcamentoSchema>;
