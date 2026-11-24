import { load } from 'cheerio';

const limpar = (texto: string) =>
  texto
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
const RECIPIENTES_DE_TEXTO = [
  'article',
  '.journal-content-article',
  '.entry-content',
  '.post-content',
  '[role="main"]',
  'main',
];

/** Aceita ISO ou o formato brasileiro (13/10/26, 13/10/2026). */
export function lerData(valor?: string) {
  if (!valor) return undefined;
  // O ano de quatro dígitos vem antes do de dois: com a ordem inversa, "13/11/2026" era lido como 2020.
  const dataBr = valor.match(/(\d{2})\/(\d{2})\/(\d{4}|\d{2})(?!\d)/);
  if (dataBr) {
    const ano = dataBr[3].length === 2 ? '20' + dataBr[3] : dataBr[3];
    const d = new Date(`${ano}-${dataBr[2]}-${dataBr[1]}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
/** Extrai título, data e texto visível de um artigo, sem scripts, menus nem formulários. */
export function extrairArtigo(html: string, opcoes: { containers?: string[]; dateText?: string } = {}) {
  const $ = load(html);
  const title = ($('meta[property="og:title"]').attr('content') || $('h1').first().text() || $('title').text())
    .replace(/\s+/g, ' ')
    .trim();
  let publicado =
    $('meta[property="article:published_time"]').attr('content') ||
    $('meta[name="date"]').attr('content') ||
    $('time[datetime]').first().attr('datetime');
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const objeto = JSON.parse($(el).text());
      for (const no of Array.isArray(objeto) ? objeto : objeto['@graph'] || [objeto])
        if (!publicado && no?.datePublished) publicado = no.datePublished;
    } catch {
      /* Dados estruturados malformados são ignorados. */
    }
  });
  if (!publicado && opcoes.dateText) publicado = $(opcoes.dateText).first().text();
  $(
    'script,style,noscript,nav,header,footer,form,button,svg,iframe,[role="navigation"],[hidden],[aria-hidden="true"],.menu,.share,.breadcrumb',
  ).remove();
  $('br').replaceWith('\n');
  $('p,h1,h2,h3,h4,li,section,div,tr').append('\n');
  let conteudo = '';
  for (const seletor of [...(opcoes.containers ?? []), ...RECIPIENTES_DE_TEXTO]) {
    const texto = limpar($(seletor).first().text());
    if (texto.length > 200) {
      conteudo = texto;
      break;
    }
  }
  if (!conteudo) conteudo = limpar($('body').text());
  const dataLida = lerData(publicado);
  return { title, content: conteudo, publishedAt: dataLida };
}
/** Links absolutos e únicos, filtrados por uma função de validação. */
export function linksDe(html: string, base: string, aceitar: (url: URL) => boolean) {
  const $ = load(html);
  const saida = new Set<string>();
  $('a[href]').each((_, el) => {
    try {
      const u = new URL($(el).attr('href') || '', base);
      u.hash = '';
      if (aceitar(u)) saida.add(u.href);
    } catch {
      /* ignora */
    }
  });
  return [...saida];
}
export function entradasDoSitemap(xml: string) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)]
    .map((m) => ({
      url: m[1].match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim() || '',
      lastmod: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] || '',
    }))
    .filter((e) => e.url)
    .sort((a, b) => b.lastmod.localeCompare(a.lastmod));
}
