// Formatação pt-BR compartilhada. Sem imports de Node: também é usada por componentes do navegador.

/** "R$ 1.234,56". */
export const brl = (v: number, locale = 'pt-BR') => v.toLocaleString(locale, { style: 'currency', currency: 'BRL' });

/** Percentual a partir de pontos percentuais (8,4 -> "8,40%"), com o mínimo e o máximo de casas informados. */
export const pontos = (v: number, min = 2, max = 4) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max })}%`;

/** Número pt-BR com o padrão do navegador (ponto de milhar, até 3 casas). */
export const numeroBR = (v: number) => v.toLocaleString('pt-BR');

/** Número pt-BR com exatamente `casas` casas decimais. */
export const numeroComCasas = (v: number, casas = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Número compacto ("12,3 mil"), com uma casa. */
export const numeroCompacto = (v: number) => v.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

/** Indicadores em % mostram duas casas; contagens (vagas) mostram inteiros. */
export const ehPercentual = (unidade: string) => unidade.trim().startsWith('%');

/** Valor de um indicador conforme a unidade: duas casas para %, inteiro para contagens. */
export const numeroDoIndicador = (valor: number, unidade: string, locale = 'pt-BR') =>
  valor.toLocaleString(locale, ehPercentual(unidade) ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });

/**
 * Número digitado em pt-BR: "500.000,50" (vírgula decimal, ponto de milhar), "500.000" (só milhar) ou "500000.5" (ponto decimal).
 * Vazio, negativo ou inválido vira undefined.
 */
export const lerNumero = (texto: string): number | undefined => {
  const limpo = texto.trim().replace(/\s/g, ''); if (!limpo) return undefined;
  const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(limpo) ? limpo.replace(/\./g, '') : limpo;
  const n = Number(normal); return Number.isFinite(n) && n >= 0 ? n : undefined;
};
