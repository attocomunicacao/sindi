import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import type { TrechosDeDocumentos } from '@/lib/base/tipos';
import { normalizar, numeroDaNR, trechosRelevantes } from '@/lib/base/texto';
import { consultaPorPrefixos, dbPath } from '@/lib/dados/db';
import { PEDIDO_DE_REDACAO } from '@/lib/recuperacao/intencao';
import { chaveDoArtigo, termosDoDocumento } from '@/lib/recuperacao/termos-de-documento';

/**
 * Artigo da Constituição ou de um regimento citado na pergunta, ou os trechos que mais combinam com ela. Devolve o texto-fonte para o modelo
 * explicar com as próprias palavras; quem apresenta a resposta ao usuário é a SINDI, não uma cópia da lei.
 */
export function trechosDeLei(question: string, terms: string[], file = dbPath()): TrechosDeDocumentos {
  const q = normalizar(question);
  if (PEDIDO_DE_REDACAO.test(q) || !existsSync(file)) return { passages: [] };
  const constitution = /constituicao|carta magna|\bcf\b|\bcf\/?88\b|constitution/.test(q);
  const regiment = /regimento|rules of procedure/.test(q) ? (/camara|deputad/.test(q) ? 'ricd' : /senado|senador/.test(q) ? 'risf' : /congresso/.test(q) ? 'rccn' : undefined) : undefined;
  if (!constitution && !regiment) return { passages: [] };
  const key = chaveDoArtigo(question); const adct = /\badct\b|disposicoes constitucionais transitorias/.test(q);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (key) {
      const row = (constitution
        ? db.prepare("SELECT title, url, content, fetched_at AS fetchedAt FROM documents WHERE source = 'constituicao' AND url LIKE ? LIMIT 1").get(`%#${adct ? 'adct-' : ''}${key}`)
        : db.prepare("SELECT title, url, content, fetched_at AS fetchedAt FROM documents WHERE source = 'regimentos' AND json_extract(meta, '$.regiment') = ? AND url LIKE ? ORDER BY length(content) DESC LIMIT 1").get(regiment ?? '', `%#${key}`)) as { title: string; url: string; content: string; fetchedAt: string } | undefined;
      if (!row) return { passages: [], semResposta: 'Não encontrei esse artigo no texto oficial coletado.' };
      return { passages: [{ url: row.url.split('#')[0], title: row.title, content: trechosRelevantes(row.content, termosDoDocumento(question), 1600), fetchedAt: row.fetchedAt, pinned: true }] };
    }
    const words = terms.map(t => t.replace(/[^\p{L}\p{N}]/gu, '')).filter(t => t.length >= 4 && !/^(constituicao|regimento|diz|fala|preve|artigo|federal)$/.test(normalizar(t)));
    if (!words.length) return { passages: [] };
    const source = constitution ? 'constituicao' : 'regimentos';
    const rows = db.prepare(`SELECT d.title, d.url, substr(d.content, 1, 900) AS content, d.fetched_at AS fetchedAt FROM documents_fts f JOIN documents d ON d.rowid = f.rowid WHERE documents_fts MATCH ? AND d.source = ?
      ${regiment ? "AND json_extract(d.meta, '$.regiment') = ?" : ''} ORDER BY bm25(documents_fts, 4.0, 1.0) LIMIT 3`).all(consultaPorPrefixos(words), source, ...(regiment ? [regiment] : [])) as { title: string; url: string; content: string; fetchedAt: string }[];
    return { passages: rows.map(r => ({ url: r.url.split('#')[0], title: r.title, content: r.content.replace(/\s+/g, ' ').trim(), fetchedAt: r.fetchedAt, pinned: true as const })) };
  } catch { return { passages: [] }; } finally { db.close(); }
}

export const PAGINA_SST = 'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho';
/**
 * Norma Regulamentadora citada na pergunta: devolve os blocos do texto coletado do portal do Ministério que mais combinam com a pergunta
 * (e o começo, que define a norma), para o modelo explicar. Se a página não foi coletada, orienta a fonte oficial; o modelo não descreve NR de memória.
 */
export function trechosDeNR(question: string, file = dbPath()): TrechosDeDocumentos {
  const number = numeroDaNR(question);
  if (number === undefined || PEDIDO_DE_REDACAO.test(normalizar(question))) return { passages: [] };
  const padded = String(number).padStart(2, '0');
  let row: { title: string; url: string; content: string; fetchedAt: string } | undefined;
  if (existsSync(file)) {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      const patterns = [`%nr-${padded}%`, `%nr-${number}-%`, `%nr-${number}`, `%norma-regulamentadora-no-${padded}%`, `%norma-regulamentadora-n-${number}%`, `%norma-regulamentadora-${number}-%`];
      const titles = [`NR ${padded}%`, `NR-${padded}%`, `NR ${number} %`, `NR-${number} %`, `Norma Regulamentadora ${padded}%`, `Norma Regulamentadora ${number} %`, `Norma Regulamentadora nº ${number}%`, `NR ${number}`];
      const where = [...patterns.map(() => 'lower(url) LIKE ?'), ...titles.map(() => 'title LIKE ?')].join(' OR ');
      row = db.prepare(`SELECT title, url, content, fetched_at AS fetchedAt FROM documents WHERE source = 'mte' AND (${where}) ORDER BY (url LIKE '%normas-regulamentadoras-vigentes/%') DESC, (lower(url) LIKE '%/nr-' || ? OR lower(url) LIKE '%-nr-' || ?) DESC, length(content) DESC LIMIT 1`).get(...patterns, ...titles, String(number), String(number)) as typeof row;
    } catch { row = undefined; } finally { db.close(); }
  }
  if (row) return { passages: [{ url: row.url, title: row.title, content: trechosRelevantes(row.content, termosDoDocumento(question), 1600), fetchedAt: row.fetchedAt, pinned: true }] };
  return { passages: [], semResposta: `Não encontrei a NR-${number} no texto oficial coletado, então não vou descrevê-la de memória. Consulte a página de [segurança e saúde no trabalho](${PAGINA_SST}) do Ministério do Trabalho e Emprego.` };
}
