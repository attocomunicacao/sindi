import { abandonarExecucoes, falhasSeguidas, finishRun, podarExecucoes, startRun, type Db } from '@/lib/dados/db';
import { exportWorkbook } from '@/lib/dados/xlsx';
import { bcb } from '@/lib/dados/coletores/bcb';
import { camara } from '@/lib/dados/coletores/camara';
import { ibge } from '@/lib/dados/coletores/ibge';
import { senado } from '@/lib/dados/coletores/senado';
import { sindeprestem } from '@/lib/dados/coletores/sindeprestem';
import { tst } from '@/lib/dados/coletores/tst';
import { wec } from '@/lib/dados/coletores/wec';
import { caged } from '@/lib/dados/coletores/caged';
import { constituicao } from '@/lib/dados/coletores/constituicao';
import { mte } from '@/lib/dados/coletores/mte';
import { regimentos } from '@/lib/dados/coletores/regimentos';
import type { Coletor } from '@/lib/dados/coletores/tipos';

export const COLLECTORS: Coletor[] = [sindeprestem, ibge, bcb, camara, senado, tst, wec, mte, caged, constituicao, regimentos];

export type SyncOptions = { only?: string[]; full?: boolean; log?: (message: string) => void; collectors?: Coletor[]; timeoutMs?: number; concurrency?: number };

/** Tempo máximo de cada coletor (20 min; o do CAGED, que baixa um arquivo grande, é o maior). Um coletor travado não segura a planilha, o cérebro nem a próxima rodada. */
const TEMPO_PADRAO_MS = 20 * 60 * 1000;
/** Coletores em paralelo: todos de uma vez disputavam o mesmo SQLite e os mesmos domínios. */
const SIMULTANEOS_PADRAO = 4;
async function comTempoLimite<T>(promessa: Promise<T>, ms: number, mensagem: string): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promessa, new Promise<never>((_, rejeitar) => { relogio = setTimeout(() => rejeitar(new Error(mensagem)), ms); })]); }
  finally { clearTimeout(relogio); }
}
async function emParalelo<T, R>(itens: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const resultados = new Array<R>(itens.length); let proximo = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limite), itens.length) }, async () => {
    while (true) { const i = proximo++; if (i >= itens.length) return; resultados[i] = await fn(itens[i]); }
  }));
  return resultados;
}
/** Falhas seguidas a partir das quais o log destaca que uma fonte está quebrada, e não apenas instável. */
const FALHAS_PARA_ALERTA = 3;

/**
 * Uma fonte que falha ou estoura o tempo não interrompe as demais; cada coleta fica registrada em `runs`. No início, execuções que ficaram "running"
 * (processo encerrado) são fechadas como interrompidas e o histórico antigo é podado. Se a planilha não puder ser gravada (arquivo aberto no Excel), a coleta já feita é mantida.
 */
export async function syncAll(db: Db, { only, full = false, log = () => {}, collectors = COLLECTORS, timeoutMs = TEMPO_PADRAO_MS, concurrency = SIMULTANEOS_PADRAO }: SyncOptions = {}) {
  const abandonadas = abandonarExecucoes(db); if (abandonadas) log(`${abandonadas} execução(ões) anterior(es) interrompida(s) encerrada(s)`);
  podarExecucoes(db);
  const selected = collectors.filter(c => !only?.length || only.includes(c.source));
  const outcomes = await emParalelo(selected, concurrency, async collector => {
    const run = startRun(db, collector.source);
    try {
      const result = await comTempoLimite(collector.run({ db, full }), timeoutMs, `tempo esgotado (${Math.round(timeoutMs / 60000)} min)`);
      finishRun(db, run, result); log(`${collector.label}: ${result.fetched} itens processados, ${result.changed} novos/alterados`);
      return { source: collector.source, ...result };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'falha desconhecida';
      finishRun(db, run, { fetched: 0, changed: 0, error });
      const seguidas = falhasSeguidas(db, collector.source);
      log(`${collector.label}: ERRO ${error}${seguidas >= FALHAS_PARA_ALERTA ? ` (${seguidas} falhas seguidas: a fonte precisa de atenção)` : ''}`);
      return { source: collector.source, fetched: 0, changed: 0, error };
    }
  });
  try { await exportWorkbook(db); }
  catch (cause) { log(`Planilha: não foi possível atualizar (${cause instanceof Error ? cause.message : 'erro desconhecido'}); os dados coletados foram mantidos`); }
  return outcomes;
}
