import { arred2, dec } from '@/lib/tributos/decimal';
import { FATOS } from '@/lib/jornada42/fatos';

/** Entrada do cálculo: salário mensal e, se quiser, as horas mensais de extras (50% e 100%) e de adicional noturno (20%). */
export type EntradaDoImpacto = {
  salario: number;
  horasExtras50?: number;
  horasExtras100?: number;
  horasNoturnas?: number;
};

export type Cenario = {
  /** Rótulo da jornada ("44 horas (jornada de hoje)"). */
  rotulo: string;
  divisor: number;
  /** Salário-hora, valor da hora extra a 50% e a 100% e adicional noturno por hora (20% da hora), em reais com 2 casas. */
  salarioHora: number;
  horaExtra50: number;
  horaExtra100: number;
  adicionalNoturnoHora: number;
  /** Totais do mês: horas informadas × valor exato da hora, arredondados uma vez. */
  totalExtras50: number;
  totalExtras100: number;
  totalNoturno: number;
  /** Extras e adicional noturno somados. */
  totalVariaveis: number;
  /** Variação do salário-hora em relação ao divisor 220, em pontos percentuais com 2 casas (0 para o próprio 220). */
  variacaoPercentual: number;
};

export type ResultadoDoImpacto = { cenarios: Cenario[] };

export const LIMITE_SALARIO = 1_000_000;
/** Mais horas que as de um mês de 31 dias não existem. */
export const LIMITE_HORAS = 744;

const JORNADAS: [string, number][] = [
  [`${FATOS.horas44} horas (jornada de hoje)`, FATOS.divisor44],
  [`${FATOS.horas42} horas (a partir de ${FATOS.inicio42})`, FATOS.divisor42],
  [`${FATOS.horas40} horas (a partir de ${FATOS.inicio40})`, FATOS.divisor40],
];

const horasValidas = (v: number | undefined) => v === undefined || (Number.isFinite(v) && v >= 0 && v <= LIMITE_HORAS);

/**
 * Impacto da redução da jornada no custo de um posto: o salário-hora nos divisores 220 (jornada atual de 44 horas), 210 (42 horas) e 200 (40 horas).
 * É CUSTO, nunca preço. A conta é exata e cada valor publicado é arredondado uma vez, em centavos, com a regra de src/lib/tributos/decimal.ts (HALF_EVEN):
 * a hora extra, o adicional e os totais saem do valor exato, não da hora já arredondada, para o centavo bater com a memória de cálculo.
 * Devolve `undefined` para entrada inválida (salário zero, negativo ou acima do limite; horas negativas ou além das horas do mês).
 */
export function calcularImpacto(entrada: EntradaDoImpacto): ResultadoDoImpacto | undefined {
  const { salario, horasExtras50, horasExtras100, horasNoturnas } = entrada;
  if (!Number.isFinite(salario) || salario <= 0 || salario > LIMITE_SALARIO) return undefined;
  if (![horasExtras50, horasExtras100, horasNoturnas].every(horasValidas)) return undefined;
  const s = dec(salario);
  const base = s.div(FATOS.divisor44);
  const h50 = dec(horasExtras50 ?? 0);
  const h100 = dec(horasExtras100 ?? 0);
  const hn = dec(horasNoturnas ?? 0);
  const cenarios = JORNADAS.map(([rotulo, divisor]): Cenario => {
    const hora = s.div(divisor);
    const extra50 = hora.mul(1.5);
    const extra100 = hora.mul(2);
    const noturno = hora.mul(0.2);
    const t50 = arred2(extra50.mul(h50));
    const t100 = arred2(extra100.mul(h100));
    const tn = arred2(noturno.mul(hn));
    return {
      rotulo,
      divisor,
      salarioHora: arred2(hora).toNumber(),
      horaExtra50: arred2(extra50).toNumber(),
      horaExtra100: arred2(extra100).toNumber(),
      adicionalNoturnoHora: arred2(noturno).toNumber(),
      totalExtras50: t50.toNumber(),
      totalExtras100: t100.toNumber(),
      totalNoturno: tn.toNumber(),
      totalVariaveis: t50.plus(t100).plus(tn).toNumber(),
      variacaoPercentual: hora.div(base).minus(1).mul(100).toDecimalPlaces(2, 6).toNumber(),
    };
  });
  return { cenarios };
}
