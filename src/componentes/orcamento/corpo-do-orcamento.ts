import { lerNumero } from '@/lib/base/formato';
import type { Insumo, Posto } from '@/componentes/orcamento/posto';

/** BDI, lucro e tributos como o usuário os digita, em pontos percentuais ("3", "1,65"); vazio = não informado. */
export type MargemEmTexto = {
  bdi: string;
  lucro: string;
  pis: string;
  cofins: string;
  contribuicaoSocial: string;
  irpj: string;
};
export const MARGEM_VAZIA: MargemEmTexto = {
  bdi: '',
  lucro: '',
  pis: '',
  cofins: '',
  contribuicaoSocial: '',
  irpj: '',
};

/** Pontos percentuais digitados viram fração; vazio ou ilegível fica de fora (vale zero). Valor fora de faixa segue adiante para a conta recusar com o motivo. */
const fracao = (texto: string) => {
  const n = lerNumero(texto);
  return n === undefined ? undefined : n / 100;
};

/** O que a conta e o PDF recebem (sem tributação nem dados do cliente): postos com quantidade, o ISS, BDI, lucro e tributos que o usuário informou, a área e os insumos. */
export function corpoDoOrcamento(
  postos: Posto[],
  insumos: Insumo[],
  metros: string,
  iss: number | undefined,
  margem: MargemEmTexto = MARGEM_VAZIA,
) {
  const bdi = fracao(margem.bdi);
  const lucro = fracao(margem.lucro);
  const impostos = Object.fromEntries(
    (['pis', 'cofins', 'contribuicaoSocial', 'irpj'] as const)
      .map((k) => [k, fracao(margem[k])] as const)
      .filter(([, v]) => v !== undefined),
  );
  // Leitura pt-BR: "1.200" são mil e duzentos metros, não 1,2 (e "1.200,50" não vira NaN).
  const metrosQuadrados = lerNumero(metros) ?? 0;
  return {
    postos: postos
      .filter((p) => p.quantidade > 0)
      .map((p) => ({
        funcaoId: p.funcaoId,
        quantidade: p.quantidade,
        turno: p.turno,
        periculosidade: p.periculosidade,
        insalubridade: p.insalubridade,
        ...(p.turno === 'noturno' && p.horasNoturnas !== '' && Number(p.horasNoturnas) >= 0
          ? { horasNoturnas: Number(p.horasNoturnas) }
          : {}),
      })),
    ...(iss !== undefined ? { iss } : {}),
    ...(bdi !== undefined ? { bdi } : {}),
    ...(lucro !== undefined ? { lucro } : {}),
    ...(Object.keys(impostos).length ? { impostos } : {}),
    ...(metrosQuadrados > 0 ? { metrosQuadrados } : {}),
    ...(insumos.length ? { insumos } : {}),
  };
}
