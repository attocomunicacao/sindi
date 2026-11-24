import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { abrirBanco } from '@/lib/dados/db';

/** Resposta simulada de uma fonte externa: JSON, texto (HTML, XML) ou um `Response` pronto (para status e cabeçalhos). */
export type RespostaSimulada =
  Response | { json: unknown; status?: number } | { texto: string; status?: number; tipo?: string };
export type Rota = [padrao: string | RegExp, resposta: RespostaSimulada | ((url: URL) => RespostaSimulada)];

const montar = (r: RespostaSimulada): Response =>
  r instanceof Response
    ? r
    : 'json' in r
      ? Response.json(r.json, { status: r.status ?? 200 })
      : new Response(r.texto, {
          status: r.status ?? 200,
          headers: { 'content-type': r.tipo ?? 'text/html; charset=utf-8' },
        });

/**
 * Substitui o `fetch` por um roteador de respostas gravadas. Chamar uma URL que nenhuma rota cobre lança erro (um coletor que passa a pedir outra coisa quebra o teste);
 * `robots.txt` responde 404 (sem restrições). Devolve as URLs pedidas, na ordem, e a função que restaura o `fetch`.
 */
export function simularRede(rotas: Rota[]) {
  const original = globalThis.fetch;
  const chamadas: string[] = [];
  globalThis.fetch = (async (entrada: RequestInfo | URL) => {
    const url = new URL(typeof entrada === 'string' || entrada instanceof URL ? String(entrada) : entrada.url);
    if (url.pathname === '/robots.txt') return new Response('', { status: 404 });
    chamadas.push(url.href);
    for (const [padrao, resposta] of rotas) {
      if (typeof padrao === 'string' ? url.href.startsWith(padrao) : padrao.test(url.href))
        return montar(typeof resposta === 'function' ? resposta(url) : resposta);
    }
    throw new Error(`Rede não simulada: ${url.href}`);
  }) as typeof fetch;
  return {
    chamadas,
    restaurar: () => {
      globalThis.fetch = original;
    },
  };
}

/** Banco SQLite temporário e sem esperas entre requisições (SINDI_HTTP_PAUSA_MS=0) para rodar um coletor de verdade, e a limpeza no fim. */
export async function comBanco(fn: (db: ReturnType<typeof abrirBanco>) => Promise<void>) {
  const pasta = mkdtempSync(path.join(tmpdir(), 'sindi-coletor-'));
  const antes = { dados: process.env.SINDI_DATA_DIR, pausa: process.env.SINDI_HTTP_PAUSA_MS };
  process.env.SINDI_DATA_DIR = pasta;
  process.env.SINDI_HTTP_PAUSA_MS = '0';
  const db = abrirBanco(path.join(pasta, 'dados.sqlite'));
  try {
    await fn(db);
  } finally {
    db.close();
    rmSync(pasta, { recursive: true, force: true });
    if (antes.dados === undefined) delete process.env.SINDI_DATA_DIR;
    else process.env.SINDI_DATA_DIR = antes.dados;
    if (antes.pausa === undefined) delete process.env.SINDI_HTTP_PAUSA_MS;
    else process.env.SINDI_HTTP_PAUSA_MS = antes.pausa;
  }
}
