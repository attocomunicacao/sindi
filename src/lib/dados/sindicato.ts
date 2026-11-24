import { SITE } from '@/lib/base/constantes';
import { load } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

/** Seções do site do SINDEPRESTEM, na ordem em que a SINDI as apresenta. */
export type SecaoDoSite =
  'institucional' | 'juridico' | 'convencao' | 'cartilha' | 'contribuicao' | 'contato' | 'noticia' | 'artigo' | 'outro';

const SECOES_DAS_PAGINAS: Record<string, SecaoDoSite> = {
  '/institucional-do-sindeprestem-sindicat': 'institucional',
  '/conecta': 'institucional',
  '/juridico': 'juridico',
  '/convencoes-coletivas': 'convencao',
  '/cartilhas': 'cartilha',
  '/contribuicao-sindical': 'contribuicao',
  '/associe': 'contribuicao',
  '/contato': 'contato',
  '/artigos': 'artigo',
};
/** Artigos são assinados pelo presidente ("Por Vander Morales"); o restante dos posts é notícia. */
export function ehArtigo(titulo: string, conteudo: string) {
  return /^artigo\b/i.test(titulo.trim()) || /\bPor Vander Morales\b/.test(conteudo.slice(0, 900));
}
/** Seção de um documento do site pela URL (e, para posts, pelo texto). */
export function secaoDe(url: string, titulo: string, conteudo: string): SecaoDoSite {
  const caminho = new URL(url).pathname.replace(/\/$/, '');
  if (SECOES_DAS_PAGINAS[caminho]) return SECOES_DAS_PAGINAS[caminho];
  if (caminho.startsWith('/post/')) return ehArtigo(titulo, conteudo) ? 'artigo' : 'noticia';
  if (caminho === '/noticias' || caminho.startsWith('/noticias/')) return 'noticia';
  return 'outro';
}

export type EntradaDeDocumento = { href: string; text: string; trail: string[] };
const MESES = /^(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)$/i;
/** Texto de link sem significado próprio: ano, mês ou "cct 2025"; o título usa então o cabeçalho do grupo. */
export const semSignificado = (texto: string) =>
  !texto || MESES.test(texto) || /^(cct\s*[-–]?\s*)?\d{4}([/-]\d{4})?$/i.test(texto) || /^[​\s]*$/.test(texto);

/**
 * Links de documentos (PDF/arquivos do site) na ordem da página, com os textos de cabeçalho que os precedem.
 * O site é montado em blocos sem estrutura semântica; a "trilha" são os últimos textos soltos antes do link.
 */
export function entradasDeDocumentos(html: string): EntradaDeDocumento[] {
  const $ = load(html);
  $('script,style,noscript,nav,header,footer,svg').remove();
  const entradas: EntradaDeDocumento[] = [];
  const trilha: string[] = [];
  const corpo = $('body').get(0) as Element | undefined;
  if (!corpo) return entradas;
  const limpar = (texto: string) => texto.replace(/[​ ]/g, ' ').replace(/\s+/g, ' ').trim();
  const percorrer = (no: Element) => {
    for (const filho of no.children as AnyNode[]) {
      if (filho.type === 'tag' && filho.name === 'a') {
        const endereco = filho.attribs?.href ?? '';
        if (/\/_files\/ugd\/[^"]+\.pdf/i.test(endereco) || /\.pdf(\?|$)/i.test(endereco)) {
          entradas.push({ href: new URL(endereco, SITE).href, text: limpar($(filho).text()), trail: trilha.slice(-3) });
          continue;
        }
      }
      if (filho.type === 'tag') {
        const temElemento = (filho.children as AnyNode[]).some(
          (filhoDoFilho: AnyNode) =>
            filhoDoFilho.type === 'tag' &&
            !['br', 'span', 'strong', 'em', 'b', 'i', 'u', 'p'].includes(filhoDoFilho.name),
        );
        const texto = limpar($(filho).text());
        if (
          !temElemento &&
          !$(filho).find('a[href]').length &&
          texto.length >= 3 &&
          texto.length <= 140 &&
          !/^(ligar|e-?mail|whatsapp|menu|home)$/i.test(texto) &&
          trilha.at(-1) !== texto
        ) {
          trilha.push(texto);
          continue;
        }
        percorrer(filho);
      }
    }
  };
  percorrer(corpo);
  return entradas;
}
const CATEGORIAS: [string, RegExp][] = [
  ['Poupatempo', /poupatempo/i],
  ['Portaria', /portaria|controle de acesso/i],
  ['Promoção e merchandising', /promo[cç][aã]o|merchandising/i],
  ['Leiturista', /leiturista|leitura\s+(de\s+)?[aá]gua/i],
  ['Promotores de crédito', /promotores?\s+de\s+cr[eé]dito/i],
  ['Bombeiros', /bombeiro/i],
  ['Geral', /\bgeral\b/i],
];
/** Categoria da convenção: pelo título; se o título for genérico (errata, comunicado, "2025"), pelo início do texto do próprio documento. */
export function categoriaDe(rotulo: string, corpo = '') {
  const buscar = (texto: string) => CATEGORIAS.find(([, test]) => test.test(texto))?.[0];
  return buscar(rotulo) ?? buscar(corpo.slice(0, 800)) ?? 'Outras';
}
export const anoDe = (texto: string) => {
  const anos = texto.match(/\b(19|20)\d{2}\b/g)?.map(Number) ?? [];
  return anos.length ? Math.max(...anos) : undefined;
};
export const tipoDe = (texto: string) =>
  /aditivo/i.test(texto)
    ? 'Aditivo'
    : /errata/i.test(texto)
      ? 'Errata'
      : /comunicado/i.test(texto)
        ? 'Comunicado'
        : /conven[cç][aã]o|\bcct\b/i.test(texto)
          ? 'Convenção coletiva'
          : 'Documento';

/** Título legível de um documento listado: o texto do link, ou o cabeçalho do grupo seguido do texto ("Aditivo à CCT Geral — 2025"). */
export function tituloDaEntrada(entrada: EntradaDeDocumento) {
  const cabecalho =
    [...entrada.trail].reverse().find((t) => !semSignificado(t) && !MESES.test(t) && !/^\d{4}$/.test(t)) ?? '';
  if (!semSignificado(entrada.text)) return entrada.text.replace(/\s+/g, ' ').trim();
  const semTexto = entrada.text || '';
  const ano = [...entrada.trail].reverse().find((t) => /^\d{4}$/.test(t));
  return (
    [cabecalho, MESES.test(semTexto) && ano ? `${semTexto} de ${ano}` : semTexto].filter(Boolean).join(' — ') || ''
  );
}
/** Título de uma cartilha a partir do início do texto do PDF (as páginas oficiais não rotulam os links). */
export function tituloPeloTextoDoPdf(texto: string, alternativa: string) {
  const linhas = texto
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !/^--\s*\d+ of \d+\s*--$/.test(l) && !/^\|?\s*SINDEPRESTEM\s*\d*$/i.test(l));
  const inicio = linhas.slice(0, 14);
  const nomeado = inicio.findIndex(
    (l) => /\b(cartilha|guia|manual|trabalho tempor[aá]rio|terceiriza[cç][aã]o|nr-?1)\b/i.test(l) && l.length <= 90,
  );
  if (nomeado >= 0)
    return [
      inicio[nomeado],
      inicio[nomeado + 1] &&
      inicio[nomeado + 1].length <= 60 &&
      inicio[nomeado + 1] === inicio[nomeado + 1].toUpperCase()
        ? inicio[nomeado + 1]
        : '',
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 120);
  return alternativa;
}
/** Remove as marcas de página ("-- 3 of 34 --") que o extrator de PDF insere. */
export const limparTextoDePdf = (texto: string) =>
  texto
    .replace(/^--\s*\d+ of \d+\s*--$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Identificação da norma ("DECRETO Nº 10.854/2021") no início do texto de um PDF jurídico. */
export function identificadorDaNorma(texto: string) {
  const m = texto
    .slice(0, 1500)
    .match(
      /\b(DECRETO(?:-LEI)?|LEI(?: COMPLEMENTAR)?|PORTARIA|MEDIDA PROVIS[ÓO]RIA|RESOLU[ÇC][ÃA]O|INSTRU[ÇC][ÃA]O NORMATIVA)\s*(?:N[ºO°.]*\s*)?(\d[\d.]*(?:\s*\/\s*\d{2,4})?)/i,
    );
  return m ? `${m[1].toUpperCase()} Nº ${m[2].replace(/\s+/g, '').replace(/\.$/, '')}` : undefined;
}
/** Título só com mês (e ano), sem nome da norma. */
export const soTemMes = (titulo: string) =>
  /^(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(\s+de\s+\d{4})?$/i.test(
    titulo.trim(),
  );
