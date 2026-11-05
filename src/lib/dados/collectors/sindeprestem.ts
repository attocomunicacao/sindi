import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { due, setState, upsertDocument, type Db } from '../db';
import { getText, politeFetch } from '../http';
import { pdfToText } from '../legal';
import { SITE, categoryOf, cleanPdfText, documentEntries, entryTitle, kindOf, isMonthOnly, lawIdentifier, sectionFor, titleFromPdfText, yearOf, type Section } from '../sindicato';
import type { KnowledgeSnapshot } from '../../knowledge/core';
import type { Collector } from './types';

const MAX_PDF_BYTES = 80 * 1024 * 1024;
const HOURS = 60 * 60 * 1000;
/** Páginas que listam documentos (PDF) sem rotular os links por nome de arquivo. */
export const DOCUMENT_PAGES: { path: string; section: Section }[] = [{ path: '/convencoes-coletivas', section: 'convencao' }, { path: '/juridico', section: 'juridico' }, { path: '/cartilhas', section: 'cartilha' }];

const metaOf = (db: Db, url: string): Record<string, unknown> | undefined => {
  const row = db.prepare('SELECT meta FROM documents WHERE url = ?').get(url) as { meta: string | null } | undefined;
  try { return row?.meta ? JSON.parse(row.meta) : undefined; } catch { return undefined; }
};
async function downloadPdf(href: string) {
  const response = await politeFetch(href, { minMs: 800 });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (Number(response.headers.get('content-length') || 0) > MAX_PDF_BYTES) throw new Error('PDF grande demais');
  return cleanPdfText(await pdfToText(new Uint8Array(await response.arrayBuffer())));
}
const NO_TEXT = 'PDF digitalizado sem texto extraível (reconhecimento óptico pendente). Consulte o documento pelo link.';

/**
 * Rotula os PDFs do site com o título que a página oficial lhes dá (convenção, aditivo, lei, cartilha...), baixando os que ainda não estão na base.
 * Uma vez rotulado, o documento não é sobrescrito pela cópia do coletor de conhecimento (que só conhece o nome do arquivo).
 */
export async function labelDocuments(db: Db) {
  let fetched = 0; let changed = 0;
  for (const page of DOCUMENT_PAGES) {
    const pageUrl = SITE + page.path;
    const entries = [...new Map(documentEntries(await getText(pageUrl)).map(e => [e.href, e])).values()]; fetched++;
    const prepared: { entry: (typeof entries)[number]; label: string; body: string; meta: Record<string, unknown> }[] = [];
    for (const entry of entries) {
      const existing = db.prepare('SELECT content FROM documents WHERE url = ?').get(entry.href) as { content: string } | undefined;
      let content = existing?.content ? cleanPdfText(existing.content) : undefined;
      if (content === undefined) {
        try { content = await downloadPdf(entry.href); fetched++; } catch { content = ''; }
      }
      const body = content.replace(/\s+/g, '').length > 80 ? content : NO_TEXT;
      // As páginas de cartilhas não rotulam os links: o título vem do início do texto do PDF.
      let title = page.section === 'cartilha' ? '' : entryTitle(entry);
      if (!title) title = titleFromPdfText(body, `Cartilha do SINDEPRESTEM (${entry.href.slice(-10, -4)})`);
      // Edições mensais sem nome da norma ("abril de 2024") ganham a identificação lida no próprio PDF.
      if (page.section === 'juridico' && (isMonthOnly(title) || !/(decreto|lei|medida|portaria|resolu|instru)/i.test(title))) { const law = lawIdentifier(body); if (law) title = `${law} — ${title}`; }
      const region = entry.trail.some(t => /jundia[ií]/i.test(t)) && page.section === 'convencao' ? 'Jundiaí' : page.section === 'convencao' ? 'São Paulo' : undefined;
      const category = page.section === 'convencao' ? categoryOf(title, body) : undefined;
      // Títulos genéricos ("ERRATA", "cct 2025") ganham a categoria identificada no próprio documento.
      const generic = category && category !== 'Outras' && !new RegExp(category.split(' ')[0], 'i').test(title);
      const label = `${title}${generic ? ` — ${category}` : ''}${region === 'Jundiaí' ? ' (Jundiaí)' : ''}`;
      const meta: Record<string, unknown> = { kind: 'pdf', section: page.section, labeled: true, page: pageUrl, context: entry.trail, ...(page.section === 'convencao' ? { category, year: yearOf(label), type: kindOf(label), region } : {}) };
      if (page.section === 'juridico') Object.assign(meta, { year: yearOf(label) });
      prepared.push({ entry, label, body, meta });
    }
    // Documentos com título idêntico (vários "COMUNICADO CONJUNTO - 2026") recebem o código do arquivo para serem distinguíveis.
    const repeated = new Set(prepared.map(p => p.label).filter((label, i, all) => all.indexOf(label) !== i));
    for (const item of prepared) {
      const title = repeated.has(item.label) ? `${item.label} [arquivo ${item.entry.href.slice(-10, -4)}]` : item.label;
      if (upsertDocument(db, { source: 'sindeprestem', url: item.entry.href, title, content: item.body, meta: item.meta })) changed++;
    }
  }
  return { fetched, changed };
}

/**
 * O site do SINDEPRESTEM já é lido pelo coletor de conhecimento (knowledge:sync, a cada 15 min, com robots.txt e limites próprios).
 * Aqui os documentos ativos são copiados para o mesmo arquivo de dados, classificados por seção, e os PDFs recebem o título oficial.
 */
export const sindeprestem: Collector = {
  source: 'sindeprestem', label: 'SINDEPRESTEM',
  async run({ db, full }) {
    const snapshot: KnowledgeSnapshot = JSON.parse(await readFile(path.join(process.cwd(), '.data/knowledge/current.json'), 'utf8'));
    let fetched = 0; let changed = 0;
    db.exec('BEGIN');
    try {
      for (const d of snapshot.documents) {
        if (d.status !== 'active') continue; fetched++;
        if (metaOf(db, d.url)?.labeled) continue;
        const content = d.kind === 'pdf' ? cleanPdfText(d.content) : d.content;
        const section = d.kind === 'pdf' ? 'outro' : sectionFor(d.url, d.title, content);
        const listing = /\/noticias(\/|$)/.test(new URL(d.url).pathname);
        if (upsertDocument(db, { source: 'sindeprestem', url: d.url, title: d.title, content, publishedAt: d.publishedAt, meta: { kind: d.kind, section, ...(listing ? { listing: true } : {}) } }, d.fetchedAt)) changed++;
      }
      db.exec('COMMIT');
    } catch (cause) { db.exec('ROLLBACK'); throw cause; }
    if (due(db, 'sindeprestem:labels', 6 * HOURS, full)) {
      const labeled = await labelDocuments(db); fetched += labeled.fetched; changed += labeled.changed;
      setState(db, 'sindeprestem:labels', new Date().toISOString());
    }
    return { fetched, changed };
  },
};
