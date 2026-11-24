import { normalizar, termosDaConsulta } from '@/lib/base/texto';
import { trechosDoCerebro, type TrechoDoCerebro } from '@/lib/cerebro/carregar';
import { buscarSemantico } from '@/lib/cerebro/embeddings';

export type Resultado = { trecho: TrechoDoCerebro; pontos: number };
const sinal = (texto: string) => normalizar(texto);

/** Palavras normalizadas de um texto, e seus prefixos de 6 letras (casa singular e plural: "contribuicao" e "contribuicoes"). */
const palavrasDe = (texto: string) => { const palavras = new Set(sinal(texto).match(/[a-z0-9]+/g) ?? []); return { palavras, prefixos: new Set([...palavras].filter(w => w.length >= 6).map(w => w.slice(0, 6))) }; };
const casa = (indice: ReturnType<typeof palavrasDe>, termo: string) => indice.palavras.has(termo) || (termo.length >= 6 && indice.prefixos.has(termo.slice(0, 6)));
const cacheIndices = new WeakMap<TrechoDoCerebro, { titulo: ReturnType<typeof palavrasDe>; gatilhos: ReturnType<typeof palavrasDe>; texto: ReturnType<typeof palavrasDe> }>();
function indicesDe(trecho: TrechoDoCerebro) {
  let i = cacheIndices.get(trecho);
  if (!i) { i = { titulo: palavrasDe(`${trecho.titulo} ${trecho.secao}`), gatilhos: palavrasDe(trecho.gatilhos.join(' ')), texto: palavrasDe(trecho.texto) }; cacheIndices.set(trecho, i); }
  return i;
}
/**
 * Busca lexical no cérebro: termos da pergunta no título da seção (peso 4), nos gatilhos do arquivo (3) e no texto (1),
 * multiplicados pela prioridade do arquivo. Só devolve trechos que cobrem boa parte dos termos, para não poluir a resposta.
 */
export function buscarNoCerebro(pergunta: string, limite = 2, trechos: TrechoDoCerebro[] = trechosDoCerebro()): Resultado[] {
  const termos = termosDaConsulta(pergunta); if (!termos.length) return [];
  const pontuados: Resultado[] = trechos.map(trecho => {
    const indices = indicesDe(trecho); let pontos = 0; let cobertos = 0;
    for (const t of termos) {
      const peso = (casa(indices.titulo, t) ? 4 : 0) + (casa(indices.gatilhos, t) ? 3 : 0) + (casa(indices.texto, t) ? 1 : 0);
      if (peso) cobertos++; pontos += peso;
    }
    // Termos raros no trecho certo valem mais do que muitos termos comuns: exige cobertura mínima.
    const cobertura = cobertos / termos.length;
    return { trecho, pontos: cobertura >= 0.5 ? pontos * trecho.prioridade * (0.5 + cobertura / 2) : 0 };
  }).filter(r => r.pontos >= 4);
  return pontuados.sort((a, b) => b.pontos - a.pontos).slice(0, limite);
}

// Para casar perguntas do FAQ, palavras como "sindicato", "empresa" e "ajudar" contam (a busca geral as descarta).
const VAZIAS = new Set('qual quais como onde quem quando que para por com uma uns umas dos das nos nas pelo pela sobre este esta esse essa meu minha meus minhas voce vcs ola oi bom dia tarde noite favor poderia pode podem gostaria queria saber the and what how'.split(' '));
const tokensFaq = (texto: string) => new Set((normalizar(texto).match(/[a-z0-9]{3,}/g) ?? []).filter(t => !VAZIAS.has(t)));
const VARIACOES = /^Varia[cç][oõ]es:\s*(.+)$/im;
/**
 * Resposta direta do FAQ curado: só quando a pergunta do usuário é praticamente a mesma do FAQ (a maior parte das palavras da pergunta
 * está no título, ou numa das "Variações:" da seção, e o título não é muito mais amplo). Assim as respostas aprovadas pelo sindicato saem literais.
 */
export function respostaDireta(pergunta: string, trechos: TrechoDoCerebro[] = trechosDoCerebro()): { texto: string; titulo: string; pontos: number } | undefined {
  const q = tokensFaq(pergunta); if (q.size < 2) return undefined;
  let melhor: { trecho: TrechoDoCerebro; pontos: number; texto: string } | undefined;
  for (const trecho of trechos) {
    if (!trecho.direta) continue;
    const variacoes = trecho.texto.match(VARIACOES)?.[1].split('|').map(v => v.trim()).filter(Boolean) ?? [];
    for (const forma of [trecho.secao, ...variacoes]) {
      const t = tokensFaq(forma); if (!t.size) continue;
      const comuns = [...q].filter(x => t.has(x)).length;
      const cobreUsuario = comuns / q.size; const cobreTitulo = comuns / t.size;
      if (cobreUsuario >= 0.8 && cobreTitulo >= 0.5 && comuns >= 2 && (!melhor || cobreUsuario + cobreTitulo > melhor.pontos)) melhor = { trecho, pontos: cobreUsuario + cobreTitulo, texto: trecho.texto.replace(VARIACOES, '').replace(/^\s+/, '') };
    }
  }
  return melhor && { texto: melhor.texto, titulo: melhor.trecho.secao, pontos: melhor.pontos };
}

/** O significado pesa mais que as palavras: a busca por palavras erra quando a pergunta usa vocabulário diferente do texto. */
// Lidos a cada busca (e não na importação), para que o ambiente definido depois de carregar o módulo valha.
const pesoLexical = () => Number(process.env.SINDI_PESO_LEXICAL || 1); const pesoSemantico = () => Number(process.env.SINDI_PESO_SEMANTICO || 1);
const limiarSemantico = () => Number(process.env.SINDI_LIMIAR_SEMANTICO || 0.55);
/**
 * Busca híbrida: combina a lista por palavras e a lista por significado com "fusão por posição" (RRF), que dispensa comparar pontuações
 * de naturezas diferentes. Só entram pela via semântica trechos com similaridade mínima; sem embeddings, o resultado é o da busca por palavras.
 */
export async function buscarHibrido(pergunta: string, limite = 2, trechos: TrechoDoCerebro[] = trechosDoCerebro(), limiar = limiarSemantico()): Promise<Resultado[]> {
  const lexical = buscarNoCerebro(pergunta, 8, trechos);
  const semantico = (await buscarSemantico(pergunta, 8, trechos)).filter(s => s.similaridade >= limiar);
  const pontos = new Map<TrechoDoCerebro, number>(); const K = 60;
  lexical.forEach((r, i) => pontos.set(r.trecho, (pontos.get(r.trecho) ?? 0) + pesoLexical() / (K + i)));
  semantico.forEach((s, i) => pontos.set(s.trecho, (pontos.get(s.trecho) ?? 0) + pesoSemantico() / (K + i)));
  return [...pontos].map(([trecho, p]) => ({ trecho, pontos: p })).sort((a, b) => b.pontos - a.pontos).slice(0, limite);
}
