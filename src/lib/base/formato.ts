// Formatação pt-BR compartilhada. Sem imports de Node: também é usada por componentes do navegador.

/** Fuso de todas as datas que a SINDI mostra e de todos os dias que ela conta (cota, uso). */
export const FUSO = 'America/Sao_Paulo';
/** Data no fuso de São Paulo ("24/11/2026"). */
export const dataBR = (valor: string | number | Date) =>
  new Date(valor).toLocaleDateString('pt-BR', { timeZone: FUSO });
/** Data e hora curtas no fuso de São Paulo ("24/11/2026 14:30"). */
export const dataEHoraBR = (valor: string | number | Date) =>
  new Date(valor).toLocaleString('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' });
/** Período "2026-03" (ou "202603", ou "2026-03-01") como "03/2026"; o que não tem esse formato fica como veio. */
export const mesAno = (periodo: string) => periodo.replace(/^(\d{4})-?(\d{2}).*$/, '$2/$1');

/** "R$ 1.234,56". */
export const brl = (v: number, locale = 'pt-BR') => v.toLocaleString(locale, { style: 'currency', currency: 'BRL' });

/** Percentual a partir de pontos percentuais (8,4 -> "8,40%"), com o mínimo e o máximo de casas informados. */
export const pontos = (v: number, min = 2, max = 4) =>
  `${v.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max })}%`;

/** Número pt-BR com o padrão do navegador (ponto de milhar, até 3 casas). */
export const numeroBR = (v: number) => v.toLocaleString('pt-BR');

/** Número pt-BR com exatamente `casas` casas decimais. */
export const numeroComCasas = (v: number, casas = 0) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Número compacto ("12,3 mil"), com uma casa. */
export const numeroCompacto = (v: number) =>
  v.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

/** Indicadores em % mostram duas casas; contagens (vagas) mostram inteiros. */
export const ehPercentual = (unidade: string) => unidade.trim().startsWith('%');

/** Valor de um indicador conforme a unidade: duas casas para %, inteiro para contagens. */
export const numeroDoIndicador = (valor: number, unidade: string, locale = 'pt-BR') =>
  valor.toLocaleString(
    locale,
    ehPercentual(unidade) ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 },
  );

/**
 * Número digitado em pt-BR: "500.000,50" (vírgula decimal, ponto de milhar), "500.000" (só milhar) ou "500000.5" (ponto decimal).
 * Ponto + exatamente 3 dígitos é milhar ("1.200"), exceto quando o primeiro grupo é zero ("0.100" é 0,1, não 100): é o que alíquotas digitadas com ponto precisam.
 * Vazio, negativo ou inválido vira undefined.
 */
export const lerNumero = (texto: string): number | undefined => {
  const limpo = texto.trim().replace(/\s/g, '');
  if (!limpo) return undefined;
  const normal = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : /^[1-9]\d{0,2}(\.\d{3})+$/.test(limpo)
      ? limpo.replace(/\./g, '')
      : limpo;
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
