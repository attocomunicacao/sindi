// Somas do período mostrado na página de uso. Só tipos do servidor (apagados na compilação), sem imports de Node.
import type { DiaDeUso, UsoDoProvedor } from '@/lib/infra/uso';

export type TotaisDoPeriodo = Pick<
  DiaDeUso,
  'requests' | 'successes' | 'errors' | 'inputTokens' | 'outputTokens' | 'totalTokens' | 'measured' | 'durationMs'
>;

const ZERO: TotaisDoPeriodo = {
  requests: 0,
  successes: 0,
  errors: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  measured: 0,
  durationMs: 0,
};

export function somarDias(dias: DiaDeUso[]): TotaisDoPeriodo {
  return dias.reduce(
    (soma, d) => ({
      requests: soma.requests + d.requests,
      successes: soma.successes + d.successes,
      errors: soma.errors + d.errors,
      inputTokens: soma.inputTokens + d.inputTokens,
      outputTokens: soma.outputTokens + d.outputTokens,
      totalTokens: soma.totalTokens + d.totalTokens,
      measured: soma.measured + d.measured,
      durationMs: soma.durationMs + d.durationMs,
    }),
    ZERO,
  );
}

/** Soma por provedor no período, do que mais respondeu ao que menos: mostra quanto cada degrau da cascata está segurando (só agregados). */
export function somarPorProvedor(dias: DiaDeUso[]): [string, UsoDoProvedor][] {
  const soma: Record<string, UsoDoProvedor> = {};
  for (const dia of dias) {
    for (const [id, uso] of Object.entries(dia.provedores ?? {})) {
      const total = (soma[id] ??= { requests: 0, successes: 0, tokens: 0 });
      total.requests += uso.requests;
      total.successes += uso.successes;
      total.tokens += uso.tokens;
    }
  }
  return Object.entries(soma).sort((a, b) => b[1].successes - a[1].successes);
}

/** Soma, no período, dos contadores de "o que o cérebro entregou", separados por tipo (`conector`, `origem`, `situacao`), do maior para o menor. */
export function somarCerebro(dias: DiaDeUso[]): Record<'conector' | 'origem' | 'situacao', [string, number][]> {
  const soma: Record<string, Record<string, number>> = { conector: {}, origem: {}, situacao: {} };
  for (const dia of dias)
    for (const [chave, n] of Object.entries(dia.cerebro ?? {})) {
      const [tipo, ...resto] = chave.split(':');
      if (soma[tipo]) soma[tipo][resto.join(':')] = (soma[tipo][resto.join(':')] ?? 0) + n;
    }
  const ordenar = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]);
  return { conector: ordenar(soma.conector), origem: ordenar(soma.origem), situacao: ordenar(soma.situacao) };
}

export const diaEMes = (data: string) => data.split('-').reverse().slice(0, 2).join('/');
export const dataCompleta = (data: string) => data.split('-').reverse().join('/');
