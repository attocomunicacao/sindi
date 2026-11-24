import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dbPath } from '@/lib/dados/db';

const ROTULO_DA_FONTE_EXTERNA: Record<string, string> = { camara: 'Câmara dos Deputados', senado: 'Senado Federal', tst: 'TST', wec: 'World Employment Confederation', ibge: 'IBGE', mte: 'Ministério do Trabalho e Emprego', caged: 'Novo CAGED', constituicao: 'Constituição Federal', regimentos: 'Regimentos' };
/** Trechos das fontes externas coletadas, para o chat citar; só quando a pergunta pede essas fontes (`INTENCAO_EXTERNA`). */
export function buscarFontesExternas(terms: string[], limit = 3, file = dbPath()) {
  if (!existsSync(file)) return [];
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const words = terms.map(t => t.replace(/[^\p{L}\p{N}]/gu, '')).filter(t => t.length >= 3);
    if (!words.length) return [];
    return (db.prepare(`SELECT d.url, d.source, d.title, substr(d.content, 1, 900) AS content, d.fetched_at AS fetchedAt FROM documents_fts f JOIN documents d ON d.rowid = f.rowid
      WHERE documents_fts MATCH ? AND d.source IN ('camara','senado','tst','wec','ibge','mte','caged','constituicao','regimentos') ORDER BY bm25(documents_fts, 4.0, 1.0) LIMIT ?`).all(words.map(w => `"${w}"*`).join(' OR '), limit) as { url: string; source: string; title: string; content: string; fetchedAt: string }[])
      .map(r => ({ url: r.url, title: `${ROTULO_DA_FONTE_EXTERNA[r.source]} — ${r.title}`, content: r.content, fetchedAt: r.fetchedAt }));
  } catch { return []; } finally { db.close(); }
}
