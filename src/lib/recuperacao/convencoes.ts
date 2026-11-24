import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { SITE } from '@/lib/base/constantes';
import type { PassagemFixa, TrechosDeDocumentos } from '@/lib/base/tipos';
import { normalizar } from '@/lib/base/texto';
import { caminhoDoBanco } from '@/lib/dados/db';
import { CATEGORIAS_DE_CONVENCAO } from '@/lib/recuperacao/intencao';
import { PALAVRAS_VAZIAS_DA_PERGUNTA } from '@/lib/recuperacao/termos-de-documento';

const SINONIMOS: Record<string, string[]> = {
  piso: ['piso salarial', 'salario normativo', 'salario base', 'salarios'],
  reajuste: ['reajuste', 'correcao salarial', 'data-base', 'data base'],
  vale: ['vale refeicao', 'vale alimentacao', 'tickets', 'cesta basica'],
};
const QUEBRA_DE_LINHA = String.fromCharCode(10);
type Convencao = {
  title: string;
  url: string;
  content: string;
  fetchedAt: string;
  category: string | null;
  year: number | null;
  type: string | null;
};
type Janela = { score: number; at: number };
/** O que a pergunta pede: palavras-chave da cláusula (com sinônimos) e, sem categoria citada, o cargo que precisa aparecer no trecho. */
type TermosDaClausula = { termos: string[]; frases: string[]; chaves: string[]; cargo: string[] };

function termosDaClausula(q: string, desejada: string | undefined): TermosDaClausula {
  const termos = [
    ...new Set(
      (q.match(/[a-z0-9]{4,}/g) ?? []).filter((w) => !PALAVRAS_VAZIAS_DA_PERGUNTA.has(w) && !/^\d{4}$/.test(w)),
    ),
  ].slice(0, 8);
  const frases = [...new Set(termos.flatMap((t) => SINONIMOS[t] ?? []))];
  const chaves = termos.filter((t) => SINONIMOS[t]);
  // Sem categoria citada, o cargo ou assunto da pergunta (ex.: "técnico de segurança") precisa aparecer no trecho; só "piso" não basta, senão a cláusula de outra categoria seria devolvida.
  const cargo = desejada
    ? []
    : termos.filter((t) => !SINONIMOS[t] && !/^(valor|valores|trabalho|quanto|minimo|maximo|vigente|atual)$/.test(t));
  return { termos, frases, chaves, cargo };
}

function lerConvencoes(db: DatabaseSync): Convencao[] {
  return db
    .prepare(
      `SELECT title, url, content, fetched_at AS fetchedAt, json_extract(meta, '$.category') AS category, json_extract(meta, '$.year') AS year, json_extract(meta, '$.type') AS type FROM documents
      WHERE source = 'sindeprestem' AND json_extract(meta, '$.section') = 'convencao' AND url LIKE '%.pdf' AND length(content) > 2000`,
    )
    .all() as Convencao[];
}

/** As até duas convenções coletivas mais recentes da categoria e do ano pedidos. */
function escolherCandidatas(
  documentos: Convencao[],
  desejada: string | undefined,
  anos: number[],
  ano: number | undefined,
): Convencao[] {
  const reunidos = documentos.filter(
    (d) =>
      (!desejada || d.category === desejada) &&
      (!anos.length || anos.includes(d.year ?? 0)) &&
      !/jundia/i.test(d.title),
  );
  const maisRecente = Math.max(0, ...reunidos.map((d) => d.year ?? 0));
  return reunidos
    .filter((d) => d.type === 'Convenção coletiva' && (d.year ?? 0) >= (ano ?? maisRecente))
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
    .slice(0, 2);
}

/** Janelas de 10 linhas (de 4 em 4) em que a palavra-chave da cláusula aparece; os demais termos só desempatam. */
function janelasDaClausula(todas: string[], { termos, frases, chaves, cargo }: TermosDaClausula): Janela[] {
  const janelas: Janela[] = [];
  for (let i = 0; i < todas.length; i += 4) {
    const janela = normalizar(todas.slice(i, i + 10).join(' '));
    const chaveNaJanela =
      chaves.length > 0 &&
      (chaves.some((t) => janela.includes(t)) || frases.some((p) => janela.includes(p))) &&
      (!cargo.length || cargo.some((t) => janela.includes(t)));
    const score = (chaveNaJanela ? 6 : 0) + termos.filter((t) => !SINONIMOS[t] && janela.includes(t)).length;
    if (chaves.length ? chaveNaJanela : score >= Math.min(4, termos.length * 2 || 2)) janelas.push({ score, at: i });
  }
  return janelas;
}

/** Os dois melhores trechos que não se sobrepõem (janelas de 14 linhas), na ordem em que aparecem no documento. */
function melhoresJanelas(janelas: Janela[]): Janela[] {
  const melhores: Janela[] = [];
  for (const w of janelas.sort((a, b) => b.score - a.score))
    if (melhores.length < 2 && melhores.every((b) => Math.abs(b.at - w.at) >= 14)) melhores.push(w);
  return melhores.sort((a, b) => a.at - b.at);
}

/** O trecho começa na primeira linha da janela que contém algum termo da pergunta. */
function textoDaJanela(todas: string[], w: Janela, termos: string[]): string {
  const primeira = todas.slice(w.at, w.at + 10).findIndex((l) => termos.some((t) => normalizar(l).includes(t)));
  const desde = w.at + Math.max(0, primeira);
  return todas
    .slice(desde, desde + 14)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 750);
}

function passagemDaConvencao(documento: Convencao, t: TermosDaClausula): PassagemFixa | undefined {
  const todas = documento.content.split(QUEBRA_DE_LINHA);
  const trechos = melhoresJanelas(janelasDaClausula(todas, t)).map((w) => textoDaJanela(todas, w, t.termos));
  if (!trechos.length) return undefined;
  return {
    url: documento.url,
    title: documento.title,
    content: trechos.join(' […] '),
    fetchedAt: documento.fetchedAt,
    pinned: true,
  };
}

/**
 * Pergunta sobre o conteúdo de uma cláusula: devolve trechos do texto da convenção mais recente da categoria citada, com link, para o modelo
 * explicar. Sem trecho aplicável, devolve `semResposta`; o modelo não responde valores de convenção de memória.
 */
export function trechosDeClausula(pergunta: string, arquivo = caminhoDoBanco()): TrechosDeDocumentos {
  const q = normalizar(pergunta);
  const desejada = CATEGORIAS_DE_CONVENCAO.find(([test]) => test.test(q))?.[1];
  const anos = [...q.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  const ano = anos.length ? Math.max(...anos) : undefined;
  const t = termosDaClausula(q, desejada);
  if (!existsSync(arquivo)) return { passages: [] };
  const db = new DatabaseSync(arquivo, { readOnly: true });
  try {
    const candidatas = escolherCandidatas(lerConvencoes(db), desejada, anos, ano);
    if (!candidatas.length)
      return {
        passages: [],
        semResposta: `Não encontrei a convenção dessa categoria e ano. Veja [Documentos coletivos](${SITE}/convencoes-coletivas).`,
      };
    const passagens = candidatas.flatMap((d) => passagemDaConvencao(d, t) ?? []);
    if (!passagens.length)
      return {
        passages: [],
        semResposta: `Não consegui confirmar isso nas convenções coletadas${t.cargo.length ? ' (não identifiquei a categoria ou o cargo)' : ''}. Veja [Documentos coletivos](${SITE}/convencoes-coletivas) ou fale com o Setor Jurídico do SINDEPRESTEM: (11) 3215-8250.`,
      };
    return { passages: passagens };
  } catch {
    return { passages: [] };
  } finally {
    db.close();
  }
}
