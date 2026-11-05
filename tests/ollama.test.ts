import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ollamaChat } from '../src/lib/ollama';
test('serializes local generations and recovers after model failure', async () => {
  const original = globalThis.fetch; let active = 0; let maximum = 0; let calls = 0;
  globalThis.fetch = async () => {
    active++; maximum = Math.max(maximum, active); calls++;
    await new Promise(resolve => setTimeout(resolve, 10)); active--;
    return calls === 1 ? new Response('', { status: 404 }) : Response.json({ done: true, message: { content: 'Olá' }, prompt_eval_count: 7, eval_count: 3 });
  };
  try {
    const results = await Promise.allSettled([ollamaChat([], AbortSignal.timeout(1000)), ollamaChat([], AbortSignal.timeout(1000))]);
    assert.equal(maximum, 1); assert.equal(results[0].status, 'rejected');
    assert.equal(results[1].status, 'fulfilled');
    if (results[1].status === 'fulfilled') assert.equal(results[1].value.usage.totalTokens, 10);
    await assert.rejects(ollamaChat([], AbortSignal.abort()), { name: 'AbortError' });
  } finally { globalThis.fetch = original; }
});

test('streams split UTF-8 chunks and keeps final token counts', async () => {
  const original = globalThis.fetch; const saved = process.env.OLLAMA_MODEL;
  process.env.OLLAMA_MODEL = 'qwen2.5:0.5b'; const deltas: string[] = [];
  const encoded = new TextEncoder().encode(JSON.stringify({ message: { content: 'Olá!' }, done: false }) + '\n' + JSON.stringify({ done: true, message: { content: '' }, prompt_eval_count: 7, eval_count: 3 }));
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { for (let i = 0; i < encoded.length; i += 2) controller.enqueue(encoded.slice(i, i + 2)); controller.close(); } }));
  try {
    const result = await ollamaChat([{ role: 'user', content: 'Olá' }], AbortSignal.timeout(1000), text => deltas.push(text));
    assert.equal(deltas.join(''), 'Olá!'); assert.equal(result.text, 'Olá!'); assert.equal(result.usage.totalTokens, 10);
    globalThis.fetch = async () => new Response('{"message":{"content":"parcial"},"done":false}\n');
    await assert.rejects(ollamaChat([], AbortSignal.timeout(1000), () => {}), /incompleta/);
  } finally { globalThis.fetch = original; if (saved) process.env.OLLAMA_MODEL = saved; else delete process.env.OLLAMA_MODEL; }
});
