import { load } from 'cheerio';
import { PDFParse } from 'pdf-parse';

export type Article = { key: string; label: string; content: string };

/**
 * Decodifica bytes de uma página: UTF-8 estrito primeiro; se houver bytes inválidos, usa o charset declarado
 * (o Planalto serve windows-1252 e a declaração nem sempre é confiável).
 */
export function decodeHtml(bytes: Uint8Array, contentType = '') {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { /* não é UTF-8 */ }
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
  const declared = contentType.match(/charset=([\w-]+)/i)?.[1] || head.match(/charset=["']?([\w-]+)/i)?.[1] || 'windows-1252';
  const charset = /utf-?8/i.test(declared) ? 'windows-1252' : declared;
  try { return new TextDecoder(charset).decode(bytes); } catch { return new TextDecoder('windows-1252').decode(bytes); }
}
/** Texto corrido de uma página HTML legislativa, uma linha por parágrafo/inciso. */
export function htmlToLines(html: string) {
  const $ = load(html);
  $('script,style,noscript').remove();
  $('br').replaceWith('\n'); $('p,li,tr,h1,h2,h3,h4,div,blockquote').append('\n');
  return $('body').text().replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
}
export async function pdfToText(data: Uint8Array) {
  const parser = new PDFParse({ data });
  try { return (await parser.getText()).text.replace(/[ \t ]+/g, ' ').replace(/-\n(?=\p{Ll})/gu, '').trim(); } finally { await parser.destroy(); }
}

const START = /^Art\.\s*(\d{1,4})\s*(?:[º°o.]|\s)?\s*(?:-\s*([A-Z]{1,2})\b)?/;
// Só o título em maiúsculas (o sumário e as remissões usam "Ato das Disposições...").
const ADCT = /^ATO DAS DISPOSI[ÇC][ÕO]ES CONSTITUCIONAIS TRANSIT[ÓO]RIAS\s*$/;
/**
 * Divide um texto legal em artigos. Cada "Art. N" no início de linha abre um artigo; só a primeira ocorrência de cada
 * número é mantida (remissões a outros artigos não começam linha). O ADCT recebe prefixo próprio porque reinicia a numeração.
 */
export function splitArticles(text: string, options: { adct?: boolean; maxChars?: number } = {}): Article[] {
  const maxChars = options.maxChars ?? 12000;
  const result: Article[] = []; const seen = new Set<string>();
  let current: { key: string; label: string; lines: string[] } | undefined; let inAdct = false;
  const flush = () => { if (current) result.push({ key: current.key, label: current.label, content: current.lines.join('\n').slice(0, maxChars).trim() }); current = undefined; };
  for (const line of text.split('\n')) {
    if (options.adct && ADCT.test(line)) { flush(); inAdct = true; continue; }
    const match = line.match(START);
    if (match) {
      const number = match[1] + (match[2] ? `-${match[2]}` : '');
      const key = (inAdct ? 'adct-' : '') + number;
      if (!seen.has(key)) { flush(); seen.add(key); current = { key, label: `${inAdct ? 'ADCT, ' : ''}Art. ${number}${/^\d$/.test(match[1]) && !match[2] ? 'º' : ''}`, lines: [line] }; continue; }
    }
    current?.lines.push(line);
  }
  flush();
  return result.filter(a => a.content.length > 20);
}
