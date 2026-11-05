import writeExcelFile from 'write-excel-file/node';
import { rename } from 'node:fs/promises';
import path from 'node:path';
import { dataDir, type Db } from './db';

export const xlsxPath = () => path.join(dataDir(), 'sindi-dados.xlsx');
/** O SINDEPRESTEM tem uma aba por seção do site (o campo meta.section é definido pelo coletor). */
export const SINDEPRESTEM_SHEETS: { name: string; sections: string[]; posts?: boolean }[] = [
  { name: 'Institucional', sections: ['institucional', 'contato', 'contribuicao', 'outro'] }, { name: 'Convenções', sections: ['convencao'] }, { name: 'Jurídico', sections: ['juridico'] },
  { name: 'Cartilhas', sections: ['cartilha'] }, { name: 'Artigos', sections: ['artigo'] }, { name: 'Notícias SINDEPRESTEM', sections: ['noticia'], posts: true },
];
export const SHEETS: Record<string, string> = { ibge: 'IBGE', camara: 'Câmara', senado: 'Senado', tst: 'TST', wec: 'WEC', mte: 'MTE', caged: 'CAGED', constituicao: 'Constituição', regimentos: 'Regimentos' };
/** Uma célula do Excel aceita no máximo 32.767 caracteres; o texto integral continua no SQLite. */
const EXCERPT = 3000;

type Cell = string | number | null;
const header = (labels: string[]) => labels.map(value => ({ value, fontWeight: 'bold' as const }));
const sheet = (name: string, labels: string[], widths: number[], rows: Cell[][]) => ({ sheet: name, data: [header(labels), ...rows], columns: widths.map(width => ({ width })) });

/** Gera a planilha a partir do banco: indicadores, uma aba por fonte e o histórico de coletas. */
export async function exportWorkbook(db: Db, file = xlsxPath()) {
  const indicators = (db.prepare('SELECT grp, label, value, unit, period, previous, source, fetched_at, url FROM indicators ORDER BY grp, label').all() as Record<string, string | number | null>[])
    .map(r => [r.grp, r.label, r.value, r.unit, r.period, r.previous, r.source, r.fetched_at, r.url] as Cell[]);
  const sheets = [sheet('Indicadores', ['Grupo', 'Indicador', 'Valor', 'Unidade', 'Período', 'Anterior', 'Fonte', 'Coletado em', 'Link'], [14, 46, 12, 26, 12, 12, 10, 24, 50], indicators)];
  for (const { name, sections, posts } of SINDEPRESTEM_SHEETS) {
    const marks = sections.map(() => '?').join(',');
    const rows = (db.prepare(`SELECT title, json_extract(meta, '$.section') AS section, json_extract(meta, '$.category') AS category, json_extract(meta, '$.year') AS year, published_at, fetched_at, url, content FROM documents
      WHERE source = 'sindeprestem' AND json_extract(meta, '$.section') IN (${marks}) AND json_extract(meta, '$.listing') IS NULL ${posts ? "AND url LIKE '%/post/%'" : ''} ORDER BY COALESCE(json_extract(meta, '$.year'), 0) DESC, COALESCE(published_at, changed_at) DESC`).all(...sections) as
      { title: string; section: string; category: string | null; year: number | null; published_at: string | null; fetched_at: string; url: string; content: string }[])
      .map(r => [r.title.slice(0, 500), r.section, r.category ?? '', r.year ?? '', r.published_at?.slice(0, 10) ?? '', r.fetched_at, r.url, r.content.slice(0, EXCERPT), r.content.length] as Cell[]);
    sheets.push(sheet(name, ['Título', 'Seção', 'Categoria', 'Ano', 'Publicado', 'Coletado em', 'Link', 'Texto (trecho)', 'Caracteres'], [60, 14, 22, 8, 14, 24, 60, 100, 12], rows));
  }
  for (const [source, name] of Object.entries(SHEETS)) {
    const rows = (db.prepare('SELECT title, published_at, changed_at, fetched_at, url, content FROM documents WHERE source = ? ORDER BY COALESCE(published_at, changed_at) DESC').all(source) as { title: string; published_at: string | null; changed_at: string; fetched_at: string; url: string; content: string }[])
      .map(r => [r.title.slice(0, 500), r.published_at?.slice(0, 10) ?? '', r.changed_at, r.fetched_at, r.url, r.content.slice(0, EXCERPT), r.content.length] as Cell[]);
    sheets.push(sheet(name, ['Título', 'Publicado', 'Alterado em', 'Coletado em', 'Link', 'Texto (trecho)', 'Caracteres'], [60, 14, 24, 24, 60, 100, 12], rows));
  }
  const runs = (db.prepare('SELECT source, started_at, finished_at, status, fetched, changed, error FROM runs ORDER BY id DESC LIMIT 500').all() as Record<string, string | number | null>[])
    .map(r => [r.source, r.started_at, r.finished_at, r.status, r.fetched, r.changed, r.error] as Cell[]);
  sheets.push(sheet('Coletas', ['Fonte', 'Início', 'Fim', 'Situação', 'Itens processados', 'Novos/alterados', 'Erro'], [14, 26, 26, 10, 16, 16, 60], runs));
  const temporary = file + '.tmp';
  await writeExcelFile(sheets).toFile(temporary);
  await rename(temporary, file);
  return file;
}
