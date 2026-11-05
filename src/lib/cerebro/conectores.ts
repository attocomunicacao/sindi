import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { normalize } from '../knowledge/core';
import { lerCabecalho, pastaCerebro } from './carregar';

/**
 * Conector: um arquivo de `cerebro/conectores/` que liga um tipo de pergunta às estantes da biblioteca onde está a resposta e à instrução curta de como responder.
 * É a "divulgação progressiva" usada pelos grandes assistentes: o modelo pequeno não recebe todas as regras de todas as áreas, só a instrução da área da pergunta.
 * A escolha é por palavras (sem chamar modelo), então não custa tempo de resposta.
 */
export type Conector = {
  id: string; titulo: string; gatilhos: string[];
  /** Estantes da biblioteca (ids de `src/lib/biblioteca/estantes.ts`) pesquisadas para perguntas desta área. */
  estantes: string[];
  /** Texto da seção "Como responder", enviado ao modelo junto com as fontes. */
  instrucao: string;
  /** `orientacao`: a área admite orientação geral de método (como montar uma proposta, como organizar uma seleção) mesmo sem fonte; `fontes`: sem fonte, a SINDI não responde. */
  modo: 'fontes' | 'orientacao';
  /** Expressões que pedem um relatório ou panorama: a resposta reúne indicadores, publicações e projetos recentes (`materialDoRelatorio`). */
  relatorio: string[];
  /** Limite de palavras da resposta desta área. */
  palavras: number;
};

const LIMITE_DA_INSTRUCAO = 420;
const lista = (valor: string | undefined) => (valor ?? '').replace(/^\[|\]$/g, '').split(',').map(t => t.trim()).filter(Boolean);
const chave = (markdown: string, nome: string) => markdown.match(new RegExp(`^${nome}:[ \\t]*(.*)$`, 'm'))?.[1].trim() || undefined;

export function lerConector(arquivo: string, markdown: string): Conector | undefined {
  const texto = markdown.replace(/\r\n/g, '\n'); const { cabecalho, corpo } = lerCabecalho(texto);
  const frente = texto.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const instrucao = corpo.match(/^## Como responder\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1].replace(/<!--[\s\S]*?-->/g, '').replace(/\n{2,}/g, '\n').trim().slice(0, LIMITE_DA_INSTRUCAO) ?? '';
  if (!cabecalho.gatilhos.length || !instrucao) return undefined;
  const modo = chave(frente, 'modo'); const palavras = Number(chave(frente, 'palavras'));
  return { id: path.basename(arquivo, '.md').replace(/^\d+-/, ''), titulo: cabecalho.titulo ?? arquivo, gatilhos: cabecalho.gatilhos.map(normalize), estantes: lista(chave(frente, 'estantes')),
    instrucao, modo: modo === 'orientacao' ? modo : 'fontes', relatorio: lista(chave(frente, 'relatorio')).map(normalize), palavras: Number.isFinite(palavras) && palavras >= 30 ? Math.min(palavras, 220) : 70 };
}

let cache: { chave: string; conectores: Conector[]; verificadoEm: number } | undefined;
/** Conectores na ordem dos arquivos (o número no nome define a prioridade em caso de empate). Relidos quando mudam, como o cérebro. */
export function conectores(pasta = pastaCerebro()): Conector[] {
  if (cache && Date.now() - cache.verificadoEm < 5000) return cache.conectores;
  const dir = path.join(pasta, 'conectores');
  try {
    const arquivos = readdirSync(dir).filter(a => a.endsWith('.md') && !/^README/i.test(a)).sort();
    const assinatura = arquivos.map(a => `${a}:${statSync(path.join(dir, a)).mtimeMs}`).join('|');
    if (cache && cache.chave === assinatura) { cache.verificadoEm = Date.now(); return cache.conectores; }
    const lidos = arquivos.map(a => lerConector(a, readFileSync(path.join(dir, a), 'utf8'))).filter((c): c is Conector => Boolean(c));
    cache = { chave: assinatura, conectores: lidos, verificadoEm: Date.now() }; return lidos;
  } catch { cache = { chave: '', conectores: [], verificadoEm: Date.now() }; return []; }
}
export function reiniciarCacheDosConectores() { cache = undefined; }

/** Gatilho de uma palavra casa como palavra inteira (ou prefixo, se terminar em *); gatilho com espaço casa como expressão. */
function casa(pergunta: string, palavras: Set<string>, gatilho: string) {
  if (gatilho.endsWith('*')) { const prefixo = gatilho.slice(0, -1); return [...palavras].some(p => p.startsWith(prefixo)); }
  return gatilho.includes(' ') || gatilho.includes('-') ? pergunta.includes(gatilho) : palavras.has(gatilho);
}
/**
 * Área da pergunta: o conector com mais gatilhos presentes (expressões valem o dobro de palavras soltas). Sem nenhum gatilho, devolve `undefined`
 * e a SINDI segue só com as regras gerais. `anteriores` são as perguntas anteriores do usuário, usadas quando a atual é uma continuação curta.
 */
export function escolherConector(pergunta: string, anteriores: string[] = [], todos: Conector[] = conectores()): Conector | undefined {
  const pontuar = (texto: string) => {
    const q = normalize(texto); const palavras = new Set(q.match(/[a-z0-9]+/g) ?? []);
    return todos.map(conector => ({ conector, pontos: conector.gatilhos.reduce((soma, g) => soma + (casa(q, palavras, g) ? (g.includes(' ') ? 2 : 1) : 0), 0) })).filter(r => r.pontos > 0).sort((a, b) => b.pontos - a.pontos);
  };
  const atual = pontuar(pergunta);
  if (atual.length) return atual[0].conector;
  // Continuação ("e para empresa filiada?"): herda a área da pergunta anterior.
  return normalize(pergunta).trim().split(/\s+/).length <= 8 && anteriores.length ? pontuar(anteriores.at(-1)!)[0]?.conector : undefined;
}
/** A pergunta pede um relatório ou panorama da área deste conector? */
export function pedeRelatorio(conector: Conector | undefined, pergunta: string): boolean {
  const q = normalize(pergunta);
  return Boolean(conector?.relatorio.some(expressao => q.includes(expressao)));
}
