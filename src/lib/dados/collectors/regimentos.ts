import { load } from 'cheerio';
import { deleteMissing, due, getState, setState, upsertDocument, type Db } from '../db';
import { getText, politeFetch } from '../http';
import { pdfToText, splitArticles } from '../legal';
import type { Collector } from './types';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const MAX_PDF_BYTES = 40 * 1024 * 1024;
type Regiment = { key: string; name: string; page: string; pick: (links: { text: string; href: string }[]) => { text: string; href: string }[] };
const pdfs = (links: { text: string; href: string }[]) => links.filter(l => /\.pdf(\/|$|\?)/i.test(l.href));

/**
 * Os PDFs oficiais mudam de nome a cada atualização; por isso o link é lido da página oficial de cada casa.
 * Câmara: portal www2 (sem restrição a robôs). Senado e Congresso: página oficial do Regimento no portal do Senado.
 */
export const REGIMENTS: Regiment[] = [
  { key: 'ricd', name: 'Regimento Interno da Câmara dos Deputados', page: 'https://www2.camara.leg.br/atividade-legislativa/legislacao/regimento-interno-da-camara-dos-deputados',
    pick: links => pdfs(links).filter(l => /RICD/i.test(l.href)).slice(0, 1) },
  { key: 'risf', name: 'Regimento Interno do Senado Federal', page: 'https://www25.senado.leg.br/web/atividade/legislacao/regimento-interno',
    pick: links => pdfs(links).filter(l => /RISF/i.test(l.href)) },
  { key: 'rccn', name: 'Regimento Comum do Congresso Nacional', page: 'https://www25.senado.leg.br/web/atividade/legislacao/regimento-interno',
    pick: links => pdfs(links).filter(l => /RCCN/i.test(l.href)).slice(0, 1) },
];
export function pdfLinks(html: string, base: string) {
  const $ = load(html); const out: { text: string; href: string }[] = [];
  $('a[href]').each((_, el) => { try { out.push({ text: $(el).text().replace(/\s+/g, ' ').trim(), href: new URL($(el).attr('href') || '', base).href }); } catch { /* ignora */ } });
  return out;
}
async function ingest(db: Db, regiment: Regiment, href: string, index: number, force: boolean) {
  const stateKey = `regimento:${regiment.key}:${index}`;
  const previous = getState(db, stateKey)?.value;
  const response = await politeFetch(href, { headers: previous && !force ? { 'If-None-Match': previous.split('|')[0] || '', 'If-Modified-Since': previous.split('|')[1] || '' } : {} });
  if (response.status === 304) return { fetched: 1, changed: 0 };
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${new URL(href).host}`);
  if (Number(response.headers.get('content-length') || 0) > MAX_PDF_BYTES) throw new Error('PDF grande demais');
  const text = await pdfToText(new Uint8Array(await response.arrayBuffer()));
  const articles = splitArticles(text, { maxChars: 8000 });
  // Partes secundárias (anexos, índices de normas conexas) podem não ter artigos; só a principal precisa estar completa.
  if (articles.length < 30) { if (index === 0) throw new Error(`Extração suspeita em ${regiment.key}: ${articles.length} artigos`); return { fetched: 1, changed: 0 }; }
  const volume = index > 0 ? ` (parte ${index + 1})` : '';
  let changed = 0;
  for (const a of articles) {
    if (upsertDocument(db, { source: 'regimentos', url: `${href}#${a.key}`, title: `${regiment.name}${volume} — ${a.label}`, content: a.content, meta: { regiment: regiment.key } })) changed++;
  }
  deleteMissing(db, 'regimentos', href + '#', new Set(articles.map(a => `${href}#${a.key}`)));
  setState(db, stateKey, `${response.headers.get('etag') ?? ''}|${response.headers.get('last-modified') ?? ''}`);
  return { fetched: 1, changed };
}
export const regimentos: Collector = {
  source: 'regimentos', label: 'Regimentos (Câmara, Senado, Congresso)',
  async run({ db, full }) {
    let fetched = 0; let changed = 0; const pages = new Map<string, string>();
    for (const regiment of REGIMENTS) {
      if (!due(db, `regimento:${regiment.key}:check`, WEEK, full)) continue;
      if (!pages.has(regiment.page)) { pages.set(regiment.page, await getText(regiment.page, { minMs: 1000 })); fetched++; }
      const links = regiment.pick(pdfLinks(pages.get(regiment.page)!, regiment.page));
      if (!links.length) throw new Error(`PDF de ${regiment.key} não encontrado na página oficial`);
      for (const [index, link] of links.entries()) { const r = await ingest(db, regiment, link.href, index, full); fetched += r.fetched; changed += r.changed; }
      setState(db, `regimento:${regiment.key}:check`, new Date().toISOString());
    }
    return { fetched, changed };
  },
};
