// Avalia o cérebro da SINDI: para cada pergunta de cerebro/avaliacao/perguntas-ouro.md, confere se a resposta direta ou as evidências
// entregues ao modelo contêm o esperado. Uso: npm run cerebro:avaliar [-- --arquivo=perguntas-ouro-ampliado.md] [-- --modelo [--so-resposta]] [-- --verbose]
// Com --modelo, também chama o chat em execução (http://localhost:3000, ou a porta de PORT) e confere a resposta final gerada pelo modelo.
import { avaliarCasos, carregarCasos } from '../../src/lib/cerebro/avaliar';

const modelo = process.argv.includes('--modelo'); const detalhado = process.argv.includes('--verbose');
async function respostaFinal(pergunta: string) {
  const base = `http://localhost:${process.env.PORT ?? 3000}`;
  const r = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ messages: [{ role: 'user', content: pergunta }], tone: 'professional', language: 'pt' }), signal: AbortSignal.timeout(240000) });
  const dados = await r.json() as { text?: string; error?: string }; return dados.text ?? dados.error ?? '';
}
const arquivo = process.argv.find(a => a.startsWith('--arquivo='))?.slice(10);
const resultados = await avaliarCasos(carregarCasos(arquivo), modelo ? respostaFinal : undefined, process.argv.includes('--so-resposta'));
for (const r of resultados) {
  console.log(`${r.ok ? 'OK ' : 'FALHA'} [${r.origem}] ${r.pergunta}${r.ok ? '' : `\n      faltam: ${r.faltam.join(' | ') || '—'}${r.proibidos.length ? ` · proibidos presentes: ${r.proibidos.join(' | ')}` : ''}`}`);
  if (detalhado && !r.ok) console.log('      evidência:', r.evidencia);
}
const aprovados = resultados.filter(r => r.ok).length;
const porCategoria = new Map<string, [number, number]>();
for (const r of resultados) { const c = porCategoria.get(r.categoria ?? 'geral') ?? [0, 0]; c[1]++; if (r.ok) c[0]++; porCategoria.set(r.categoria ?? 'geral', c); }
if (porCategoria.size > 1) { console.log('\nPor categoria:'); for (const [nome, [ok, total]] of porCategoria) console.log(`  ${nome.padEnd(14)} ${ok}/${total} (${Math.round(ok / total * 100)}%)`); }
console.log(`\n${aprovados}/${resultados.length} perguntas aprovadas${aprovados < resultados.length ? ` · falhas: ${resultados.length - aprovados}` : ''}`);
process.exit(aprovados < resultados.length ? 1 : 0);
