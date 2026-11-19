import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { dataDir } from '../dados/db';
import { trechosDoCerebro, type Trecho } from './carregar';

const NOME_DO_MODELO = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
/** Vetores de 768 dimensões (o modelo permite reduzir): índice menor e busca mais rápida. O nome no índice inclui o tamanho, então mudar qualquer um reindexa. */
const DIMENSOES = 768;
export const MODELO_EMBEDDING = `${NOME_DO_MODELO}:${DIMENSOES}`;
export const arquivoDeVetores = () => path.join(dataDir(), 'cerebro-vetores.json');
type Indice = { modelo: string; vetores: Record<string, { hash: string; vetor: number[] }> };

/** Identificador estável do trecho: arquivo + seção + início do texto; o hash do conteúdo detecta alterações. */
export const idDoTrecho = (t: Trecho) => `${t.arquivo}#${t.secao}#${createHash('sha1').update(t.texto.slice(0, 80)).digest('hex').slice(0, 6)}`;
/** O que vira vetor: o título da seção e o início do texto (o nome do arquivo e o fim de textos longos só diluem o significado). */
export const textoParaVetor = (t: Trecho) => `${t.secao}\n${t.texto}`.slice(0, 700);
export const hashDoTrecho = (t: Trecho) => createHash('sha256').update(textoParaVetor(t)).digest('hex').slice(0, 16);

/**
 * Vetores pela API do Gemini (nível gratuito). A tarefa informa ao modelo se o texto é um documento guardado ou uma pergunta. Na indexação (documento) um limite
 * momentâneo do provedor (HTTP 429) é esperado e repetido algumas vezes; na pergunta não há repetição, pois o chat não pode esperar (cai na busca por palavras).
 */
export async function embeddings(textos: string[], tipo: 'documento' | 'consulta', tempoMs = 60000): Promise<number[][]> {
  const chave = process.env.GEMINI_API_KEY; if (!chave) throw new Error('GEMINI_API_KEY ausente');
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(NOME_DO_MODELO)) throw new Error('GEMINI_EMBED_MODEL inválido');
  const taskType = tipo === 'documento' ? 'RETRIEVAL_DOCUMENT' : 'RETRIEVAL_QUERY';
  const corpo = JSON.stringify({ requests: textos.map(texto => ({ model: `models/${NOME_DO_MODELO}`, content: { parts: [{ text: texto }] }, taskType, outputDimensionality: DIMENSOES })) });
  const tentativas = tipo === 'documento' ? 4 : 1;
  for (let tentativa = 1; ; tentativa++) {
    const resposta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${NOME_DO_MODELO}:batchEmbedContents`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave }, body: corpo, signal: AbortSignal.timeout(tempoMs), cache: 'no-store' });
    if (resposta.status === 429 && tentativa < tentativas) { await new Promise(r => setTimeout(r, 5000 * tentativa)); continue; }
    if (!resposta.ok) throw new Error(`Embeddings HTTP ${resposta.status}`);
    const dados = await resposta.json() as { embeddings?: { values?: number[] }[] };
    if (!dados.embeddings || dados.embeddings.length !== textos.length || dados.embeddings.some(e => !Array.isArray(e.values))) throw new Error('Resposta de embeddings incompleta');
    return dados.embeddings.map(e => e.values!);
  }
}
export function cosseno(a: number[], b: number[]) {
  let produto = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i++) { produto += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? produto / Math.sqrt(na * nb) : 0;
}
function lerIndice(): Indice { try { const i = JSON.parse(readFileSync(arquivoDeVetores(), 'utf8')) as Indice; return i.modelo === MODELO_EMBEDDING ? i : { modelo: MODELO_EMBEDDING, vetores: {} }; } catch { return { modelo: MODELO_EMBEDDING, vetores: {} }; } }
let memoria: { mtime: number; indice: Indice } | undefined;
function indiceEmMemoria(): Indice {
  try { const arquivo = arquivoDeVetores(); const { mtimeMs } = statSync(arquivo); if (memoria?.mtime === mtimeMs) return memoria.indice; memoria = { mtime: mtimeMs, indice: lerIndice() }; return memoria.indice; } catch { return { modelo: MODELO_EMBEDDING, vetores: {} }; }
}

/**
 * Calcula (de forma incremental) os vetores dos trechos do cérebro que ainda não têm vetor ou mudaram, e remove os de trechos que não existem mais.
 * Chamado após cada publicação do cérebro e por `npm run cerebro:indexar`.
 */
export async function indexarCerebro(trechos: Trecho[] = trechosDoCerebro(), log: (m: string) => void = () => {}) {
  const indice = lerIndice(); const vigentes = new Map(trechos.filter(t => t.semantica).map(t => [idDoTrecho(t), t]));
  for (const id of Object.keys(indice.vetores)) if (!vigentes.has(id)) delete indice.vetores[id];
  const pendentes = [...vigentes].filter(([id, t]) => indice.vetores[id]?.hash !== hashDoTrecho(t));
  for (let i = 0; i < pendentes.length; i += 24) {
    const lote = pendentes.slice(i, i + 24);
    const vetores = await embeddings(lote.map(([, t]) => textoParaVetor(t)), 'documento');
    lote.forEach(([id, t], k) => { indice.vetores[id] = { hash: hashDoTrecho(t), vetor: vetores[k].map(v => Math.round(v * 1e5) / 1e5) }; });
  }
  mkdirSync(path.dirname(arquivoDeVetores()), { recursive: true });
  const temporario = arquivoDeVetores() + '.tmp'; writeFileSync(temporario, JSON.stringify(indice)); renameSync(temporario, arquivoDeVetores());
  memoria = undefined;
  log(`Cérebro: ${pendentes.length} trecho(s) indexado(s) de ${vigentes.size}`);
  return { total: vigentes.size, novos: pendentes.length };
}
export type Semantico = { trecho: Trecho; similaridade: number };
/** Trechos mais parecidos em significado com a pergunta. Sem índice ou sem resposta do provedor, devolve vazio (a busca por palavras continua valendo). */
export async function buscarSemantico(pergunta: string, limite = 5, trechos: Trecho[] = trechosDoCerebro(), tempoMs = 2500): Promise<Semantico[]> {
  const indice = indiceEmMemoria(); if (!Object.keys(indice.vetores).length) return [];
  try {
    const [consulta] = await embeddings([pergunta], 'consulta', tempoMs);
    const resultados: Semantico[] = [];
    for (const trecho of trechos) { if (!trecho.semantica) continue; const v = indice.vetores[idDoTrecho(trecho)]; if (v && v.hash === hashDoTrecho(trecho)) resultados.push({ trecho, similaridade: cosseno(consulta, v.vetor) }); }
    return resultados.sort((a, b) => b.similaridade - a.similaridade).slice(0, limite);
  } catch { return []; }
}
