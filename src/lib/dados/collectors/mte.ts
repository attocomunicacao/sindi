import { enqueue, hasDocument, markFetched, nextQueued, upsertDocument } from '../db';
import { extractArticle, linksFrom } from '../html';
import { getText, politeFetch } from '../http';
import { pdfToText } from '../legal';
import type { Collector } from './types';

const ROOT = 'https://www.gov.br/trabalho-e-emprego/pt-br';
const NEWS = `${ROOT}/noticias-e-conteudo`;
const SUBJECTS = `${ROOT}/assuntos`;

/** Seções rastreadas: assuntos do Ministério e a Comissão Tripartite Paritária Permanente, onde ficam as Normas Regulamentadoras. */
const SUBJECT_PREFIXES = ['/trabalho-e-emprego/pt-br/assuntos', '/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente'];
export const isNewsArticle = (u: URL) => u.hostname === 'www.gov.br' && /^\/trabalho-e-emprego\/pt-br\/noticias-e-conteudo\/\d{4}\/[a-zç]+\/[^/]+$/i.test(u.pathname);
/** Páginas de conteúdo do portal (assuntos, normas, serviços); sem arquivos, buscas nem parâmetros. */
export function isSubjectPage(u: URL) {
  return u.hostname === 'www.gov.br' && SUBJECT_PREFIXES.some(prefix => u.pathname.startsWith(prefix)) && !/\.(pdf|docx?|xlsx?|zip|png|jpe?g|gif|svg|mp4|csv|odt)(\/|$)/i.test(u.pathname) && !/\/(view|download|image_view|at_download|@@images)(\/|$)|\/img\//i.test(u.pathname) && !u.search;
}
const cleanUrl = (u: URL) => { u.search = ''; u.hash = ''; return u.href.replace(/\/$/, ''); };
export function parseGovBr(html: string) {
  const article = extractArticle(html, { containers: ['#content-core', '#parent-fieldname-text', '.documentContent', '#content'] });
  return { ...article, title: article.title.replace(/\s*[—–|-]\s*Minist[ée]rio do Trabalho e Emprego\s*$/i, '').trim() };
}
const DAY = 24 * 60 * 60 * 1000;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
/** Algumas páginas do portal (como a NR-1) entregam diretamente um PDF: o texto é extraído em vez de tratar os bytes como HTML. */
export async function fetchPage(url: string): Promise<{ html?: string; pdfText?: string }> {
  const response = await politeFetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${new URL(url).host}`);
  if (/application\/pdf/i.test(response.headers.get('content-type') ?? '')) {
    if (Number(response.headers.get('content-length') || 0) > MAX_PDF_BYTES) throw new Error('PDF grande demais');
    return { pdfText: (await pdfToText(new Uint8Array(await response.arrayBuffer()))).slice(0, 400000) };
  }
  return { html: await response.text() };
}
/** Título legível a partir do endereço de uma NR ("norma-regulamentadora-no-01-nr-01" vira "Norma Regulamentadora No. 1 (NR-1)"). */
export function titleFromSlug(url: string) {
  const slug = new URL(url).pathname.split('/').pop() ?? '';
  const nr = slug.match(/norma-regulamentadora-no-0*(\d+)-nr/);
  return nr ? `Norma Regulamentadora No. ${nr[1]} (NR-${nr[1]})` : slug.replace(/-/g, ' ');
}

/**
 * Portal do Ministério do Trabalho e Emprego. Notícias: páginas de listagem e artigos novos a cada ciclo.
 * Assuntos (NRs, normas, serviços): rastreamento gradual por fila, poucas páginas por ciclo, revisadas a cada 7 dias.
 */
export const mte: Collector = {
  source: 'mte', label: 'Ministério do Trabalho e Emprego',
  async run({ db, full }) {
    let fetched = 0; let changed = 0;
    const news: string[] = [];
    for (let page = 0; page < (full ? 30 : 1); page++) {
      const html = await getText(page ? `${NEWS}?b_start:int=${page * 30}` : NEWS); fetched++;
      const found = linksFrom(html, NEWS, isNewsArticle); if (!found.length) break;
      news.push(...found);
    }
    for (const url of [...new Set(news)].filter(u => !hasDocument(db, u)).slice(0, full ? 400 : 20)) {
      const article = parseGovBr(await getText(url)); fetched++;
      if (article.content.length < 100) continue;
      if (upsertDocument(db, { source: 'mte', url, title: article.title, content: article.content, publishedAt: article.publishedAt, meta: { kind: 'noticia' } })) changed++;
    }
    enqueue(db, 'mte', [SUBJECTS, `${ROOT}/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras`]);
    const stale = new Date(Date.now() - 7 * DAY).toISOString();
    // Orçamento de páginas por ciclo; as páginas descobertas durante o ciclo entram na fila e são lidas no mesmo ciclo enquanto houver orçamento.
    let budget = full ? 400 : 12; let failures = 0;
    while (budget > 0) {
      const batch = nextQueued(db, 'mte', Math.min(budget, 25), stale);
      if (!batch.length) break;
      budget -= batch.length;
      for (const url of batch) {
        let page: { html?: string; pdfText?: string };
        try { page = await fetchPage(url); fetched++; failures = 0; }
        catch (cause) {
          // Falha isolada de uma página (rede, 404) não derruba o rastreamento; a página volta à fila em 7 dias. Falhas seguidas indicam bloqueio ou queda.
          markFetched(db, url);
          if (++failures >= 8) throw cause;
          continue;
        }
        markFetched(db, url);
        try {
          if (page.pdfText !== undefined) {
            if (page.pdfText.length > 150 && upsertDocument(db, { source: 'mte', url, title: titleFromSlug(url), content: page.pdfText, meta: { kind: 'assunto', format: 'pdf' } })) changed++;
            continue;
          }
          enqueue(db, 'mte', linksFrom(page.html!, url, isSubjectPage).map(l => cleanUrl(new URL(l))));
          const parsed = parseGovBr(page.html!);
          if (parsed.content.length < 150) continue;
          if (upsertDocument(db, { source: 'mte', url, title: parsed.title, content: parsed.content, publishedAt: parsed.publishedAt, meta: { kind: 'assunto' } })) changed++;
        } catch { /* uma página que não pode ser lida não interrompe o rastreamento */ }
      }
    }
    return { fetched, changed };
  },
};
