import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import type { TrechosDeDocumentos } from '@/lib/base/tipos';
import { normalizar, numeroDaNR, trechosRelevantes } from '@/lib/base/texto';
import { consultaPorPrefixos, caminhoDoBanco } from '@/lib/dados/db';
import { PEDIDO_DE_REDACAO } from '@/lib/recuperacao/intencao';
import { chaveDoArtigo, termosDoDocumento } from '@/lib/recuperacao/termos-de-documento';

/**
 * Artigo da Constituição ou de um regimento citado na pergunta, ou os trechos que mais combinam com ela. Devolve o texto-fonte para o modelo
 * explicar com as próprias palavras; quem apresenta a resposta ao usuário é a SINDI, não uma cópia da lei.
 */
export function trechosDeLei(pergunta: string, termos: string[], arquivo = caminhoDoBanco()): TrechosDeDocumentos {
  const q = normalizar(pergunta);
  if (PEDIDO_DE_REDACAO.test(q) || !existsSync(arquivo)) return { passages: [] };
  const constituicao = /constituicao|carta magna|\bcf\b|\bcf\/?88\b|constitution/.test(q);
  const regimento = /regimento|rules of procedure/.test(q) ? (/camara|deputad/.test(q) ? 'ricd' : /senado|senador/.test(q) ? 'risf' : /congresso/.test(q) ? 'rccn' : undefined) : undefined;
  if (!constituicao && !regimento) return { passages: [] };
  const chave = chaveDoArtigo(pergunta); const adct = /\badct\b|disposicoes constitucionais transitorias/.test(q);
  const db = new DatabaseSync(arquivo, { readOnly: true });
  try {
    if (chave) {
      const linha = (constituicao
        ? db.prepare("SELECT title, url, content, fetched_at AS fetchedAt FROM documents WHERE source = 'constituicao' AND url LIKE ? LIMIT 1").get(`%#${adct ? 'adct-' : ''}${chave}`)
        : db.prepare("SELECT title, url, content, fetched_at AS fetchedAt FROM documents WHERE source = 'regimentos' AND json_extract(meta, '$.regiment') = ? AND url LIKE ? ORDER BY length(content) DESC LIMIT 1").get(regimento ?? '', `%#${chave}`)) as { title: string; url: string; content: string; fetchedAt: string } | undefined;
      if (!linha) return { passages: [], semResposta: 'Não encontrei esse artigo no texto oficial coletado.' };
      return { passages: [{ url: linha.url.split('#')[0], title: linha.title, content: trechosRelevantes(linha.content, termosDoDocumento(pergunta), 1600), fetchedAt: linha.fetchedAt, pinned: true }] };
    }
    const palavras = termos.map(t => t.replace(/[^\p{L}\p{N}]/gu, '')).filter(t => t.length >= 4 && !/^(constituicao|regimento|diz|fala|preve|artigo|federal)$/.test(normalizar(t)));
    if (!palavras.length) return { passages: [] };
    const fonte = constituicao ? 'constituicao' : 'regimentos';
    const linhas = db.prepare(`SELECT d.title, d.url, substr(d.content, 1, 900) AS content, d.fetched_at AS fetchedAt FROM documents_fts f JOIN documents d ON d.rowid = f.rowid WHERE documents_fts MATCH ? AND d.source = ?
      ${regimento ? "AND json_extract(d.meta, '$.regiment') = ?" : ''} ORDER BY bm25(documents_fts, 4.0, 1.0) LIMIT 3`).all(consultaPorPrefixos(palavras), fonte, ...(regimento ? [regimento] : [])) as { title: string; url: string; content: string; fetchedAt: string }[];
    return { passages: linhas.map(r => ({ url: r.url.split('#')[0], title: r.title, content: r.content.replace(/\s+/g, ' ').trim(), fetchedAt: r.fetchedAt, pinned: true as const })) };
  } catch { return { passages: [] }; } finally { db.close(); }
}

export const PAGINA_SST = 'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho';
/**
 * Norma Regulamentadora citada na pergunta: devolve os blocos do texto coletado do portal do Ministério que mais combinam com a pergunta
 * (e o começo, que define a norma), para o modelo explicar. Se a página não foi coletada, orienta a fonte oficial; o modelo não descreve NR de memória.
 */
export function trechosDeNR(pergunta: string, arquivo = caminhoDoBanco()): TrechosDeDocumentos {
  const numero = numeroDaNR(pergunta);
  if (numero === undefined || PEDIDO_DE_REDACAO.test(normalizar(pergunta))) return { passages: [] };
  const preenchido = String(numero).padStart(2, '0');
  let linha: { title: string; url: string; content: string; fetchedAt: string } | undefined;
  if (existsSync(arquivo)) {
    const db = new DatabaseSync(arquivo, { readOnly: true });
    try {
      const padroes = [`%nr-${preenchido}%`, `%nr-${numero}-%`, `%nr-${numero}`, `%norma-regulamentadora-no-${preenchido}%`, `%norma-regulamentadora-n-${numero}%`, `%norma-regulamentadora-${numero}-%`];
      const titulos = [`NR ${preenchido}%`, `NR-${preenchido}%`, `NR ${numero} %`, `NR-${numero} %`, `Norma Regulamentadora ${preenchido}%`, `Norma Regulamentadora ${numero} %`, `Norma Regulamentadora nº ${numero}%`, `NR ${numero}`];
      const condicao = [...padroes.map(() => 'lower(url) LIKE ?'), ...titulos.map(() => 'title LIKE ?')].join(' OR ');
      linha = db.prepare(`SELECT title, url, content, fetched_at AS fetchedAt FROM documents WHERE source = 'mte' AND (${condicao}) ORDER BY (url LIKE '%normas-regulamentadoras-vigentes/%') DESC, (lower(url) LIKE '%/nr-' || ? OR lower(url) LIKE '%-nr-' || ?) DESC, length(content) DESC LIMIT 1`).get(...padroes, ...titulos, String(numero), String(numero)) as typeof linha;
    } catch { linha = undefined; } finally { db.close(); }
  }
  if (linha) return { passages: [{ url: linha.url, title: linha.title, content: trechosRelevantes(linha.content, termosDoDocumento(pergunta), 1600), fetchedAt: linha.fetchedAt, pinned: true }] };
  return { passages: [], semResposta: `Não encontrei a NR-${numero} no texto oficial coletado, então não vou descrevê-la de memória. Consulte a página de [segurança e saúde no trabalho](${PAGINA_SST}) do Ministério do Trabalho e Emprego.` };
}
