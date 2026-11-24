import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '@/app/api/chat/route';
import { limparRespostasGuardadas } from '@/lib/infra/cache-respostas';
import { reiniciarCotaNaMemoria } from '@/lib/infra/cota';
import { LeitorDoChat, type EventoDoChat } from '@/lib/chat/leitor-ndjson';

const sse = (texto: string) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 8, totalTokenCount: 58 } })}\n\n`;
const respostaJson = (texto: string) => Response.json({ candidates: [{ content: { parts: [{ text: texto }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 8, totalTokenCount: 58 } });
const fluxoSse = (texto: string) => new Response(new TextEncoder().encode(sse(texto)), { headers: { 'content-type': 'text/event-stream' } });
const pergunta = (texto: string, aceita = 'application/x-ndjson') => new Request('http://localhost/api/chat', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', accept: aceita }, body: JSON.stringify({ messages: [{ role: 'user', content: texto }] }) });
async function lerEventos(resposta: Response) {
  const leitor = new LeitorDoChat(); const eventos: EventoDoChat[] = []; const r = resposta.body!.getReader();
  while (true) { const { value, done } = await r.read(); eventos.push(...leitor.empurrar(value, done)); if (done) break; }
  return eventos;
}
async function comAmbiente(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const salvo = { ...process.env }; const fetchOriginal = globalThis.fetch;
  Object.assign(process.env, { GEMINI_API_KEY: 'chave-de-teste', SINDI_COTA_IP_DIA: '0', SINDI_COTA_GLOBAL_DIA: '0', SINDI_CACHE_RESPOSTAS: '1', SINDI_CHAT_POR_MINUTO: '0' });
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN; delete process.env.VERCEL;
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  limparRespostasGuardadas(); reiniciarCotaNaMemoria();
  try { await fn(); } finally { process.env = salvo; globalThis.fetch = fetchOriginal; limparRespostasGuardadas(); reiniciarCotaNaMemoria(); }
}

test('fluxo NDJSON: delta, reset (a resposta reprovada é reescrita) e done com o texto final e as mensagens restantes', async () => {
  await comAmbiente({ SINDI_COTA_IP_DIA: '5', SINDI_CACHE_RESPOSTAS: '0' }, async () => {
    let chamadas = 0;
    // 1ª geração inventa um telefone que não está nas fontes (a verificação de fatos reprova); a 2ª, de correção, vem limpa.
    globalThis.fetch = async () => { chamadas++; return fluxoSse(chamadas === 1 ? 'Ligue para (11) 4002-8922 agora.' : 'Olá! Como posso ajudar?'); };
    const resposta = await POST(pergunta('Oi'));
    assert.equal(resposta.headers.get('content-type'), 'application/x-ndjson; charset=utf-8');
    const eventos = await lerEventos(resposta);
    assert.deepEqual(eventos.map(e => e.type), ['delta', 'reset', 'delta', 'done']);
    const fim = eventos.at(-1) as Extract<EventoDoChat, { type: 'done' }>;
    assert.equal(fim.text, 'Olá! Como posso ajudar?'); assert.equal(fim.restantes, 4); assert.equal(chamadas, 2);
  });
});

test('fluxo NDJSON: cota esgotada chega como evento de erro (o texto parcial não existe) e não chama o provedor', async () => {
  await comAmbiente({ SINDI_COTA_IP_DIA: '1', SINDI_CACHE_RESPOSTAS: '0' }, async () => {
    let chamadas = 0; globalThis.fetch = async () => { chamadas++; return fluxoSse('Olá!'); };
    assert.equal((await lerEventos(await POST(pergunta('Oi')))).at(-1)?.type, 'done');
    const eventos = await lerEventos(await POST(pergunta('Oi')));
    assert.deepEqual(eventos.map(e => e.type), ['error']); assert.match((eventos[0] as { error?: string }).error ?? '', /limite de 1 mensagens/); assert.equal(chamadas, 1);
  });
});

test('cancelar a leitura no navegador aborta a geração no servidor', async () => {
  await comAmbiente({ SINDI_CACHE_RESPOSTAS: '0' }, async () => {
    let abortou = false; let comecou!: () => void; const iniciou = new Promise<void>(r => { comecou = r; });
    globalThis.fetch = async (_url, init) => {
      const sinal = init!.signal as AbortSignal; comecou();
      return new Response(new ReadableStream({
        start(controle) { controle.enqueue(new TextEncoder().encode(sse('Primeira parte, ').replace('"finishReason":"STOP"', '"finishReason":null'))); sinal.addEventListener('abort', () => { abortou = true; try { controle.error(sinal.reason); } catch { /* já encerrado */ } }, { once: true }); },
      }), { headers: { 'content-type': 'text/event-stream' } });
    };
    const resposta = await POST(pergunta('Oi')); const leitor = resposta.body!.getReader();
    await iniciou; await leitor.read(); await leitor.cancel();
    for (let i = 0; i < 40 && !abortou; i++) await new Promise(r => setTimeout(r, 25));
    assert.equal(abortou, true, 'o pedido ao provedor foi abortado');
  });
});

test('perguntas idênticas ao mesmo tempo compartilham uma única geração (e as seguintes saem da memória)', async () => {
  await comAmbiente({ SINDI_CACHE_RESPOSTAS: '1' }, async () => {
    let chamadas = 0;
    globalThis.fetch = async () => { chamadas++; await new Promise(r => setTimeout(r, 80)); return respostaJson('Olá! Sou a SINDI.'); };
    const respostas = await Promise.all([POST(pergunta('Oi', 'application/json')), POST(pergunta('Oi', 'application/json')), POST(pergunta('Oi', 'application/json'))]);
    const textos = await Promise.all(respostas.map(async r => (await r.json() as { text: string }).text));
    assert.deepEqual(textos, ['Olá! Sou a SINDI.', 'Olá! Sou a SINDI.', 'Olá! Sou a SINDI.']); assert.equal(chamadas, 1);
    assert.equal((await (await POST(pergunta('Oi', 'application/json'))).json() as { text: string }).text, 'Olá! Sou a SINDI.'); assert.equal(chamadas, 1);
  });
});

test('se a geração que os outros esperam falha, quem esperou gera a própria resposta', async () => {
  await comAmbiente({ SINDI_CACHE_RESPOSTAS: '1' }, async () => {
    let chamadas = 0;
    globalThis.fetch = async () => { chamadas++; const vez = chamadas; await new Promise(r => setTimeout(r, 50)); return vez === 1 ? new Response('{}', { status: 500 }) : respostaJson('Olá de novo!'); };
    const [primeira, segunda] = await Promise.all([POST(pergunta('Oi', 'application/json')), POST(pergunta('Oi', 'application/json'))]);
    assert.equal(primeira.status, 503, 'o único provedor falhou: mensagem neutra, sem detalhe do provedor');
    assert.equal(segunda.status, 200); assert.equal((await segunda.json() as { text: string }).text, 'Olá de novo!'); assert.equal(chamadas, 2);
  });
});
