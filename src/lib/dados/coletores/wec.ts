import { getText } from '@/lib/dados/http';
import { extractArticle, sitemapEntries } from '@/lib/dados/html';
import { upsertDocument } from '@/lib/dados/db';
import type { Coletor } from '@/lib/dados/coletores/tipos';

/** World Employment Confederation: um sitemap por tipo de conteúdo (WordPress/Yoast). */
export const WEC_SITEMAPS = ['news', 'press_release', 'publication', 'event', 'opinion_piece'];

export const wec: Coletor = {
  source: 'wec', label: 'World Employment Confederation',
  async run({ db, full }) {
    let fetched = 0; let changed = 0;
    for (const type of WEC_SITEMAPS) {
      const entries = sitemapEntries(await getText(`https://wecglobal.org/${type}-sitemap.xml`)); fetched++;
      const known = new Map((db.prepare("SELECT url, fetched_at FROM documents WHERE source = 'wec'").all() as { url: string; fetched_at: string }[]).map(r => [r.url, r.fetched_at]));
      // Baixa páginas novas ou alteradas desde a última coleta, das mais recentes para as mais antigas.
      const pending = entries.filter(e => !known.has(e.url) || (e.lastmod && e.lastmod > known.get(e.url)!)).slice(0, full ? 150 : 15);
      for (const entry of pending) {
        const response = await getText(entry.url); fetched++;
        const article = extractArticle(response);
        if (article.content.length < 80) continue;
        if (upsertDocument(db, { source: 'wec', url: entry.url, title: article.title.replace(/^World Employment Confederation\s*[-–|]\s*/, ''), content: article.content, publishedAt: article.publishedAt ?? (entry.lastmod || undefined), meta: { type } })) changed++;
      }
    }
    return { fetched, changed };
  },
};
