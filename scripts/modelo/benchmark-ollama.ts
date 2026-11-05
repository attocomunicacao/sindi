// Mede, direto no Ollama, a velocidade de leitura (prompt) e de escrita (resposta) de um ou mais modelos com o prompt real da SINDI.
// Uso: npm run modelo:medir -- sindi qwen2.5:3b [--threads=8]
// A primeira chamada de cada modelo lê as regras e os exemplos; a segunda mostra o ganho do cache de prefixo (só as fontes e a pergunta são lidas).
// Chamadas diretas de teste não entram no painel /uso.
import { exemplos, mensagemDoPedido, sistema } from '../../src/lib/cerebro/instrucoes';
import { geracao } from '../../src/lib/ollama';

const modelos = process.argv.slice(2).filter(a => !a.startsWith('--')); if (!modelos.length) modelos.push(process.env.OLLAMA_MODEL || 'sindi');
const threads = Number(process.argv.find(a => a.startsWith('--threads='))?.slice(10)) || geracao().num_thread;
const fonte = { url: 'https://www.sindeprestem.com.br/associe', title: 'Terceirização e trabalho temporário — Trabalho temporário', fetchedAt: new Date().toISOString(),
  content: 'O trabalho temporário é regulamentado pela Lei Federal nº 6.019/1974, alterada pela Lei 13.429/2017. É a alternativa legal para atender demandas sazonais ou para substituir empregados efetivos das empresas contratantes. Deve ser prestado por empresa devidamente registrada no Ministério do Trabalho.' };
const perguntas = ['O que é trabalho temporário?', 'Quem pode prestar trabalho temporário?'];
for (const model of modelos) for (const pergunta of perguntas) {
  const messages = [{ role: 'system', content: sistema() }, ...exemplos(), { role: 'user', content: mensagemDoPedido({ orientacao: 'Explique com base nas fontes.', palavras: 60, fontes: [fonte], pergunta }) }];
  const inicio = performance.now();
  const resposta = await fetch(new URL('/api/chat', process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: false, think: false, keep_alive: '10m', messages, options: { ...geracao(), num_thread: threads, num_predict: 240 } }), signal: AbortSignal.timeout(300000) });
  if (!resposta.ok) { console.log(JSON.stringify({ model, erro: `Ollama respondeu ${resposta.status}` })); break; }
  const r = await resposta.json() as { load_duration: number; prompt_eval_count: number; prompt_eval_duration: number; eval_count: number; eval_duration: number; message: { content: string } };
  const porSegundo = (tokens: number, nanos: number) => nanos ? Math.round(tokens / (nanos / 1e9)) : 0;
  console.log(JSON.stringify({ model, threads, segundos: Number(((performance.now() - inicio) / 1000).toFixed(1)), carga_s: Number((r.load_duration / 1e9).toFixed(1)), tokens_lidos: r.prompt_eval_count, leitura_tok_s: porSegundo(r.prompt_eval_count, r.prompt_eval_duration),
    tokens_escritos: r.eval_count, escrita_tok_s: porSegundo(r.eval_count, r.eval_duration), resposta: r.message.content.replace(/\s+/g, ' ').slice(0, 220) }));
}
