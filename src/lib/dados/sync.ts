import { finishRun, startRun, type Db } from './db';
import { exportWorkbook } from './xlsx';
import { bcb } from './collectors/bcb';
import { camara } from './collectors/camara';
import { ibge } from './collectors/ibge';
import { senado } from './collectors/senado';
import { sindeprestem } from './collectors/sindeprestem';
import { tst } from './collectors/tst';
import { wec } from './collectors/wec';
import { caged } from './collectors/caged';
import { constituicao } from './collectors/constituicao';
import { mte } from './collectors/mte';
import { regimentos } from './collectors/regimentos';
import type { Collector } from './collectors/types';

export const COLLECTORS: Collector[] = [sindeprestem, ibge, bcb, camara, senado, tst, wec, mte, caged, constituicao, regimentos];

export type SyncOptions = { only?: string[]; full?: boolean; log?: (message: string) => void };
/** Uma fonte que falha não interrompe as demais; cada coleta fica registrada em `runs`. */
export async function syncAll(db: Db, { only, full = false, log = () => {} }: SyncOptions = {}) {
  const selected = COLLECTORS.filter(c => !only?.length || only.includes(c.source));
  const outcomes = await Promise.all(selected.map(async collector => {
    const run = startRun(db, collector.source);
    try {
      const result = await collector.run({ db, full });
      finishRun(db, run, result); log(`${collector.label}: ${result.fetched} itens processados, ${result.changed} novos/alterados`);
      return { source: collector.source, ...result };
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'falha desconhecida';
      finishRun(db, run, { fetched: 0, changed: 0, error }); log(`${collector.label}: ERRO ${error}`);
      return { source: collector.source, fetched: 0, changed: 0, error };
    }
  }));
  await exportWorkbook(db);
  return outcomes;
}
