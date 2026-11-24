// Cobertura do cérebro: passa as perguntas de avaliação (ouro, ampliado, treino) pela decisão REAL do chat (situação, área, fontes; sem chamar o modelo) e mostra
// o que o chat alcança — de onde vêm as fontes, qual área atende, e quais estantes e arquivos de conhecimento nunca foram usados.
// Uso: npm run cerebro:cobertura [-- --arquivo=treino-v1.md] [-- --verbose]. As perguntas vêm de cerebro/avaliacao/. A busca por significado usa o Gemini
// (rode com: npx tsx --env-file=.env.local scripts/cerebro/cobertura-do-cerebro.ts).
import { existsSync, readFileSync } from 'node:fs';
import { decidirSituacao } from '@/lib/chat/situacao';
import { carregarCasos } from '@/lib/cerebro/casos';
import { arquivoDoGrafo } from '@/lib/grafo/consulta';
import type { Grafo } from '@/lib/grafo/tipos';
import { resumirUsoDoCerebro } from '@/lib/chat/uso-do-cerebro';

const detalhado = process.argv.includes('--verbose');
const um = process.argv.find((a) => a.startsWith('--arquivo='))?.slice(10);
const arquivos = um ? [um] : ['perguntas-ouro.md', 'perguntas-ouro-ampliado.md', 'treino-v1.md'];
const perguntas = [...new Set(arquivos.flatMap((a) => carregarCasos(a).map((c) => c.pergunta)))];

const contar = (m: Map<string, number>, chave: string) => m.set(chave, (m.get(chave) ?? 0) + 1);
const porSituacao = new Map<string, number>();
const porArea = new Map<string, number>();
const porOrigem = new Map<string, number>();
const porNo = new Map<string, number>();
let semFonte = 0;
for (const pergunta of perguntas) {
  const d = await decidirSituacao({ mensagens: [{ role: 'user', content: pergunta }] });
  const uso = resumirUsoDoCerebro({ conector: d.conector, situacao: d.situacao, fontes: d.escolhidas });
  contar(porSituacao, d.situacao ?? 'busca de fontes');
  contar(porArea, d.conector?.id ?? '(nenhuma área)');
  for (const o of uso.origens.length ? uso.origens : ['nenhuma']) contar(porOrigem, o);
  for (const n of uso.nos) contar(porNo, n);
  if (!d.escolhidas.length) semFonte++;
  if (detalhado)
    console.log(`${d.situacao ?? 'fontes'} | ${d.conector?.id ?? '-'} | ${uso.origens.join(',') || '-'} | ${pergunta}`);
}
const tabela = (titulo: string, m: Map<string, number>) => {
  console.log(`\n${titulo}`);
  for (const [k, v] of [...m].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
};
console.log(`${perguntas.length} perguntas (${arquivos.join(', ')}) · ${semFonte} sem nenhuma fonte`);
tabela('Situação decidida', porSituacao);
tabela('Área (conector) que atendeu', porArea);
tabela('Origem das fontes', porOrigem);

// O que o grafo tem e o chat nunca usou: estantes e arquivos de conhecimento.
const caminho = arquivoDoGrafo();
if (existsSync(caminho)) {
  const grafo = JSON.parse(readFileSync(caminho, 'utf8')) as Grafo;
  const doTipo = (t: string) => grafo.nos.filter((n) => n.tipo === t);
  const nunca = (t: string) => doTipo(t).filter((n) => !porNo.has(n.id));
  for (const [tipo, nome] of [
    ['estante', 'Estantes'],
    ['conhecimento', 'Arquivos de conhecimento'],
  ] as const) {
    const sem = nunca(tipo);
    console.log(`\n${nome} nunca usados nas respostas: ${sem.length}/${doTipo(tipo).length}`);
    for (const n of sem) console.log(`  - ${n.rotulo} (${n.id})`);
  }
} else console.log('\n(sem grafo gerado: rode npm run grafo:gerar para ver o que nunca foi alcançado)');
