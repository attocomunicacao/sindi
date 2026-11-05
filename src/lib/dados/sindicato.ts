import { load } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

/** Seções do site do SINDEPRESTEM, na ordem em que a SINDI as apresenta. */
export type Section = 'institucional' | 'juridico' | 'convencao' | 'cartilha' | 'contribuicao' | 'contato' | 'noticia' | 'artigo' | 'outro';
export const SITE = 'https://www.sindeprestem.com.br';
export const SECTION_NAMES: Record<Section, string> = { institucional: 'Institucional', juridico: 'Jurídico', convencao: 'Convenções coletivas', cartilha: 'Cartilhas', contribuicao: 'Contribuições e filiação', contato: 'Contato', noticia: 'Notícias', artigo: 'Artigos', outro: 'Outros' };

const PAGE_SECTIONS: Record<string, Section> = {
  '/institucional-do-sindeprestem-sindicat': 'institucional', '/conecta': 'institucional', '/juridico': 'juridico', '/convencoes-coletivas': 'convencao',
  '/cartilhas': 'cartilha', '/contribuicao-sindical': 'contribuicao', '/associe': 'contribuicao', '/contato': 'contato', '/artigos': 'artigo',
};
/** Artigos são assinados pelo presidente ("Por Vander Morales"); o restante dos posts é notícia. */
export function isArticle(title: string, content: string) {
  return /^artigo\b/i.test(title.trim()) || /\bPor Vander Morales\b/.test(content.slice(0, 900));
}
/** Seção de um documento do site pela URL (e, para posts, pelo texto). */
export function sectionFor(url: string, title: string, content: string): Section {
  const path = new URL(url).pathname.replace(/\/$/, '');
  if (PAGE_SECTIONS[path]) return PAGE_SECTIONS[path];
  if (path.startsWith('/post/')) return isArticle(title, content) ? 'artigo' : 'noticia';
  if (path === '/noticias' || path.startsWith('/noticias/')) return 'noticia';
  return 'outro';
}

export type Entry = { href: string; text: string; trail: string[] };
const MONTHS = /^(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)$/i;
/** Texto de link sem significado próprio: ano, mês ou "cct 2025"; o título usa então o cabeçalho do grupo. */
export const isBare = (text: string) => !text || MONTHS.test(text) || /^(cct\s*[-–]?\s*)?\d{4}([/-]\d{4})?$/i.test(text) || /^[​\s]*$/.test(text);

/**
 * Links de documentos (PDF/arquivos do site) na ordem da página, com os textos de cabeçalho que os precedem.
 * O site é montado em blocos sem estrutura semântica; a "trilha" são os últimos textos soltos antes do link.
 */
export function documentEntries(html: string): Entry[] {
  const $ = load(html);
  $('script,style,noscript,nav,header,footer,svg').remove();
  const entries: Entry[] = []; const trail: string[] = [];
  const body = $('body').get(0) as Element | undefined; if (!body) return entries;
  const clean = (text: string) => text.replace(/[​ ]/g, ' ').replace(/\s+/g, ' ').trim();
  const walk = (node: Element) => {
    for (const child of node.children as AnyNode[]) {
      if (child.type === 'tag' && child.name === 'a') {
        const href = child.attribs?.href ?? '';
        if (/\/_files\/ugd\/[^"]+\.pdf/i.test(href) || /\.pdf(\?|$)/i.test(href)) { entries.push({ href: new URL(href, SITE).href, text: clean($(child).text()), trail: trail.slice(-3) }); continue; }
      }
      if (child.type === 'tag') {
        const hasElement = (child.children as AnyNode[]).some((c: AnyNode) => c.type === 'tag' && !['br', 'span', 'strong', 'em', 'b', 'i', 'u', 'p'].includes(c.name));
        const text = clean($(child).text());
        if (!hasElement && !$(child).find('a[href]').length && text.length >= 3 && text.length <= 140 && !/^(ligar|e-?mail|whatsapp|menu|home)$/i.test(text) && trail.at(-1) !== text) { trail.push(text); continue; }
        walk(child);
      }
    }
  };
  walk(body);
  return entries;
}
const CATEGORIES: [string, RegExp][] = [['Poupatempo', /poupatempo/i], ['Portaria', /portaria|controle de acesso/i], ['Promoção e merchandising', /promo[cç][aã]o|merchandising/i], ['Leiturista', /leiturista|leitura\s+(de\s+)?[aá]gua/i],
  ['Promotores de crédito', /promotores?\s+de\s+cr[eé]dito/i], ['Bombeiros', /bombeiro/i], ['Geral', /\bgeral\b/i]];
/** Categoria da convenção: pelo título; se o título for genérico (errata, comunicado, "2025"), pelo início do texto do próprio documento. */
export function categoryOf(label: string, body = '') {
  const find = (text: string) => CATEGORIES.find(([, test]) => test.test(text))?.[0];
  return find(label) ?? find(body.slice(0, 800)) ?? 'Outras';
}
export const yearOf = (text: string) => { const years = text.match(/\b(19|20)\d{2}\b/g)?.map(Number) ?? []; return years.length ? Math.max(...years) : undefined; };
export const kindOf = (text: string) => /aditivo/i.test(text) ? 'Aditivo' : /errata/i.test(text) ? 'Errata' : /comunicado/i.test(text) ? 'Comunicado' : /conven[cç][aã]o|\bcct\b/i.test(text) ? 'Convenção coletiva' : 'Documento';

/** Título legível de um documento listado: o texto do link, ou o cabeçalho do grupo seguido do texto ("Aditivo à CCT Geral — 2025"). */
export function entryTitle(entry: Entry) {
  const header = [...entry.trail].reverse().find(t => !isBare(t) && !MONTHS.test(t) && !/^\d{4}$/.test(t)) ?? '';
  if (!isBare(entry.text)) return entry.text.replace(/\s+/g, ' ').trim();
  const bare = entry.text || '';
  const year = [...entry.trail].reverse().find(t => /^\d{4}$/.test(t));
  return [header, MONTHS.test(bare) && year ? `${bare} de ${year}` : bare].filter(Boolean).join(' — ') || '';
}
/** Título de uma cartilha a partir do início do texto do PDF (as páginas oficiais não rotulam os links). */
export function titleFromPdfText(text: string, fallback: string) {
  const lines = text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l && !/^--\s*\d+ of \d+\s*--$/.test(l) && !/^\|?\s*SINDEPRESTEM\s*\d*$/i.test(l));
  const head = lines.slice(0, 14);
  const named = head.findIndex(l => /\b(cartilha|guia|manual|trabalho tempor[aá]rio|terceiriza[cç][aã]o|nr-?1)\b/i.test(l) && l.length <= 90);
  if (named >= 0) return [head[named], head[named + 1] && head[named + 1].length <= 60 && head[named + 1] === head[named + 1].toUpperCase() ? head[named + 1] : ''].filter(Boolean).join(' ').slice(0, 120);
  return fallback;
}
/** Remove as marcas de página ("-- 3 of 34 --") que o extrator de PDF insere. */
export const cleanPdfText = (text: string) => text.replace(/^--\s*\d+ of \d+\s*--$/gm, '').replace(/\n{3,}/g, '\n\n').trim();

/** Identificação da norma ("DECRETO Nº 10.854/2021") no início do texto de um PDF jurídico. */
export function lawIdentifier(text: string) {
  const m = text.slice(0, 1500).match(/\b(DECRETO(?:-LEI)?|LEI(?: COMPLEMENTAR)?|PORTARIA|MEDIDA PROVIS[ÓO]RIA|RESOLU[ÇC][ÃA]O|INSTRU[ÇC][ÃA]O NORMATIVA)\s*(?:N[ºO°.]*\s*)?(\d[\d.]*(?:\s*\/\s*\d{2,4})?)/i);
  return m ? `${m[1].toUpperCase()} Nº ${m[2].replace(/\s+/g, '').replace(/\.$/, '')}` : undefined;
}
/** Título só com mês (e ano), sem nome da norma. */
export const isMonthOnly = (title: string) => /^(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(\s+de\s+\d{4})?$/i.test(title.trim());
