import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarTextoGemini, LlmError, mensagemDeLimite, montarCorpo } from '@/lib/ia/gemini';

const sse = (...pedacos: object[]) => pedacos.map(p => `data: ${JSON.stringify(p)}\n\n`).join('');
const corrente = (partes: Uint8Array[]) => new Response(new ReadableStream({ start(c) { partes.forEach(p => c.enqueue(p)); c.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
async function comAmbiente(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const salvo = { ...process.env }; const fetchOriginal = globalThis.fetch;
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { await fn(); } finally { process.env = salvo; globalThis.fetch = fetchOriginal; }
}

test('montarCorpo: system vira systemInstruction, assistant vira model e turnos do mesmo papel se juntam', () => {
  const corpo = montarCorpo([{ role: 'system', content: 'Regras' }, { role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'assistant', content: 'c' }, { role: 'user', content: 'd' }], { maxTokens: 120 });
  assert.deepEqual(corpo.systemInstruction, { parts: [{ text: 'Regras' }] });
  assert.deepEqual(corpo.contents.map(c => [c.role, c.parts.map(p => p.text)]), [['user', ['a', 'b']], ['model', ['c']], ['user', ['d']]]);
  assert.equal(corpo.generationConfig.temperature, 0.2); assert.equal(corpo.generationConfig.maxOutputTokens, 120);
});

test('stream: junta pedaços com UTF-8 partido, ignora o raciocínio e informa os tokens', async () => {
  await comAmbiente({ GEMINI_API_KEY: 'chave-de-teste' }, async () => {
    const bytes = new TextEncoder().encode(sse({ candidates: [{ content: { parts: [{ text: 'pensando', thought: true }, { text: 'Olá, ' }] } }] }, { candidates: [{ content: { parts: [{ text: 'açaí!' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 5, totalTokenCount: 40 } }));
    // Corta no meio de um caractere de dois bytes ("ç") e no meio de uma linha.
    const corte = bytes.lastIndexOf(0xc3) + 1;
    globalThis.fetch = async (url, init) => {
      assert.match(String(url), /:streamGenerateContent\?alt=sse$/); assert.ok(!String(url).includes('chave-de-teste'));
      assert.equal((init!.headers as Record<string, string>)['x-goog-api-key'], 'chave-de-teste');
      return corrente([bytes.slice(0, 20), bytes.slice(20, corte), bytes.slice(corte)]);
    };
    const deltas: string[] = [];
    const r = await gerarTextoGemini([{ role: 'user', content: 'Oi' }], AbortSignal.timeout(2000), t => deltas.push(t));
    assert.equal(r.text, 'Olá, açaí!'); assert.equal(deltas.join(''), 'Olá, açaí!'); assert.equal(r.truncada, false);
    assert.deepEqual(r.usage, { inputTokens: 30, outputTokens: 5, totalTokens: 40 });
  });
});

test('MAX_TOKENS marca a resposta como truncada; resposta bloqueada e linha inválida viram erros claros', async () => {
  await comAmbiente({ GEMINI_API_KEY: 'k' }, async () => {
    globalThis.fetch = async () => Response.json({ candidates: [{ content: { parts: [{ text: 'Texto cortado' }] }, finishReason: 'MAX_TOKENS' }] });
    assert.equal((await gerarTextoGemini([], AbortSignal.timeout(2000))).truncada, true);
    globalThis.fetch = async () => Response.json({ promptFeedback: { blockReason: 'SAFETY' }, candidates: [] });
    await assert.rejects(gerarTextoGemini([], AbortSignal.timeout(2000)), (e: LlmError) => e instanceof LlmError && e.status === 422);
    globalThis.fetch = async () => corrente([new TextEncoder().encode('data: {isto não é json\n\n')]);
    await assert.rejects(gerarTextoGemini([], AbortSignal.timeout(2000), () => {}), (e: LlmError) => e instanceof LlmError && e.status === 502 && /interrompeu/.test(e.message));
    globalThis.fetch = async () => corrente([new TextEncoder().encode(sse({ candidates: [] }))]);
    await assert.rejects(gerarTextoGemini([], AbortSignal.timeout(2000), () => {}), /incompleta/);
  });
});

test('erros HTTP do provedor: limite (429) lê o tempo de espera; chave recusada e modelo ausente não vazam o corpo', async () => {
  await comAmbiente({ GEMINI_API_KEY: 'k' }, async () => {
    const corpo = JSON.stringify({ error: { details: [{ retryDelay: '125s' }], message: 'detalhe interno' } });
    globalThis.fetch = async () => new Response(corpo, { status: 429 });
    await assert.rejects(gerarTextoGemini([], AbortSignal.timeout(2000)), (e: LlmError) => e.status === 429 && /3 min/.test(e.message) && !/detalhe interno/.test(e.message));
    assert.match(mensagemDeLimite('não é json'), /alguns minutos/);
    globalThis.fetch = async () => new Response('API key not valid: k', { status: 403 });
    await assert.rejects(gerarTextoGemini([], AbortSignal.timeout(2000)), (e: LlmError) => e.status === 503 && !/API key/.test(e.message));
    globalThis.fetch = async () => new Response('{}', { status: 404 });
    await assert.rejects(gerarTextoGemini([], AbortSignal.timeout(2000)), (e: LlmError) => e.status === 404);
  });
});

test('sem chave não há chamada de rede, e o nome do modelo é validado', async () => {
  await comAmbiente({ GEMINI_API_KEY: undefined }, async () => {
    globalThis.fetch = async () => { throw new Error('não deveria chamar a rede'); };
    await assert.rejects(gerarTextoGemini([], AbortSignal.timeout(1000)), (e: LlmError) => e.status === 503 && /GEMINI_API_KEY/.test(e.message));
  });
  await comAmbiente({ GEMINI_API_KEY: 'k' }, async () => {
    globalThis.fetch = async () => { throw new Error('não deveria chamar a rede'); };
    await assert.rejects(gerarTextoGemini([], AbortSignal.timeout(1000), undefined, undefined, '../outro?x=1'), /inválido/);
  });
});

test('concorrência limitada: o segundo pedido espera a vez, quem desiste da fila não vaza a vaga e a fila cheia recusa', async () => {
  await comAmbiente({ GEMINI_API_KEY: 'k', SINDI_CONCORRENCIA: '1', SINDI_FILA_MAX: '1' }, async () => {
    let liberar!: () => void; let emAndamento = 0; let maximo = 0;
    globalThis.fetch = async () => {
      emAndamento++; maximo = Math.max(maximo, emAndamento);
      await new Promise<void>(r => { liberar = r; });
      emAndamento--; return Response.json({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] });
    };
    const primeiro = gerarTextoGemini([], AbortSignal.timeout(5000));
    await new Promise(r => setTimeout(r, 10));
    const desistente = new AbortController();
    const segundo = gerarTextoGemini([], desistente.signal); const resultadoSegundo = assert.rejects(segundo, { name: 'AbortError' });
    await new Promise(r => setTimeout(r, 10));
    // Fila com 1 esperando (limite 1): o terceiro é recusado na hora.
    await assert.rejects(gerarTextoGemini([], AbortSignal.timeout(5000)), (e: LlmError) => e.status === 503);
    desistente.abort(new DOMException('desistiu', 'AbortError')); await resultadoSegundo;
    // A vaga continua só do primeiro; ao terminar, um novo pedido passa sem travar.
    liberar(); assert.equal((await primeiro).text, 'ok');
    const quarto = gerarTextoGemini([], AbortSignal.timeout(5000)); await new Promise(r => setTimeout(r, 10)); liberar();
    assert.equal((await quarto).text, 'ok'); assert.equal(maximo, 1);
  });
});

test('o tempo limite da chamada só conta a partir da vez: quem esperou na fila não perde tempo, e uma chamada travada estoura', async () => {
  await comAmbiente({ GEMINI_API_KEY: 'k', SINDI_CONCORRENCIA: '1', SINDI_TIMEOUT_MS: '300' }, async () => {
    const ok = () => Response.json({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] });
    // O primeiro ocupa a vaga por 250 ms; o segundo espera esse tempo e depois ainda tem os 300 ms completos para a própria chamada.
    globalThis.fetch = async () => { await new Promise(r => setTimeout(r, 250)); return ok(); };
    const [a, b] = await Promise.all([gerarTextoGemini([], AbortSignal.timeout(5000)), gerarTextoGemini([], AbortSignal.timeout(5000))]);
    assert.equal(a.text, 'ok'); assert.equal(b.text, 'ok');
    // Uma chamada que nunca responde é cortada pelo tempo limite e libera a vaga.
    globalThis.fetch = async (_url, init) => new Promise<Response>((_, rejeitar) => { (init!.signal as AbortSignal).addEventListener('abort', () => rejeitar((init!.signal as AbortSignal).reason), { once: true }); });
    await assert.rejects(gerarTextoGemini([], AbortSignal.timeout(5000)), { name: 'TimeoutError' });
    globalThis.fetch = async () => ok();
    assert.equal((await gerarTextoGemini([], AbortSignal.timeout(5000))).text, 'ok');
  });
});
