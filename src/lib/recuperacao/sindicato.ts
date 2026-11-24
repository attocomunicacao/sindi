import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dataBR } from '@/lib/base/formato';
import { PRESIDENTE, SITE } from '@/lib/base/constantes';
import type { PassagemFixa, TrechosDeDocumentos } from '@/lib/base/tipos';
import { normalizar, trechosRelevantes } from '@/lib/base/texto';
import { consultaPorPrefixos, caminhoDoBanco } from '@/lib/dados/db';
import { CATEGORIAS_DE_CONVENCAO, PEDIDO_DE_REDACAO, PERGUNTA_DE_CONVENCAO, perguntaDeClausula } from '@/lib/recuperacao/intencao';
import { PALAVRAS_VAZIAS_DA_PERGUNTA } from '@/lib/recuperacao/termos-de-documento';

const ASSINATURA_DO_PRESIDENTE = new RegExp(`Por ${PRESIDENTE}[^\\n]*`, 'g');
const dataOuTraco = (valor: string | null | undefined) => valor ? dataBR(valor) : '—';

type LinhaDeDocumento = { title: string; url: string; content: string; published_at: string | null; category: string | null; year: number | null; kind: string | null; region: string | null };
const ROTULO_DA_SECAO: Record<string, string> = { convencao: 'convenção coletiva', cartilha: 'cartilha', juridico: 'documento jurídico', noticia: 'notícia', artigo: 'artigo do presidente' };
/**
 * Documentos do próprio SINDEPRESTEM que a pergunta pede (convenções e aditivos por categoria e ano, cartilhas, documentos jurídicos, notícias e artigos recentes),
 * como trechos com título, data e início do texto. O modelo apresenta a lista com palavras próprias; as referências ao final levam a cada documento.
 * Perguntas sobre o conteúdo de uma cláusula seguem para `trechosDeClausula`, e as institucionais para o cérebro.
 */
export function trechosDoSindicato(pergunta: string, arquivo = caminhoDoBanco()): PassagemFixa[] {
  const q = normalizar(pergunta);
  if (PEDIDO_DE_REDACAO.test(q) || !existsSync(arquivo)) return [];
  const convencao = PERGUNTA_DE_CONVENCAO.test(q) && !/artigo|noticia/.test(q);
  const cartilha = /cartilha|booklet|handbook/.test(q);
  const juridico = /(documentos?|textos?|arquivos?|leis?|legislacao|decretos?|portarias?).*(juridic|legislac|sindeprestem)|juridic.*(documentos?|legislac)|legal documents/.test(q);
  const noticias = /(ultimas?|recentes?|novidades?|latest|recent).*(noticias?|news)|noticias.*(sindeprestem|sindicato)|novidades do (sindeprestem|sindicato)/.test(q);
  const artigos = /(ultimos?|recentes?|latest|recent)?\s*artigos?.*(vander|presidente|sindeprestem|sindicato)|artigos? (do|de) (vander|presidente)|ultimos artigos|recent articles/.test(q);
  if (convencao && perguntaDeClausula(q)) return [];
  const secao = convencao ? 'convencao' : cartilha ? 'cartilha' : juridico ? 'juridico' : noticias ? 'noticia' : artigos ? 'artigo' : undefined;
  if (!secao) return [];
  const db = new DatabaseSync(arquivo, { readOnly: true });
  try {
    const consultaBase = `SELECT title, url, content, published_at, fetched_at AS fetchedAt, json_extract(meta, '$.category') AS category, json_extract(meta, '$.year') AS year, json_extract(meta, '$.type') AS kind, json_extract(meta, '$.region') AS region
      FROM documents WHERE source = 'sindeprestem' AND json_extract(meta, '$.section') = ? AND json_extract(meta, '$.listing') IS NULL`;
    type Linha = LinhaDeDocumento & { fetchedAt: string };
    let linhas: Linha[];
    if (secao === 'convencao') {
      const desejada = CATEGORIAS_DE_CONVENCAO.find(([test]) => test.test(q))?.[1];
      const ano = Number(q.match(/\b(20\d{2})\b/)?.[1]) || undefined;
      const jundiai = /jundiai/.test(q);
      const todas = db.prepare(`${consultaBase} AND url LIKE '%.pdf' ORDER BY COALESCE(json_extract(meta, '$.year'), 0) DESC, title`).all('convencao') as Linha[];
      linhas = todas.filter(r => (!desejada || r.category === desejada) && (!ano || r.year === ano) && (!jundiai || r.region === 'Jundiaí'));
      if (!ano) { const maisRecente = Math.max(...linhas.map(r => r.year ?? 0)); linhas = linhas.filter(r => (r.year ?? 0) >= maisRecente - 1); }
    } else if (secao === 'cartilha') linhas = db.prepare(`${consultaBase} AND url LIKE '%.pdf' ORDER BY title`).all('cartilha') as Linha[];
    else if (secao === 'juridico') {
      // Edições mensais da mesma norma aparecem uma vez, com a contagem.
      const todas = db.prepare(`${consultaBase} AND url LIKE '%.pdf' ORDER BY COALESCE(json_extract(meta, '$.year'), 0) DESC, published_at DESC, title`).all('juridico') as Linha[];
      const grupos = new Map<string, Linha[]>();
      for (const r of todas) { const chave = r.title.split(' — ')[0]; grupos.set(chave, [...(grupos.get(chave) ?? []), r]); }
      linhas = [...grupos.entries()].map(([chave, lista]) => ({ ...lista[0], title: lista.length > 1 ? `${chave} (${lista.length} edições mensais, a mais recente)` : lista[0].title }));
    } else linhas = db.prepare(`${consultaBase} AND url LIKE '%/post/%' AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT 6`).all(secao) as Linha[];
    // Lista de documentos: título, tipo e data bastam. Descrições curtas de PDFs levam o modelo pequeno a inventar o assunto de documentos que ele não leu, e a lista com os links vai nas referências.
    const semTexto = (r: { content: string }) => /PDF digitalizado/.test(r.content) || r.content.trim().length < 120;
    return [...linhas].sort((a, b) => Number(semTexto(a)) - Number(semTexto(b))).slice(0, 8).map(r => ({
      url: r.url, title: r.title, fetchedAt: r.fetchedAt, pinned: true as const,
      content: [`Documento publicado pelo SINDEPRESTEM (${ROTULO_DA_SECAO[secao] ?? 'documento'}): ${r.title}`, [r.kind, r.category, r.year].filter(Boolean).join(', '), r.published_at ? `publicado em ${dataOuTraco(r.published_at)}` : '', semTexto(r) ? 'documento digitalizado, sem texto disponível' : ''].filter(Boolean).join('. '),
    }));
  } catch { return []; } finally { db.close(); }
}

const PALAVRAS_GENERICAS_DE_POSICAO = new Set('sindicato sindeprestem posicionamento posicao opiniao presidente vander morales defende defendem pensa pensam acha acham visao qual quais sobre entidade diz dizem manifestou manifesta artigo artigos noticia noticias fala'.split(' '));
/**
 * "Qual o posicionamento do sindicato sobre X?": os artigos do presidente e as notícias do SINDEPRESTEM que tratam do tema, como trechos para o modelo
 * resumir a posição com palavras próprias, sempre com a fonte. Sem texto sobre o tema, devolve vazio e a SINDI não inventa posição.
 */
export function trechosDePosicionamento(pergunta: string, arquivo = caminhoDoBanco()): TrechosDeDocumentos {
  const q = normalizar(pergunta);
  if (!/posicionamento|posicao|opiniao|o que (o )?(sindicato|sindeprestem|presidente|vander).*(pensa|defende|acha|diz|fala)|qual a visao|o que defende|position on|stance|opinion on/.test(q) || !existsSync(arquivo)) return { passages: [] };
  const palavras = [...new Set((q.match(/[a-z0-9]{3,}/g) ?? []).filter(w => !PALAVRAS_GENERICAS_DE_POSICAO.has(w) && !PALAVRAS_VAZIAS_DA_PERGUNTA.has(w) && !/^(o|a|os|as|de|do|da|que|sobre|para|tem|ter)$/.test(w)))].slice(0, 6);
  if (!palavras.length) return { passages: [] };
  const db = new DatabaseSync(arquivo, { readOnly: true });
  try {
    const linhas = db.prepare(`SELECT d.title, d.url, d.content, d.published_at, d.fetched_at AS fetchedAt, json_extract(d.meta, '$.section') AS section FROM documents_fts f JOIN documents d ON d.rowid = f.rowid
      WHERE documents_fts MATCH ? AND d.source = 'sindeprestem' AND d.url LIKE '%/post/%' AND json_extract(d.meta, '$.section') IN ('artigo', 'noticia')
      ORDER BY (json_extract(d.meta, '$.section') = 'artigo') DESC, bm25(documents_fts, 6.0, 1.0) LIMIT 4`).all(consultaPorPrefixos(palavras, 'AND')) as { title: string; url: string; content: string; published_at: string | null; fetchedAt: string; section: string }[];
    if (!linhas.length) return { passages: [], semResposta: `Não encontrei artigos ou notícias do SINDEPRESTEM sobre "${palavras.join(' ')}" nas fontes coletadas. Consulte [Artigos](${SITE}/artigos) e [Notícias](${SITE}/noticias).` };
    return { passages: linhas.map(r => ({ url: r.url, title: r.title.replace(/^Artigo\s*[-–]\s*/i, ''), fetchedAt: r.fetchedAt, pinned: true as const,
      content: `${r.section === 'artigo' ? 'Artigo do presidente' : 'Notícia do sindicato'} de ${dataOuTraco(r.published_at)}. ${trechosRelevantes(r.content.replace(ASSINATURA_DO_PRESIDENTE, ''), palavras, 600, 300).replace(/\s+/g, ' ')}` })) };
  } catch { return { passages: [] }; } finally { db.close(); }
}
