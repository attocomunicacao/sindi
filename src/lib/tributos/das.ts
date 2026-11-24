import { arred2, dec, ErroTributario, num, type Dec } from '@/lib/tributos/decimal';
import { brl, pontos } from '@/lib/base/formato';

/**
 * DAS do Simples Nacional (serviços): anexos III, IV e V da LC 123/2006, art. 18.
 * ATENÇÃO, CONFERIR com a LC 123/2006 (art. 18 e anexos) e as Resoluções do CGSN antes de uso comercial: as tabelas abaixo foram
 * transcritas de um RESUMO do texto oficial, não verbatim. A partilha de 2027 em diante (LC 214/2025) NÃO está implementada.
 * O repositório da Receita (calculadora-rtc-simples-nacional, MIT) não calcula o DAS; esta parte é escrita a partir da lei.
 *
 * Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12. A partilha reparte a alíquota efetiva entre os tributos.
 */
export type Anexo = 'III' | 'IV' | 'V';
export const ANEXOS: readonly Anexo[] = ['III', 'IV', 'V'];
export const TRIBUTOS_DAS = ['IRPJ', 'CSLL', 'Cofins', 'PIS', 'CPP', 'ISS'] as const;
export type TributoDas = (typeof TRIBUTOS_DAS)[number];
export const LIMITE_RBT12 = 4_800_000;
export const LIMITE_ISS_PONTOS = 5;
/** Limites superiores das 6 faixas de receita bruta dos 12 meses (RBT12). */
export const FAIXAS_LIMITE = [180_000, 360_000, 720_000, 1_800_000, 3_600_000, 4_800_000] as const;

type Faixa = { aliquota: number; deduzir: number; /** IRPJ, CSLL, Cofins, PIS, CPP, ISS em % do DAS; soma 100 (na 6ª faixa, sem ISS). */ partilha: [number, number, number, number, number, number] };
const TABELAS: Record<Anexo, Faixa[]> = {
  III: [
    { aliquota: 6.0, deduzir: 0, partilha: [4, 3.5, 12.82, 2.78, 43.4, 33.5] },
    { aliquota: 11.2, deduzir: 9360, partilha: [4, 3.5, 14.05, 3.05, 43.4, 32] },
    { aliquota: 13.5, deduzir: 17640, partilha: [4, 3.5, 13.64, 2.96, 43.4, 32.5] },
    { aliquota: 16.0, deduzir: 35640, partilha: [4, 3.5, 13.64, 2.96, 43.4, 32.5] },
    { aliquota: 21.0, deduzir: 125640, partilha: [4, 3.5, 12.82, 2.78, 43.4, 33.5] },
    { aliquota: 33.0, deduzir: 648000, partilha: [35, 15, 16.03, 3.47, 30.5, 0] },
  ],
  // Anexo IV: a CPP não está no DAS (20% patronal + RAT/FAP são recolhidos à parte, sem terceiros/Sistema S).
  IV: [
    { aliquota: 4.5, deduzir: 0, partilha: [18.8, 15.2, 17.67, 3.83, 0, 44.5] },
    { aliquota: 9.0, deduzir: 8100, partilha: [19.8, 15.2, 20.55, 4.45, 0, 40] },
    { aliquota: 10.2, deduzir: 12420, partilha: [20.8, 15.2, 19.73, 4.27, 0, 40] },
    { aliquota: 14.0, deduzir: 39780, partilha: [17.8, 19.2, 18.9, 4.1, 0, 40] },
    { aliquota: 22.0, deduzir: 183780, partilha: [18.8, 19.2, 18.08, 3.92, 0, 40] },
    { aliquota: 33.0, deduzir: 828000, partilha: [53.5, 21.5, 20.55, 4.45, 0, 0] },
  ],
  V: [
    { aliquota: 15.5, deduzir: 0, partilha: [25, 15, 14.1, 3.05, 28.85, 14] },
    { aliquota: 18.0, deduzir: 4500, partilha: [23, 15, 14.1, 3.05, 27.85, 17] },
    { aliquota: 19.5, deduzir: 9900, partilha: [24, 15, 14.92, 3.23, 23.85, 19] },
    { aliquota: 20.5, deduzir: 17100, partilha: [21, 15, 15.74, 3.41, 23.85, 21] },
    { aliquota: 23.0, deduzir: 62100, partilha: [23, 12.5, 14.1, 3.05, 23.85, 23.5] },
    { aliquota: 30.5, deduzir: 540000, partilha: [35, 15.5, 16.44, 3.56, 29.5, 0] },
  ],
};
/** Partilha do EXCEDENTE do ISS na 5ª faixa (art. 18, § 1º-B): ISS fixo em 5% e o resto da alíquota efetiva repartido assim (IRPJ, CSLL, Cofins, PIS, CPP). */
const EXCEDENTE_5A_FAIXA: Partial<Record<Anexo, [number, number, number, number, number]>> = {
  III: [6.02, 5.26, 19.28, 4.18, 65.26],
  IV: [31.33, 32, 30.13, 6.54, 0],
};
export const FATOR_R_MINIMO = 0.28;

export type EntradaDas = {
  anexo: Anexo; rbt12: number;
  /** Folha de pagamento dos últimos 12 meses (inclui pró-labore, encargos e FGTS); com ela se aplica o Fator R ao Anexo V. */ folha12?: number;
  /** Receita do mês, para o valor do DAS. */ receitaMes?: number; ano?: number;
};
export type LinhaPartilha = { tributo: TributoDas; /** % do DAS */ percentualDoDas: number; /** pontos percentuais da receita */ aliquota: number; valor?: number };
export type ResultadoDas = {
  anexoEscolhido: Anexo; anexoAplicado: Anexo; fatorR: { calculado: boolean; razao: number | null; trocouParaIII: boolean };
  rbt12: number; faixa: number; aliquotaNominal: number; parcelaDeduzir: number;
  /** Alíquota efetiva em pontos percentuais (7,716 = 7,716%). */ aliquotaEfetiva: number;
  partilha: LinhaPartilha[]; issLimitado: boolean; issForaDoDas: boolean;
  /** No Anexo IV a CPP (20% patronal + RAT/FAP, sem terceiros) é recolhida fora do DAS. */ cppForaDoDas: boolean;
  receitaMes?: number; valorDas?: number; memoria: string[]; avisos: string[];
};

export function faixaDaReceita(rbt12: number): number {
  if (typeof rbt12 !== 'number' || !Number.isFinite(rbt12) || rbt12 <= 0) throw new ErroTributario('Informe a receita bruta dos últimos 12 meses (RBT12) maior que zero.');
  if (rbt12 > LIMITE_RBT12) throw new ErroTributario('RBT12 acima de R$ 4.800.000,00: fora do Simples Nacional.');
  return FAIXAS_LIMITE.findIndex(limite => rbt12 <= limite) + 1;
}

export function calcularDas(e: EntradaDas): ResultadoDas {
  if (!ANEXOS.includes(e.anexo)) throw new ErroTributario('Anexo inválido (III, IV ou V).');
  const faixa = faixaDaReceita(e.rbt12);
  if (e.folha12 !== undefined && (!Number.isFinite(e.folha12) || e.folha12 < 0 || e.folha12 > 1e12)) throw new ErroTributario('Folha dos últimos 12 meses inválida.');
  if (e.receitaMes !== undefined && (!Number.isFinite(e.receitaMes) || e.receitaMes < 0 || e.receitaMes > 1e12)) throw new ErroTributario('Receita do mês inválida.');
  const avisos: string[] = []; const memoria: string[] = [];
  // Fator R: folha12 ÷ RBT12 ≥ 28% troca o Anexo V pelo III.
  const razao = e.folha12 !== undefined ? dec(e.folha12).div(e.rbt12) : null;
  const trocou = e.anexo === 'V' && razao !== null && razao.gte(FATOR_R_MINIMO);
  const aplicado: Anexo = trocou ? 'III' : e.anexo;
  if (e.anexo === 'V') {
    if (razao === null) avisos.push('Anexo V depende do Fator R: informe a folha dos últimos 12 meses (≥ 28% da RBT12 passa a tributar pelo Anexo III).');
    else memoria.push(`Fator R = ${brl(e.folha12!)} ÷ ${brl(e.rbt12)} = ${pontos(num(razao.mul(100)))}: ${trocou ? 'igual ou acima de 28%, tributa pelo Anexo III em vez do V' : 'abaixo de 28%, permanece no Anexo V'}.`);
  }
  const linha = TABELAS[aplicado][faixa - 1];
  // Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12, sem arredondar: a alíquota é publicada pelo PGDAS-D com mais casas que o valor.
  const rbt = dec(e.rbt12);
  const efetiva: Dec = rbt.mul(linha.aliquota).div(100).minus(linha.deduzir).div(rbt).mul(100);
  memoria.push(`Anexo ${aplicado}, ${faixa}ª faixa (RBT12 ${brl(e.rbt12)}): alíquota nominal ${pontos(linha.aliquota)}, parcela a deduzir ${brl(linha.deduzir)}.`,
    `Alíquota efetiva = (${brl(e.rbt12)} × ${pontos(linha.aliquota)} − ${brl(linha.deduzir)}) ÷ ${brl(e.rbt12)} = ${pontos(num(efetiva), 4, 6)}.`);

  const [irpj, csll, cofins, pis, cpp, iss] = linha.partilha;
  const issForaDoDas = faixa === 6;
  let pcts: number[] = [irpj, csll, cofins, pis, cpp, iss]; let issLimitado = false;
  // Limite do ISS: se a alíquota efetiva do ISS passaria de 5%, ele fica em 5% e o excesso vai aos tributos federais (art. 18, § 1º-B).
  const issEfetivo = efetiva.mul(iss).div(100);
  if (!issForaDoDas && issEfetivo.gt(LIMITE_ISS_PONTOS)) {
    issLimitado = true;
    const issPct = dec(LIMITE_ISS_PONTOS).div(efetiva).mul(100); // % do DAS que o ISS passa a ocupar
    const resto = dec(100).minus(issPct);
    const excedente = faixa === 5 ? EXCEDENTE_5A_FAIXA[aplicado] : undefined;
    const federais = [irpj, csll, cofins, pis, cpp]; const somaFederais = federais.reduce((a, b) => a + b, 0);
    const partes = (excedente ?? federais.map(f => (f / somaFederais) * 100)).map(p => resto.mul(p).div(100));
    pcts = [...partes.map(p => num(p)), num(issPct)];
    memoria.push(`O ISS passaria de ${pontos(LIMITE_ISS_PONTOS, 0, 0)}: fica em ${pontos(LIMITE_ISS_PONTOS, 0, 0)} da receita e o excedente da alíquota efetiva é repartido entre os tributos federais${excedente ? ' pela tabela do excedente da 5ª faixa' : ' na proporção da partilha'}.`);
  }
  if (issForaDoDas) avisos.push('6ª faixa (RBT12 acima de R$ 3.600.000,00): o ISS é recolhido fora do DAS, ao município, pela alíquota própria.');
  const partilha: LinhaPartilha[] = TRIBUTOS_DAS.map((tributo, i) => ({ tributo, percentualDoDas: pcts[i], aliquota: num(efetiva.mul(pcts[i]).div(100)) }));
  let valorDas: number | undefined;
  if (e.receitaMes !== undefined) {
    const v = arred2(dec(e.receitaMes).mul(efetiva).div(100)); valorDas = num(v);
    for (const p of partilha) p.valor = num(arred2(dec(e.receitaMes).mul(p.aliquota).div(100)));
    memoria.push(`DAS do mês = ${brl(e.receitaMes)} × ${pontos(num(efetiva), 4, 6)} = ${brl(valorDas)} (HALF_EVEN, 2 casas).`);
  }
  const cppForaDoDas = aplicado === 'IV';
  if (cppForaDoDas) avisos.push('Anexo IV: a contribuição previdenciária patronal (CPP) não está no DAS. Recolhe-se à parte 20% sobre a folha mais RAT/FAP, sem contribuições a terceiros (Sistema S) — LC 123, art. 18, § 5º-C.');
  else avisos.push('Anexos III e V: a CPP patronal está dentro do DAS; não há contribuição a terceiros.');
  if (aplicado !== 'IV') avisos.push('A cessão ou locação de mão de obra é vedada no Simples Nacional (LC 123, art. 17, XII), exceto as atividades do art. 18, § 5º-C (vigilância, limpeza, conservação e construção, no Anexo IV) — § 5º-H.');
  if (e.ano !== undefined && e.ano >= 2027) avisos.push('Partilha de 2027 em diante (LC 214/2025) ainda não implementada: o DAS mostrado segue as tabelas atuais.');
  avisos.push('Tabelas conferidas só em resumo: CONFERIR com a LC 123/2006 e a Resolução do CGSN antes de uso comercial.');
  return { anexoEscolhido: e.anexo, anexoAplicado: aplicado, fatorR: { calculado: razao !== null, razao: razao ? num(razao) : null, trocouParaIII: trocou },
    rbt12: e.rbt12, faixa, aliquotaNominal: linha.aliquota, parcelaDeduzir: linha.deduzir, aliquotaEfetiva: num(efetiva), partilha, issLimitado, issForaDoDas, cppForaDoDas,
    receitaMes: e.receitaMes, valorDas, memoria, avisos };
}
