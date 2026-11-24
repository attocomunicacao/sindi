import { abandonarExecucoes, falhasSeguidas, finalizarExecucao, podarExecucoes, iniciarExecucao, type BancoDeDados } from '@/lib/dados/db';
import { exportarPlanilha } from '@/lib/dados/xlsx';
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

export const COLETORES: Coletor[] = [sindeprestem, ibge, bcb, camara, senado, tst, wec, mte, caged, constituicao, regimentos];

export type OpcoesDeSincronizacao = { only?: string[]; full?: boolean; log?: (message: string) => void; collectors?: Coletor[]; timeoutMs?: number; concurrency?: number };

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
export async function sincronizarTudo(db: BancoDeDados, { only, full = false, log = () => {}, collectors = COLETORES, timeoutMs = TEMPO_PADRAO_MS, concurrency = SIMULTANEOS_PADRAO }: OpcoesDeSincronizacao = {}) {
  const abandonadas = abandonarExecucoes(db); if (abandonadas) log(`${abandonadas} execução(ões) anterior(es) interrompida(s) encerrada(s)`);
  podarExecucoes(db);
  const selecionados = collectors.filter(c => !only?.length || only.includes(c.source));
  const desfechos = await emParalelo(selecionados, concurrency, async coletor => {
    const execucao = iniciarExecucao(db, coletor.source);
    try {
      const resultado = await comTempoLimite(coletor.run({ db, full }), timeoutMs, `tempo esgotado (${Math.round(timeoutMs / 60000)} min)`);
      finalizarExecucao(db, execucao, resultado); log(`${coletor.label}: ${resultado.fetched} itens processados, ${resultado.changed} novos/alterados`);
      return { source: coletor.source, ...resultado };
    } catch (cause) {
      const erro = cause instanceof Error ? cause.message : 'falha desconhecida';
      finalizarExecucao(db, execucao, { fetched: 0, changed: 0, error: erro });
      const seguidas = falhasSeguidas(db, coletor.source);
      log(`${coletor.label}: ERRO ${erro}${seguidas >= FALHAS_PARA_ALERTA ? ` (${seguidas} falhas seguidas: a fonte precisa de atenção)` : ''}`);
      return { source: coletor.source, fetched: 0, changed: 0, error: erro };
    }
  });
  try { await exportarPlanilha(db); }
  catch (cause) { log(`Planilha: não foi possível atualizar (${cause instanceof Error ? cause.message : 'erro desconhecido'}); os dados coletados foram mantidos`); }
  return desfechos;
}
