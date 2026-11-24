import { aliquotaNfse, arred2, ErroTributario, num, somar } from '@/lib/tributos/decimal';
import { brl, pontos } from '@/lib/base/formato';

/**
 * CBS e IBS dentro do Simples Nacional. Reimplementa a lógica da Calculadora RTC da Receita Federal
 * (calculadora-rtc-simples-nacional, MIT; SimplesNacionalCalculoService, EscolhaParAliquotasService, ArredondamentoUtils, ADR003 e ADR011;
 * NT 2026.005). A Receita NÃO calcula o DAS: recebe do PGDAS-D as alíquotas efetivas pCBSSN e pIBSSN.
 * valor = arred2(vRBSNitem × fatorReceita × alíquota ÷ 100), HALF_EVEN, com a alíquota na NFS-e em 2 casas.
 */
export type EntradaSimplesCbsIbs = {
  /** Receita bruta do item (vRBSNitem). */ receita: number;
  /** Fração da receita que é tributada (fator do tipo de receita bruta); 1 para receita própria comum. */ fatorReceita?: number;
  pCBSSN: number; pIBSSN: number;
  /** Optante que escolheu apurar IBS/CBS pelo regime regular ("por fora" do Simples): o item só reporta a receita. */ optaRegimeRegular?: boolean;
};
export type ResultadoSimplesCbsIbs = {
  calculado: boolean; motivo?: string; vRBSNitem: number; pCBSSN: number; pIBSSN: number; vCBS: number; vIBS: number; total: number; memoria: string[]; avisos: string[];
};

const valida = (v: number, nome: string, max: number) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) throw new ErroTributario(`${nome} inválido(a).`); };

export function calcularCbsIbsSimples(e: EntradaSimplesCbsIbs): ResultadoSimplesCbsIbs {
  valida(e.receita, 'Receita', 1e12); valida(e.pCBSSN, 'Alíquota de CBS', 100); valida(e.pIBSSN, 'Alíquota de IBS', 100);
  const fator = e.fatorReceita ?? 1; valida(fator, 'Fator da receita', 1);
  const vRBSNitem = arred2(e.receita);
  const avisos = ['As alíquotas pCBSSN e pIBSSN vêm do PGDAS-D (alíquota efetiva do Simples); esta calculadora não as deduz. Informe as do seu extrato.'];
  if (e.optaRegimeRegular) {
    return { calculado: false, motivo: 'Optante pelo regime regular de IBS/CBS (receita apurada "por fora" do Simples): use a aba do regime regular.', vRBSNitem: num(vRBSNitem), pCBSSN: 0, pIBSSN: 0, vCBS: 0, vIBS: 0, total: 0,
      memoria: [`Receita bruta do item: ${brl(num(vRBSNitem))}. Regime SOMENTE_RECEITA: IBS e CBS não são calculados pelo Simples.`], avisos };
  }
  const pCbs = aliquotaNfse(e.pCBSSN), pIbs = aliquotaNfse(e.pIBSSN);
  const base = vRBSNitem.mul(fator);
  const vCBS = arred2(base.mul(pCbs).div(100)), vIBS = arred2(base.mul(pIbs).div(100)); const total = somar(vCBS, vIBS);
  return { calculado: true, vRBSNitem: num(vRBSNitem), pCBSSN: num(pCbs), pIBSSN: num(pIbs), vCBS: num(vCBS), vIBS: num(vIBS), total: num(total),
    memoria: [
      `Receita bruta do item (vRBSNitem): ${brl(num(vRBSNitem))}${fator !== 1 ? `, fração tributada ${pontos(fator * 100, 0, 2)}` : ''}. Alíquotas efetivas na NFS-e (2 casas): CBS ${pontos(num(pCbs))}, IBS ${pontos(num(pIbs))}.`,
      `vCBS = ${brl(num(base))} × ${pontos(num(pCbs))} = ${brl(num(vCBS))}; vIBS = ${brl(num(base))} × ${pontos(num(pIbs))} = ${brl(num(vIBS))}; total ${brl(num(total))} (HALF_EVEN, 2 casas).`,
    ], avisos };
}

/** Fatos do ISS que decidem o par de alíquotas (EscolhaParAliquotasService, Solução de Consulta Cosit 298/2019). */
export type FatosIss = {
  anexo: 'I' | 'II' | 'III' | 'IV' | 'V';
  /** Impedimento por sublimite: o ISS é recolhido fora do Simples. */ impedimentoSublimite?: boolean;
  /** ISS recolhido fora do Simples por outro motivo (regApTribSN 2 ou 3). */ issForaDoSimples?: boolean;
  /** 1 tributável, 2 imunidade, 3 exportação, 4 não incidência. */ tribISSQN?: 1 | 2 | 3 | 4;
  /** 1 sem retenção, 2 retido pelo tomador, 3 retido pelo intermediário. */ tpRetISSQN?: 1 | 2 | 3;
  /** Benefício municipal: 1 isenção. */ tpBM?: 1 | 2 | 3 | 4;
};
export type EscolhaPar = { par: 'unico' | 'sem-redistribuicao' | 'com-redistribuicao'; regra: string; motivo: string };
/**
 * Usa-se o par SEM redistribuição quando, naquela operação, o percentual do ISS não entra no cálculo do Simples (a redistribuição existe para levar
 * aos outros tributos o ISS que passa do teto). Ordem da Receita: anexo sem ISS; ISS fora do Simples; não incidência/imunidade/exportação; isenção; ISS retido; padrão (com).
 * Cessão de mão de obra costuma ter ISS retido pelo tomador: nesse caso vale o par sem redistribuição.
 */
export function escolherParAliquotas(f: FatosIss): EscolhaPar {
  if (f.anexo === 'I' || f.anexo === 'II') return { par: 'unico', regra: 'ANEXO_SEM_ISS', motivo: 'Anexos I e II não têm ISS: par único.' };
  if (f.impedimentoSublimite || f.issForaDoSimples) return { par: 'sem-redistribuicao', regra: 'ISS_FORA_DO_SIMPLES', motivo: 'O ISS é recolhido fora do Simples (sublimite ou opção): sem redistribuição.' };
  if (f.tribISSQN === 2 || f.tribISSQN === 3 || f.tribISSQN === 4) return { par: 'sem-redistribuicao', regra: 'ISS_NAO_INCIDE', motivo: 'Operação sem ISS (imunidade, exportação ou não incidência): sem redistribuição.' };
  if (f.tpBM === 1) return { par: 'sem-redistribuicao', regra: 'ISENCAO_MUNICIPAL', motivo: 'Isenção municipal do ISS: sem redistribuição.' };
  if (f.tpRetISSQN === 2 || f.tpRetISSQN === 3) return { par: 'sem-redistribuicao', regra: 'ISS_RETIDO', motivo: 'ISS retido pelo tomador ou intermediário (comum na cessão de mão de obra): sem redistribuição.' };
  return { par: 'com-redistribuicao', regra: 'PADRAO', motivo: 'Caso padrão: par com redistribuição do ISS.' };
}
