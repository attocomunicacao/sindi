// Apoio dos formulários de tributos (calculadora e orçamento): puro, sem imports de Node, usado no navegador.
import { ErroTributario } from '@/lib/tributos/decimal';
import { ALIQUOTAS_2026, ALIQUOTAS_ESTIMADAS } from '@/lib/tributos/regime-regular';

export type AliquotasEmTexto = { cbs: string; ibsUf: string; ibsMun: string };

const comVirgula = (n: number) => String(n).replace('.', ',');

/** Alíquotas de CBS e IBS do ano, já como texto pt-BR para preencher os campos; anos sem estimativa começam nas de 2026. */
export function aliquotasEmTexto(ano: number): AliquotasEmTexto {
  const a = ALIQUOTAS_ESTIMADAS[ano] ?? ALIQUOTAS_2026;
  return { cbs: comVirgula(a.cbs), ibsUf: comVirgula(a.ibsUf), ibsMun: comVirgula(a.ibsMun) };
}

/** Resolve o cálculo capturando só erro de entrada; qualquer outro erro continua sendo erro de programa. */
export function tentar<T>(calcular: () => T): { ok: T } | { falha: string } {
  try {
    return { ok: calcular() };
  } catch (causa) {
    if (causa instanceof ErroTributario) return { falha: causa.message };
    throw causa;
  }
}
