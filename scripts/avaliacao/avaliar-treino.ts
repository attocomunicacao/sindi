// Mede as respostas finais da SINDI para um conjunto de perguntas: tempo até a primeira palavra, tempo total, área (conector), acertos de `espera:`/`nao:` e o texto.
// Uso: npm run avaliar:treino [-- --arquivo=treino-v1.md] [-- --categoria=rh] [-- --limite=10] [-- --resumo]
// Exige o chat em execução (http://localhost:3000 ou a porta de PORT; ou --base=URL) e o Ollama ligado. Nada é gravado além do que aparece no terminal.
import { carregarCasos } from '../../src/lib/cerebro/avaliar';
import { escolherConector } from '../../src/lib/cerebro/conectores';

const argumento = (nome: string) => process.argv.find(a => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const base = argumento('base') ?? `http://localhost:${process.env.PORT ?? 3000}`;
const categoria = argumento('categoria'); const limite = Number(argumento('limite')) || Infinity; const resumo = process.argv.includes('--resumo');
const norm = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').toLowerCase();

async function perguntar(pergunta: string) {
  const inicio = performance.now(); let primeira: number | undefined; let texto = ''; let erro = ''; let reinicios = 0; let pendente = '';
  const resposta = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson', Origin: base }, body: JSON.stringify({ messages: [{ role: 'user', content: pergunta }] }), signal: AbortSignal.timeout(300000) });
  if (!resposta.ok || !resposta.body) return { segundos: 0, primeira: 0, texto: '', erro: `HTTP ${resposta.status}`, reinicios };
  const leitor = resposta.body.getReader(); const decodificador = new TextDecoder();
  while (true) {
    const { value, done } = await leitor.read(); pendente += done ? decodificador.decode() : decodificador.decode(value, { stream: true });
    const linhas = pendente.split('\n'); pendente = done ? '' : linhas.pop() ?? '';
    for (const linha of linhas.filter(l => l.trim())) {
      const evento = JSON.parse(linha) as { type: string; text?: string; error?: string };
      if (evento.type === 'delta') { primeira ??= performance.now() - inicio; texto += evento.text ?? ''; }
      if (evento.type === 'reset') { texto = ''; reinicios++; }
      if (evento.type === 'done') texto = evento.text ?? texto;
      if (evento.type === 'error') erro = evento.error ?? 'erro';
    }
    if (done) break;
  }
  return { segundos: (performance.now() - inicio) / 1000, primeira: (primeira ?? 0) / 1000, texto, erro, reinicios };
}

const casos = carregarCasos(argumento('arquivo') ?? 'treino-v1.md', true).filter(c => !categoria || c.categoria === categoria).slice(0, limite);
const tempos: number[] = []; const primeiras: number[] = []; let aprovados = 0; let comErro = 0; let reescritas = 0;
const porCategoria = new Map<string, [number, number]>();
for (const caso of casos) {
  const r = await perguntar(caso.pergunta); const alvo = norm(r.texto.split(/\n\n(?:Referências|References): /)[0]);
  const faltam = caso.espera.filter(e => !alvo.includes(norm(e))); const proibidos = caso.nao.filter(n => alvo.includes(norm(n)));
  const ok = !r.erro && !faltam.length && !proibidos.length; if (ok) aprovados++; if (r.erro) comErro++; reescritas += r.reinicios;
  tempos.push(r.segundos); primeiras.push(r.primeira);
  const c = porCategoria.get(caso.categoria ?? 'geral') ?? [0, 0]; c[1]++; if (ok) c[0]++; porCategoria.set(caso.categoria ?? 'geral', c);
  console.log(`\n${r.erro ? 'ERRO ' : !caso.espera.length && !caso.nao.length ? 'LER  ' : ok ? 'OK   ' : 'FALHA'} ${r.segundos.toFixed(1)}s (1ª palavra ${r.primeira.toFixed(1)}s${r.reinicios ? `, ${r.reinicios} reescrita(s)` : ''}) [${escolherConector(caso.pergunta)?.id ?? 'geral'}] ${caso.pergunta}`);
  if (faltam.length || proibidos.length) console.log(`      faltam: ${faltam.join(' | ') || '—'}${proibidos.length ? ` · proibidos presentes: ${proibidos.join(' | ')}` : ''}`);
  if (!resumo) console.log(`      ${(r.erro || r.texto).replace(/\n+/g, '\n      ')}`);
}
const ordenados = [...tempos].sort((a, b) => a - b); const percentil = (p: number) => ordenados[Math.min(ordenados.length - 1, Math.floor(ordenados.length * p))] ?? 0;
console.log('\nPor categoria:'); for (const [nome, [ok, total]] of porCategoria) console.log(`  ${nome.padEnd(16)} ${ok}/${total}`);
console.log(`\n${aprovados}/${casos.length} dentro do esperado · erros: ${comErro} · reescritas pela verificação: ${reescritas}`);
console.log(`Tempo total por resposta: mediana ${percentil(0.5).toFixed(1)}s · p90 ${percentil(0.9).toFixed(1)}s · máximo ${(ordenados.at(-1) ?? 0).toFixed(1)}s · 1ª palavra (mediana) ${[...primeiras].sort((a, b) => a - b)[Math.floor(primeiras.length / 2)]?.toFixed(1) ?? '0'}s`);
