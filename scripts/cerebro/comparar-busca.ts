// Compara a busca por palavras, por significado e híbrida nas perguntas parafraseadas. Uso: npm run cerebro:comparar [-- --limiar=0.55] [-- --arquivo=parafrases-reserva.md]
import { readFileSync } from 'node:fs';
import { buscarHibrido, buscarNoCerebro } from '../../src/lib/cerebro/buscar';
import { buscarSemantico } from '../../src/lib/cerebro/embeddings';
import { arquivoDeCasos } from '../../src/lib/cerebro/avaliar';
import { trechosDoCerebro } from '../../src/lib/cerebro/carregar';

const norm = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').toLowerCase();
const limiar = Number(process.argv.find(a => a.startsWith('--limiar='))?.slice(9) || 0.55);
type Caso = { pergunta: string; secoes: string[]; categoria: string; estilo: string };
const casos: Caso[] = readFileSync(arquivoDeCasos(process.argv.find(a => a.startsWith('--arquivo='))?.slice(10) || 'parafrases.md'), 'utf8').replace(/\r\n/g, '\n').split(/^## /m).slice(1).map(b => {
  const linhas = b.split('\n'); return { pergunta: linhas[0].trim(), secoes: (linhas.find(l => l.startsWith('secao:')) ?? '').slice(6).split('|').map(s => norm(s.trim())).filter(Boolean),
    categoria: (linhas.find(l => l.startsWith('categoria:')) ?? '').slice(10).trim() || 'geral', estilo: (linhas.find(l => l.startsWith('estilo:')) ?? '').slice(7).trim() || 'geral' };
}).filter(c => c.secoes.length);
const trechos = trechosDoCerebro();
const acerta = (caso: Caso, lista: { trecho: { secao: string; titulo: string } }[], n: number) => lista.slice(0, n).some(r => caso.secoes.some(s => norm(`${r.trecho.secao}`).includes(s)));
// Posição (1 = primeiro) do primeiro acerto entre os 8 primeiros; 0 = sem acerto. Alimenta o MRR e o recall@5.
const posicao = (caso: Caso, lista: { trecho: { secao: string } }[]) => { const i = lista.slice(0, 8).findIndex(r => caso.secoes.some(s => norm(r.trecho.secao).includes(s))); return i < 0 ? 0 : i + 1; };
const mrr: Record<string, number> = { lexical: 0, semantico: 0, hibrido: 0 }; const cinco: Record<string, number> = { lexical: 0, semantico: 0, hibrido: 0 };
const grupos = new Map<string, { total: number; hibrido1: number; hibrido3: number }>(); const estilos = new Map<string, { total: number; hibrido1: number; hibrido3: number }>();
const placar = { lexical: [0, 0], semantico: [0, 0], hibrido: [0, 0] } as Record<string, [number, number]>; const erros: string[] = []; const simAcertos: number[] = []; const simErros: number[] = [];
for (const caso of casos) {
  const lex = buscarNoCerebro(caso.pergunta, 8, trechos);
  const semTodos = await buscarSemantico(caso.pergunta, 8, trechos); const sem = semTodos.filter(s => s.similaridade >= limiar);
  const hib = await buscarHibrido(caso.pergunta, 8, trechos, limiar);
  const resultados: [string, { trecho: { secao: string; titulo: string } }[]][] = [['lexical', lex], ['semantico', sem], ['hibrido', hib]];
  for (const [nome, lista] of resultados) {
    if (acerta(caso, lista, 1)) placar[nome][0]++; if (acerta(caso, lista, 3)) placar[nome][1]++;
    const p = posicao(caso, lista); if (p) mrr[nome] += 1 / p; if (p && p <= 5) cinco[nome]++;
  }
  for (const [mapa, chave] of [[grupos, caso.categoria], [estilos, caso.estilo]] as const) { const g = mapa.get(chave) ?? { total: 0, hibrido1: 0, hibrido3: 0 }; g.total++; if (acerta(caso, hib, 1)) g.hibrido1++; if (acerta(caso, hib, 3)) g.hibrido3++; mapa.set(chave, g); }
  if (semTodos[0]) (acerta(caso, semTodos, 1) ? simAcertos : simErros).push(semTodos[0].similaridade);
  if (!acerta(caso, hib, 3)) erros.push(`${caso.pergunta}\n      léxica: ${lex[0]?.trecho.secao ?? '(nada)'} · semântica: ${semTodos[0]?.trecho.secao ?? '(nada)'} (${semTodos[0]?.similaridade.toFixed(2) ?? '-'}) · híbrida: ${hib[0]?.trecho.secao ?? '(nada)'}`);
}
const pct = (n: number) => `${((n / casos.length) * 100).toFixed(0)}% (${n}/${casos.length})`;
console.log(`Perguntas parafraseadas: ${casos.length} · limiar semântico: ${limiar}\n`);
console.log('método      1º lugar          entre os 3 primeiros  entre os 5   MRR');
for (const [nome, [um, tres]] of Object.entries(placar)) console.log(`${nome.padEnd(11)} ${pct(um).padEnd(17)} ${pct(tres).padEnd(21)} ${pct(cinco[nome]).padEnd(12)} ${(mrr[nome] / casos.length).toFixed(2)}`);
for (const [titulo, mapa] of [['categoria', grupos], ['estilo', estilos]] as const) {
  if (mapa.size < 2) continue; console.log(`\nBusca híbrida por ${titulo}:`);
  for (const [nome, g] of mapa) console.log(`  ${nome.padEnd(14)} 1º ${String(g.hibrido1).padStart(2)}/${g.total}  ·  top-3 ${String(g.hibrido3).padStart(2)}/${g.total}`);
}
const media = (v: number[]) => v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : '-';
console.log(`\nsimilaridade do 1º semântico: acertos média ${media(simAcertos)} (mín ${simAcertos.length ? Math.min(...simAcertos).toFixed(2) : '-'}) · erros média ${media(simErros)} (máx ${simErros.length ? Math.max(...simErros).toFixed(2) : '-'})`);
if (erros.length) console.log(`\nSem acerto na híbrida (${erros.length}):\n  ${erros.join('\n  ')}`);
