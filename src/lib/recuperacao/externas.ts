import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { caminhoDoBanco, buscarDocumentos } from '@/lib/dados/db';

const ROTULO_DA_FONTE_EXTERNA: Record<string, string> = { camara: 'Câmara dos Deputados', senado: 'Senado Federal', tst: 'TST', wec: 'World Employment Confederation', ibge: 'IBGE', mte: 'Ministério do Trabalho e Emprego', caged: 'Novo CAGED', constituicao: 'Constituição Federal', regimentos: 'Regimentos' };
const FONTES_EXTERNAS = ['camara', 'senado', 'tst', 'wec', 'ibge', 'mte', 'caged', 'constituicao', 'regimentos'];
/** Trechos das fontes externas coletadas, para o chat citar; só quando a pergunta pede essas fontes (`INTENCAO_EXTERNA`). */
export function buscarFontesExternas(termos: string[], limite = 3, arquivo = caminhoDoBanco()) {
  if (!existsSync(arquivo)) return [];
  const db = new DatabaseSync(arquivo, { readOnly: true });
  try {
    return buscarDocumentos(db, termos, limite, FONTES_EXTERNAS, 900)
      .map(r => ({ url: r.url, title: `${ROTULO_DA_FONTE_EXTERNA[r.source]} — ${r.title}`, content: r.content, fetchedAt: r.fetchedAt }));
  } catch { return []; } finally { db.close(); }
}
