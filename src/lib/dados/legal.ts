import { load } from 'cheerio';
import { PDFParse } from 'pdf-parse';

export type Artigo = { key: string; label: string; content: string };

/**
 * Decodifica bytes de uma página: UTF-8 estrito primeiro; se houver bytes inválidos, usa o charset declarado
 * (o Planalto serve windows-1252 e a declaração nem sempre é confiável).
 */
export function decodificarHtml(bytes: Uint8Array, tipoDeConteudo = '') {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    /* não é UTF-8 */
  }
  const cabecalho = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
  const declarado =
    tipoDeConteudo.match(/charset=([\w-]+)/i)?.[1] || cabecalho.match(/charset=["']?([\w-]+)/i)?.[1] || 'windows-1252';
  const charset = /utf-?8/i.test(declarado) ? 'windows-1252' : declarado;
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
/** Texto corrido de uma página HTML legislativa, uma linha por parágrafo/inciso. */
export function htmlParaLinhas(html: string, { semRiscado = false }: { semRiscado?: boolean } = {}) {
  const $ = load(html);
  $('script,style,noscript').remove();
  // Texto compilado do Planalto mantém a redação antiga RISCADA ao lado da vigente. Sem tirá-la, o artigo traria as duas versões lado a lado,
  // e a SINDI poderia citar como vigente um texto já revogado.
  if (semRiscado) $('strike,s,del,[style*="line-through"]').remove();
  $('br').replaceWith('\n');
  $('p,li,tr,h1,h2,h3,h4,div,blockquote').append('\n');
  return $('body')
    .text()
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
/** Texto de um PDF, com teto de páginas e de tempo: um PDF patológico não trava a coleta. */
export async function pdfParaTexto(
  dados: Uint8Array,
  { paginas = 400, limiteMs = 90_000 }: { paginas?: number; limiteMs?: number } = {},
) {
  const leitor = new PDFParse({ data: dados });
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rejeitar) => {
    relogio = setTimeout(() => rejeitar(new Error('PDF demorou demais para ser lido')), limiteMs);
  });
  try {
    return (await Promise.race([leitor.getText({ first: paginas }), limite])).text
      .replace(/[ \t ]+/g, ' ')
      .replace(/-\n(?=\p{Ll})/gu, '')
      .trim();
  } finally {
    clearTimeout(relogio);
    await leitor.destroy().catch(() => {});
  }
}

// A letra do artigo ("Art. 5º-A") vem colada ao hífen. Com espaço ("Art. 5º - A lei...") é o hífen de pontuação do texto antigo e a
// letra já é a primeira palavra do caput; lê-la como sufixo transformava "Art. 5º - O trabalho" em "5-O".
const INICIO_DE_ARTIGO = /^Art\.\s*(\d{1,4})\s*(?:[º°o.]|\s)?\s*(?:-([A-Z]{1,2})\b)?/;
// Só o título em maiúsculas (o sumário e as remissões usam "Ato das Disposições...").
const ADCT = /^ATO DAS DISPOSI[ÇC][ÕO]ES CONSTITUCIONAIS TRANSIT[ÓO]RIAS\s*$/;
/**
 * Divide um texto legal em artigos. Cada "Art. N" no início de linha abre um artigo; só a primeira ocorrência de cada
 * número é mantida (remissões a outros artigos não começam linha). O ADCT recebe prefixo próprio porque reinicia a numeração.
 */
export function dividirArtigos(
  texto: string,
  opcoes: { adct?: boolean; maxChars?: number; sequencial?: boolean } = {},
): Artigo[] {
  const maximoDeCaracteres = opcoes.maxChars ?? 12000;
  const resultado: Artigo[] = [];
  const vistos = new Set<string>();
  let atual: { key: string; label: string; lines: string[] } | undefined;
  let noAdct = false;
  let ultimoNumero = 0;
  const fechar = () => {
    if (atual)
      resultado.push({
        key: atual.key,
        label: atual.label,
        content: atual.lines.join('\n').slice(0, maximoDeCaracteres).trim(),
      });
    atual = undefined;
  };
  for (const line of texto.split('\n')) {
    if (opcoes.adct && ADCT.test(line)) {
      fechar();
      noAdct = true;
      continue;
    }
    const achado = line.match(INICIO_DE_ARTIGO);
    if (achado) {
      const numero = achado[1] + (achado[2] ? `-${achado[2]}` : '');
      const chave = (noAdct ? 'adct-' : '') + numero;
      // Lei que altera outra cita, no corpo do próprio artigo, os artigos da norma alterada ("Art. 11-A. ..."). No modo sequencial só abre
      // artigo novo o próximo número da própria lei (1, 2, 3...); o resto é o texto do artigo em curso. Tolera um buraco de até 2 números (artigo
      // revogado e removido do texto compilado): sem isso, todos os artigos seguintes seriam engolidos pelo anterior, em silêncio. Citação de artigo
      // da lei alterada ("Art. 59", "Art. 134") fica muito além dessa janela.
      const n = Number(achado[1]);
      const abre = opcoes.sequencial ? !achado[2] && n > ultimoNumero && n <= ultimoNumero + 3 : !vistos.has(chave);
      if (abre) {
        ultimoNumero = Number(achado[1]);
        fechar();
        vistos.add(chave);
        atual = {
          key: chave,
          // Ordinal só até o 9, como no texto legal: "Art. 5º", "Art. 5º-A", "Art. 10", "Art. 10-A".
          label: `${noAdct ? 'ADCT, ' : ''}Art. ${achado[1]}${/^\d$/.test(achado[1]) ? 'º' : ''}${achado[2] ? `-${achado[2]}` : ''}`,
          lines: [line],
        };
        continue;
      }
    }
    atual?.lines.push(line);
  }
  fechar();
  return resultado.filter((a) => a.content.length > 20);
}

/**
 * Junta as quebras de linha que o HTML do Planalto faz no meio da frase: a linha seguinte que começa em minúscula (e não é alínea "a)")
 * continua a anterior, e "§" ou "Art." sozinhos na ponta da linha colam no que vem depois. Só espaço em branco muda; nenhuma palavra.
 */
export function juntarQuebras(texto: string) {
  const saida: string[] = [];
  for (const linha of texto.split('\n')) {
    const anterior = saida.at(-1);
    const continua = /^\p{Ll}/u.test(linha) && !/^\p{Ll}\)/u.test(linha);
    if (anterior !== undefined && (continua || /(?:§|§§|Art\.)$/.test(anterior)))
      saida[saida.length - 1] = `${anterior} ${linha}`;
    else saida.push(linha);
  }
  return saida.join('\n');
}
