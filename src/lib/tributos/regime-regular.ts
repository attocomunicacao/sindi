import { arred2, dec, ErroTributario, num, publicarAliquota, somar } from './decimal';
import { brl, pontos } from '@/lib/base/formato';
import { servicoPorId, SERVICO_PADRAO, type ServicoTributavel } from './servicos';

/**
 * CBS e IBS de um serviço no regime regular. Reimplementa a lógica da Calculadora RTC da Receita Federal
 * (calculadora-rtc-regime-regular, MIT; CalculoCbsIbsService, ArredondamentoUtils e ADR003):
 * vBC = base; alíquota em pontos percentuais publicada com 4 casas (HALF_EVEN); valor = arred2(vBC × alíquota ÷ 100) (HALF_EVEN);
 * vIBS = vIBSUF + vIBSMun; totais = soma dos valores publicados. CBS/IBS são "por fora" (não integram o preço do serviço).
 */
export type AliquotasCbsIbs = { cbs: number; ibsUf: number; ibsMun: number };
export const ANOS = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033] as const;
export type Ano = (typeof ANOS)[number];

/** Banco oficial da Receita (B0001): só 2026 está publicado. */
export const ALIQUOTAS_2026: AliquotasCbsIbs = { cbs: 0.9, ibsUf: 0.1, ibsMun: 0 };
/**
 * Tabela de referência do baseline da Receita (B0001__sistema_tributario_completo, ALIQUOTA_REFERENCIA). A Receita APAGOU 2027 em diante
 * (V0053__ajustes_aliquotas) e passou a exigir que o usuário informe as alíquotas, marcando o cálculo como simulado.
 * Aqui servem só de PADRÃO EDITÁVEL: são estimativa. CONFERIR as alíquotas definitivas (resolução do Senado) antes de uso comercial.
 */
export const ALIQUOTAS_ESTIMADAS: Record<number, AliquotasCbsIbs> = {
  2027: { cbs: 8.4, ibsUf: 0.05, ibsMun: 0.05 }, 2028: { cbs: 8.4, ibsUf: 0.05, ibsMun: 0.05 },
  2029: { cbs: 8.5, ibsUf: 1.6, ibsMun: 0.25 }, 2030: { cbs: 8.5, ibsUf: 3.2, ibsMun: 0.5 }, 2031: { cbs: 8.5, ibsUf: 4.8, ibsMun: 0.75 },
  2032: { cbs: 8.5, ibsUf: 6.4, ibsMun: 1 }, 2033: { cbs: 8.5, ibsUf: 16, ibsMun: 2.5 },
};
export const ROTULO_ESTIMATIVA = 'estimativa (tabela de referência retirada pela Receita; informe as alíquotas definitivas)';

export type AliquotasDoAno = { aliquotas: AliquotasCbsIbs; simulado: boolean; origem: 'oficial' | 'estimativa' | 'informada'; rotulo: string };
export function aliquotasDoAno(ano: number, informadas?: AliquotasCbsIbs): AliquotasDoAno {
  if (!Number.isInteger(ano) || ano < 2026 || ano > 2033) throw new ErroTributario('Ano fora do período de transição (2026 a 2033).');
  if (informadas) return { aliquotas: informadas, simulado: true, origem: 'informada', rotulo: 'alíquotas informadas pelo usuário (cálculo simulado)' };
  if (ano === 2026) return { aliquotas: ALIQUOTAS_2026, simulado: false, origem: 'oficial', rotulo: 'banco oficial da Receita para 2026' };
  return { aliquotas: ALIQUOTAS_ESTIMADAS[ano], simulado: true, origem: 'estimativa', rotulo: ROTULO_ESTIMATIVA };
}

/**
 * Transição dos tributos antigos (LC 214/2025): PIS/COFINS deixam de existir em 2027; ISS a 90% (2029), 80% (2030), 70% (2031), 60% (2032) e extinto em 2033;
 * em 2026 a CBS/IBS de teste é informativa (dispensa de recolhimento a quem cumpre as obrigações acessórias). IRPJ e CSLL continuam.
 * CONFERIR com a LC 214/2025 e a LC 227/2026 antes de uso comercial; o padrão é editável pelo chamador.
 */
export type Transicao = { ano: number; pisCofins: boolean; fatorIss: number; cbsIbsInformativo: boolean };
const FATOR_ISS: Record<number, number> = { 2029: 0.9, 2030: 0.8, 2031: 0.7, 2032: 0.6, 2033: 0 };
export function transicaoDoAno(ano: number): Transicao {
  if (!Number.isInteger(ano) || ano < 2026 || ano > 2033) throw new ErroTributario('Ano fora do período de transição (2026 a 2033).');
  return { ano, pisCofins: ano < 2027, fatorIss: FATOR_ISS[ano] ?? 1, cbsIbsInformativo: ano === 2026 };
}

export type EntradaRegular = { base: number; ano: number; servicoId?: string; aliquotas?: AliquotasCbsIbs; reducaoPct?: number };
export type ResultadoRegular = {
  ano: number; base: number; servico: ServicoTributavel;
  /** Alíquotas efetivas publicadas (pontos percentuais, 4 casas), já com a redução do serviço. */
  aliquotas: AliquotasCbsIbs; reducaoPct: number;
  vCBS: number; vIBSUF: number; vIBSMun: number; vIBS: number; total: number;
  simulado: boolean; origemAliquotas: AliquotasDoAno['origem']; informativo: boolean; transicao: Transicao;
  memoria: string[]; avisos: string[];
};

const validarAliquotas = (a: AliquotasCbsIbs) => {
  for (const [nome, v] of Object.entries(a)) if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) throw new ErroTributario(`Alíquota de ${nome} inválida (0 a 100).`);
};

export function calcularCbsIbsServico(e: EntradaRegular): ResultadoRegular {
  if (typeof e.base !== 'number' || !Number.isFinite(e.base) || e.base < 0 || e.base > 1e12) throw new ErroTributario('Base de cálculo inválida.');
  const servico = servicoPorId(e.servicoId ?? SERVICO_PADRAO); if (!servico) throw new ErroTributario('Serviço desconhecido.');
  if (e.aliquotas) validarAliquotas(e.aliquotas);
  const reducao = e.reducaoPct ?? servico.reducaoPct;
  if (!Number.isFinite(reducao) || reducao < 0 || reducao > 100) throw new ErroTributario('Redução inválida (0 a 100).');
  const ano = aliquotasDoAno(e.ano, e.aliquotas); const transicao = transicaoDoAno(e.ano);
  const fator = dec(100).minus(reducao).div(100);
  const efetiva = (padrao: number) => publicarAliquota(dec(padrao).mul(fator));
  const aCbs = efetiva(ano.aliquotas.cbs), aUf = efetiva(ano.aliquotas.ibsUf), aMun = efetiva(ano.aliquotas.ibsMun);
  const valor = (a: ReturnType<typeof efetiva>) => arred2(dec(e.base).mul(a).div(100));
  const vCBS = valor(aCbs), vUf = valor(aUf), vMun = valor(aMun); const vIBS = somar(vUf, vMun); const total = somar(vCBS, vIBS);
  const avisos: string[] = [];
  if (ano.simulado) avisos.push(ano.origem === 'estimativa'
    ? `Cálculo simulado: alíquotas de ${e.ano} são ${ROTULO_ESTIMATIVA}.` : 'Cálculo simulado: alíquotas informadas pelo usuário, não publicadas pela Receita.');
  if (transicao.cbsIbsInformativo) avisos.push('2026 é ano de teste: a CBS e o IBS são destacados na nota, sem custo (dispensa de recolhimento para quem cumpre as obrigações acessórias).');
  avisos.push('CBS e IBS são "por fora": somam-se ao valor do serviço. Quem está no regime regular credita o que for destacado na nota.');
  avisos.push(servico.local === 'imovel' ? 'O IBS é devido ao município onde está o imóvel.' : 'O IBS é devido ao município do endereço do tomador.');
  const memoria = [
    `Serviço: LC 116 ${servico.lc116}, ${servico.descricao}. CST ${servico.cst}, cClassTrib ${servico.cClassTrib}${reducao ? `, redução de ${pontos(reducao, 0, 2)}` : ', tributação integral'}.`,
    `Base de cálculo (vBC): ${brl(e.base)}. Alíquotas (${ano.rotulo}): CBS ${pontos(ano.aliquotas.cbs)}, IBS UF ${pontos(ano.aliquotas.ibsUf)}, IBS município ${pontos(ano.aliquotas.ibsMun)}.`,
    ...(reducao ? [`Alíquota efetiva = padrão × (1 − ${reducao}%), publicada com 4 casas: CBS ${pontos(num(aCbs))}, IBS UF ${pontos(num(aUf))}, IBS município ${pontos(num(aMun))}.`] : []),
    `vCBS = ${brl(e.base)} × ${pontos(num(aCbs))} = ${brl(num(vCBS))}; vIBSUF = ${brl(num(vUf))}; vIBSMun = ${brl(num(vMun))}; vIBS = ${brl(num(vIBS))}.`,
    `Total de CBS + IBS: ${brl(num(total))}. Arredondamento HALF_EVEN (regra da Receita: ABNT NBR 5891) a 2 casas por valor.`,
  ];
  return { ano: e.ano, base: e.base, servico, aliquotas: { cbs: num(aCbs), ibsUf: num(aUf), ibsMun: num(aMun) }, reducaoPct: reducao, vCBS: num(vCBS), vIBSUF: num(vUf), vIBSMun: num(vMun), vIBS: num(vIBS), total: num(total),
    simulado: ano.simulado, origemAliquotas: ano.origem, informativo: transicao.cbsIbsInformativo, transicao, memoria, avisos };
}
