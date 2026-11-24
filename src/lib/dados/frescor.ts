// Sem dependências de servidor (sqlite, fs): usado também pelo painel no navegador.
import type { Painel } from '@/lib/dados/painel';

/** Horas sem coleta bem-sucedida a partir das quais uma fonte é tida como defasada (a coleta roda a cada 30 minutos; indicadores mensais mudam pouco, mas a coleta deve continuar). */
export const DEFASADA_HORAS = 24;
export type FonteDefasada = { source: string; lastOk: string | null; horas: number | null; motivo: 'nunca' | 'antiga' | 'falha' };
/**
 * Fontes sem coleta bem-sucedida recente. `updatedAt` do painel é a data da melhor fonte, então uma fonte parada há semanas não aparecia como defasada:
 * aqui cada fonte é medida pela própria última coleta ok.
 */
export function fontesDefasadas(sources: Painel['sources'], agora = Date.now(), horas = DEFASADA_HORAS): FonteDefasada[] {
  return sources.flatMap((s): FonteDefasada[] => {
    const ok = s.lastOk ? Date.parse(s.lastOk) : NaN;
    if (!Number.isFinite(ok)) return [{ source: s.source, lastOk: s.lastOk, horas: null, motivo: 'nunca' }];
    const idade = (agora - ok) / 3_600_000;
    return idade > horas ? [{ source: s.source, lastOk: s.lastOk, horas: Math.floor(idade), motivo: s.status === 'ok' ? 'antiga' : 'falha' }] : [];
  });
}
