import type { Insumo, Posto } from '@/componentes/orcamento/posto';

/** O que a conta e o PDF recebem (sem tributação nem dados do cliente): só postos com quantidade, o ISS, a área e os insumos escolhidos. */
export function corpoDoOrcamento(postos: Posto[], insumos: Insumo[], metros: string, iss: number) {
  const metrosQuadrados = Number(metros.replace(',', '.'));
  return {
    postos: postos.filter(p => p.quantidade > 0).map(p => ({
      funcaoId: p.funcaoId, quantidade: p.quantidade, turno: p.turno, periculosidade: p.periculosidade, insalubridade: p.insalubridade,
      ...(p.turno === 'noturno' && p.horasNoturnas !== '' && Number(p.horasNoturnas) >= 0 ? { horasNoturnas: Number(p.horasNoturnas) } : {}),
    })),
    iss,
    ...(metrosQuadrados > 0 ? { metrosQuadrados } : {}),
    ...(insumos.length ? { insumos } : {}),
  };
}
