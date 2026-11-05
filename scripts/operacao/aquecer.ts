// Prepara as respostas das perguntas frequentes: pergunta ao servidor em execução, uma por vez, as sugestões da tela inicial e as perguntas de treinamento.
// Cada resposta fica na memória de respostas do servidor (só em RAM, 24 horas), e quem fizer a mesma pergunta recebe a resposta em menos de um segundo.
// Uso: npx tsx scripts/operacao/aquecer.ts [--base=http://127.0.0.1:3100]   (publicar.ps1 já roda este script em segundo plano)
// Exige o token SINDI_AQUECIMENTO_TOKEN do servidor (definido por publicar.ps1), para essas chamadas não entrarem nas métricas públicas de /uso.
import { SUGESTOES } from '../../src/lib/sugestoes';
import { carregarCasos } from '../../src/lib/cerebro/avaliar';

const base = process.argv.find(a => a.startsWith('--base='))?.slice(7) ?? 'http://127.0.0.1:3100';
const token = process.env.SINDI_AQUECIMENTO_TOKEN ?? '';
const perguntas = [...new Set([...SUGESTOES, ...carregarCasos('treino-v1.md', true).map(c => c.pergunta)])];
const inicio = Date.now(); let prontas = 0;
console.log(`${new Date().toLocaleTimeString('pt-BR')} · ${perguntas.length} perguntas para preparar em ${base}`);
for (const [i, pergunta] of perguntas.entries()) {
  const t = Date.now();
  try {
    const resposta = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...(token ? { 'X-SINDI-Aquecimento': token } : {}) },
      body: JSON.stringify({ messages: [{ role: 'user', content: pergunta }] }), signal: AbortSignal.timeout(300000) });
    if (resposta.ok) prontas++;
    console.log(`${String(i + 1).padStart(3)}/${perguntas.length} ${resposta.ok ? 'pronta' : `erro ${resposta.status}`} em ${((Date.now() - t) / 1000).toFixed(1)}s`);
  } catch (falha) { console.log(`${String(i + 1).padStart(3)}/${perguntas.length} falhou (${falha instanceof Error ? falha.name : 'erro'})`); }
}
console.log(`${new Date().toLocaleTimeString('pt-BR')} · ${prontas} de ${perguntas.length} respostas prontas em ${Math.round((Date.now() - inicio) / 60000)} min`);
