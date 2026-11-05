import { deleteMissing, due, getState, setState, upsertDocument } from '../db';
import { politeFetch } from '../http';
import { decodeHtml, htmlToLines, splitArticles } from '../legal';
import type { Collector } from './types';

export const CONSTITUICAO_URL = 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm';
const DAY = 24 * 60 * 60 * 1000;

/** Constituição Federal (texto compilado do Planalto), um documento por artigo. Verificada uma vez por dia, com requisição condicional. */
export const constituicao: Collector = {
  source: 'constituicao', label: 'Constituição Federal',
  async run({ db, full }) {
    if (!due(db, 'constituicao:check', DAY, full)) return { fetched: 0, changed: 0 };
    const previous = getState(db, 'constituicao:lastModified')?.value;
    const response = await politeFetch(CONSTITUICAO_URL, { headers: previous && !full ? { 'If-Modified-Since': previous } : {} });
    setState(db, 'constituicao:check', new Date().toISOString());
    if (response.status === 304) return { fetched: 1, changed: 0 };
    if (!response.ok) throw new Error(`HTTP ${response.status} no Planalto`);
    const text = htmlToLines(decodeHtml(new Uint8Array(await response.arrayBuffer()), response.headers.get('content-type') ?? ''));
    const articles = splitArticles(text, { adct: true });
    if (articles.length < 100) throw new Error(`Extração suspeita: apenas ${articles.length} artigos`);
    let changed = 0;
    for (const a of articles) {
      if (upsertDocument(db, { source: 'constituicao', url: `${CONSTITUICAO_URL}#${a.key}`, title: `Constituição Federal — ${a.label}`, content: a.content })) changed++;
    }
    deleteMissing(db, 'constituicao', CONSTITUICAO_URL, new Set(articles.map(a => `${CONSTITUICAO_URL}#${a.key}`)));
    const modified = response.headers.get('last-modified'); if (modified) setState(db, 'constituicao:lastModified', modified);
    return { fetched: 1, changed };
  },
};
