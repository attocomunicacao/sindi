import { getText } from '../http';
import { extractArticle, linksFrom } from '../html';
import { hasDocument, upsertDocument } from '../db';
import type { Collector } from './types';

const HOME = 'https://www.tst.jus.br/noticias';
const isArticle = (u: URL) => u.hostname === 'www.tst.jus.br' && /^\/-\/[^/]+$/.test(u.pathname);
const isPage = (u: URL) => u.hostname === 'www.tst.jus.br' && u.pathname === '/noticias' && u.searchParams.has('p_p_id') && /_cur=\d+/.test(u.search);
const pageNumber = (u: string) => Number(u.match(/_cur=(\d+)/)?.[1] || 0);

export function parseTst(html: string) {
  return extractArticle(html, { containers: ['.news-body', '.materia'], dateText: '.date-info' });
}
export const tst: Collector = {
  source: 'tst', label: 'Tribunal Superior do Trabalho',
  async run({ db, full }) {
    let fetched = 0; let changed = 0;
    const first = await getText(HOME); fetched++;
    const queue = linksFrom(first, HOME, isArticle);
    if (full) {
      const pages = linksFrom(first, HOME, isPage).sort((a, b) => pageNumber(a) - pageNumber(b)).slice(1, 30);
      for (const page of pages) { queue.push(...linksFrom(await getText(page), page, isArticle)); fetched++; }
    }
    // Só baixa páginas novas: cada ciclo de 30 minutos custa uma página de índice e poucos artigos.
    const pending = [...new Set(queue)].filter(url => !hasDocument(db, url)).slice(0, full ? 300 : 25);
    for (const url of pending) {
      const article = parseTst(await getText(url)); fetched++;
      if (article.content.length < 80) continue;
      if (upsertDocument(db, { source: 'tst', url, title: article.title.replace(/ - TST$/, ''), content: article.content, publishedAt: article.publishedAt })) changed++;
    }
    return { fetched, changed };
  },
};
