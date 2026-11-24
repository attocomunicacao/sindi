/** Formatação pt-BR usada nas memórias de cálculo (texto puro, sem dependência de servidor). */
export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** Percentual a partir de pontos percentuais (8,4 -> "8,40%"), com o mínimo e o máximo de casas informados. */
export const pontos = (v: number, min = 2, max = 4) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max })}%`;
/**
 * Número digitado em pt-BR: "500.000,50" (vírgula decimal, ponto de milhar), "500.000" (só milhar) ou "500000.5" (ponto decimal).
 * Vazio, negativo ou inválido vira undefined.
 */
export const lerNumero = (texto: string): number | undefined => {
  const limpo = texto.trim().replace(/\s/g, ''); if (!limpo) return undefined;
  const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(limpo) ? limpo.replace(/\./g, '') : limpo;
  const n = Number(normal); return Number.isFinite(n) && n >= 0 ? n : undefined;
};
