import { load } from 'cheerio';

const clean = (text: string) => text.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const CONTAINERS = ['article', '.journal-content-article', '.entry-content', '.post-content', '[role="main"]', 'main'];

/** Aceita ISO ou o formato brasileiro (13/10/26, 13/10/2026). */
export function parseDate(value?: string) {
  if (!value) return undefined;
  const br = value.match(/(\d{2})\/(\d{2})\/(\d{2}|\d{4})/);
  if (br) { const year = br[3].length === 2 ? '20' + br[3] : br[3]; const d = new Date(`${year}-${br[2]}-${br[1]}T12:00:00Z`); return Number.isNaN(d.getTime()) ? undefined : d.toISOString(); }
  const d = new Date(value); return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
/** Extrai título, data e texto visível de um artigo, sem scripts, menus nem formulários. */
export function extractArticle(html: string, options: { containers?: string[]; dateText?: string } = {}) {
  const $ = load(html);
  const title = ($('meta[property="og:title"]').attr('content') || $('h1').first().text() || $('title').text()).replace(/\s+/g, ' ').trim();
  let published = $('meta[property="article:published_time"]').attr('content') || $('meta[name="date"]').attr('content') || $('time[datetime]').first().attr('datetime');
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const obj = JSON.parse($(el).text());
      for (const node of Array.isArray(obj) ? obj : obj['@graph'] || [obj]) if (!published && node?.datePublished) published = node.datePublished;
    } catch { /* Dados estruturados malformados são ignorados. */ }
  });
  if (!published && options.dateText) published = $(options.dateText).first().text();
  $('script,style,noscript,nav,header,footer,form,button,svg,iframe,[role="navigation"],[hidden],[aria-hidden="true"],.menu,.share,.breadcrumb').remove();
  $('br').replaceWith('\n'); $('p,h1,h2,h3,h4,li,section,div,tr').append('\n');
  let content = '';
  for (const selector of [...(options.containers ?? []), ...CONTAINERS]) { const text = clean($(selector).first().text()); if (text.length > 200) { content = text; break; } }
  if (!content) content = clean($('body').text());
  const time = parseDate(published);
  return { title, content, publishedAt: time };
}
/** Links absolutos e únicos, filtrados por uma função de validação. */
export function linksFrom(html: string, base: string, accept: (url: URL) => boolean) {
  const $ = load(html); const out = new Set<string>();
  $('a[href]').each((_, el) => { try { const u = new URL($(el).attr('href') || '', base); u.hash = ''; if (accept(u)) out.add(u.href); } catch { /* ignora */ } });
  return [...out];
}
export function sitemapEntries(xml: string) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => ({ url: m[1].match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim() || '', lastmod: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] || '' }))
    .filter(e => e.url).sort((a, b) => b.lastmod.localeCompare(a.lastmod));
}
