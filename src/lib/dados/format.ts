// Sem imports de Node: este módulo também é usado por componentes do navegador.

/** Indicadores em % mostram duas casas; contagens (vagas) mostram inteiros. */
export const isPercent = (unit: string) => unit.trim().startsWith('%');
