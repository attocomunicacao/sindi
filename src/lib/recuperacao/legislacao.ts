import type { DatabaseSync } from 'node:sqlite';
import type { PassagemFixa, TrechosDeDocumentos } from '@/lib/base/tipos';
import { normalizar, trechosRelevantes } from '@/lib/base/texto';
import { consultaPorPrefixos } from '@/lib/dados/db';
import { NORMAS, type NormaColetada } from '@/lib/dados/legislacao-lista';
import { chaveDoArtigo, termosDoDocumento } from '@/lib/recuperacao/termos-de-documento';

/**
 * Normas da lista curada (Planalto) que a pergunta cita, na ordem em que aparecem no texto. Reconhece pelo número ("Lei 6.019/74"), pelo nome
 * ("CLT", "reforma trabalhista") ou por "lei do trabalho temporário"; "trabalho temporário" sozinho, sem a palavra lei, não conta.
 */
export function normasCitadas(pergunta: string): NormaColetada[] {
  const q = normalizar(pergunta);
  return NORMAS.flatMap((n) => {
    const achado = n.reconhecer.exec(q);
    return achado ? [{ n, posicao: achado.index }] : [];
  })
    .sort((a, b) => a.posicao - b.posicao)
    .map((x) => x.n);
}

/** Pergunta sobre o que alterou/modificou uma norma ("Qual lei alterou a Lei 6.019/74?"). */
const PERGUNTA_DE_ALTERACAO = /\b(alter\w*|modific\w*|mud(?:ou|aram|anca\w*)|acrescent\w*|revog\w*)\b/;
/** Palavras da pergunta que não distinguem o assunto dentro de uma norma. */
const GENERICAS = new Set(
  'lei leis clt emenda constitucional decreto artigo artigos qual quais temporario trabalho terceirizacao reforma trabalhista consolidacao federal norma texto diz fala preve'.split(
    ' ',
  ),
);

type Linha = { title: string; url: string; content: string; fetchedAt: string };
const COLUNAS = 'title, url, content, fetched_at AS fetchedAt';

const comoPassagem = (l: Linha, termos: string[], limite = 1600): PassagemFixa => ({
  url: l.url.split('#')[0],
  title: l.title,
  content: trechosRelevantes(l.content, termos, limite),
  fetchedAt: l.fetchedAt,
  pinned: true,
});

/**
 * Trechos oficiais de uma norma da lista curada citada na pergunta: o artigo pedido ("art. 5º-A da Lei 6.019"), a ementa e o começo da norma
 * ("Qual a lei do trabalho temporário?"), quem a alterou ("Qual lei alterou a Lei 6.019/74?") ou os artigos que mais combinam com o assunto.
 * `undefined` quando a pergunta não cita nenhuma norma da lista.
 */
export function trechosDeNormas(db: DatabaseSync, pergunta: string, termos: string[]): TrechosDeDocumentos | undefined {
  const normas = normasCitadas(pergunta);
  if (!normas.length) return undefined;
  const q = normalizar(pergunta);
  const chave = chaveDoArtigo(pergunta);
  const doBanco = (sql: string, ...parametros: (string | number)[]) => db.prepare(sql).all(...parametros) as Linha[];

  if (chave) {
    // Com várias normas na pergunta, o artigo é o da que vem logo depois de "art. N" ("art. 5º-A da Lei 6.019, alterada pela 13.467").
    const aposOArtigo = q.search(/\bart(?:igo|\.)/);
    const alvo =
      normas.find((n) => (n.reconhecer.exec(q)?.index ?? -1) >= aposOArtigo && aposOArtigo >= 0) ?? normas[0];
    const linha = db
      .prepare(`SELECT ${COLUNAS} FROM documents WHERE source = 'legislacao' AND url = ?`)
      .get(`${alvo.url}#${chave}`) as Linha | undefined;
    if (!linha) return { passages: [], semResposta: 'Não encontrei esse artigo no texto oficial coletado.' };
    return { passages: [comoPassagem(linha, termosDoDocumento(pergunta))] };
  }

  const ementas = (ids: string[]) =>
    ids.length
      ? doBanco(
          `SELECT ${COLUNAS} FROM documents WHERE source = 'legislacao' AND url LIKE '%#ementa' AND json_extract(meta, '$.lei') IN (${ids.map(() => '?').join(',')})`,
          ...ids,
        )
      : [];
  const ids = normas.map((n) => n.id);

  if (PERGUNTA_DE_ALTERACAO.test(q)) {
    // Quem altera uma norma diz isso na própria ementa ("Altera dispositivos da Lei nº 6.019..."): procura o número nas ementas das outras.
    const alteradoras = NORMAS.filter((o) => !ids.includes(o.id)).flatMap((o) =>
      ementas([o.id]).filter((e) =>
        normas.some((n) =>
          e.content
            .replace(/\s+/g, ' ')
            .replace(/\bn\s*[º°o]\s*/g, '')
            .includes(n.numero),
        ),
      ),
    );
    const proprias = ementas(ids);
    if (alteradoras.length || proprias.length)
      return { passages: [...alteradoras, ...proprias].slice(0, 4).map((l) => comoPassagem(l, [], 900)) };
  }

  const palavras = termos
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((t) => t.length >= 4 && !GENERICAS.has(normalizar(t)) && !/^\d+$/.test(t));
  if (palavras.length) {
    const achadas = doBanco(
      `SELECT d.title, d.url, substr(d.content, 1, 900) AS content, d.fetched_at AS fetchedAt FROM documents_fts f JOIN documents d ON d.rowid = f.rowid
       WHERE documents_fts MATCH ? AND d.source = 'legislacao' AND json_extract(d.meta, '$.lei') IN (${ids.map(() => '?').join(',')})
       ORDER BY bm25(documents_fts, 4.0, 1.0) LIMIT 3`,
      consultaPorPrefixos(palavras),
      ...ids,
    );
    if (achadas.length)
      return {
        passages: achadas.map((r) => ({ ...comoPassagem(r, [], 900), content: r.content.replace(/\s+/g, ' ').trim() })),
      };
  }
  // Sem artigo nem assunto ("Qual a lei do trabalho temporário?"): ementa e artigos de abertura de cada norma citada.
  const abertura = normas
    .slice(0, 2)
    .flatMap((n) => [
      ...ementas([n.id]),
      ...doBanco(
        `SELECT ${COLUNAS} FROM documents WHERE source = 'legislacao' AND url IN (?, ?)`,
        `${n.url}#1`,
        `${n.url}#2`,
      ),
    ]);
  return abertura.length ? { passages: abertura.slice(0, 4).map((l) => comoPassagem(l, [], 900)) } : undefined;
}
