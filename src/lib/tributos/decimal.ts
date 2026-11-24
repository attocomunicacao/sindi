import Decimal from 'decimal.js';

/**
 * Política numérica dos tributos, espelhando a da Calculadora RTC da Receita Federal
 * (calculadora-rtc-regime-regular e calculadora-rtc-simples-nacional, licença MIT, ArredondamentoUtils e ADR003):
 * a conta é exata, cada número publicado é arredondado uma vez, na casa do leiaute, e o arredondamento é HALF_EVEN
 * (ABNT NBR 5891: no meio exato, vai para o algarismo par). Valor monetário com 2 casas; alíquota publicada com 4 casas
 * (2 casas na NFS-e e no Simples). Tudo que é cálculo fiscal passa por aqui: nunca some nem multiplique dinheiro em `number`.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });
export type Dec = Decimal;
export type Entrada = Decimal.Value;

/** Erro de entrada do cálculo tributário (mensagem em português, mostrável ao usuário). */
export class ErroTributario extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroTributario';
  }
}

export const dec = (v: Entrada): Dec => {
  try {
    const d = new D(v);
    if (!d.isFinite()) throw new Error('não finito');
    return d;
  } catch {
    throw new ErroTributario('Valor numérico inválido.');
  }
};
const MODO = Decimal.ROUND_HALF_EVEN;
/** Valor fiscal: 2 casas, HALF_EVEN. */
export const arred2 = (v: Entrada): Dec => dec(v).toDecimalPlaces(2, MODO);
/** Alíquota publicada pelo regime regular (em pontos percentuais): 4 casas, HALF_EVEN. */
export const publicarAliquota = (v: Entrada): Dec => dec(v).toDecimalPlaces(4, MODO);
/** Alíquota efetiva do Simples na NFS-e (pontos percentuais): 2 casas, HALF_EVEN. */
export const aliquotaNfse = (v: Entrada): Dec => dec(v).toDecimalPlaces(2, MODO);
/** Soma de valores já arredondados (o total fecha com as parcelas exibidas). */
export const somar = (...v: Entrada[]): Dec => v.reduce<Dec>((a, b) => a.plus(dec(b)), dec(0));
export const num = (v: Dec): number => v.toNumber();
