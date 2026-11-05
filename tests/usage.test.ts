import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage, getUsage } from '../src/lib/usage';
test('records aggregate provider tokens and failures without message content', async () => {
  const saved = { ...process.env }; const originalFetch = globalThis.fetch;
  process.env.UPSTASH_REDIS_REST_URL = 'https://metrics.example'; process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
  const commands: (string | number)[][] = [];
  globalThis.fetch = async (_url, init) => { commands.push(JSON.parse(init!.body as string)); return Response.json({ result: 1 }); };
  try {
    assert.equal(await recordUsage({ success: true, durationMs: 1200, usage: { inputTokens: 100, outputTokens: 30, totalTokens: 150 } }), true);
    const command = commands[0]; const fields = Object.fromEntries(Array.from({ length: (command.length - 4) / 2 }, (_, i) => [command[4 + i * 2], command[5 + i * 2]]));
    assert.equal(fields.totalTokens, 150); assert.equal(fields.inputTokens, 100); assert.equal(fields.successes, 1);
    assert.doesNotMatch(JSON.stringify(command), /content|messages|ipAddress/);
    assert.equal(await recordUsage({ success: false, durationMs: 200 }), true);
    assert.equal(commands[1][commands[1].indexOf('errors') + 1], 1);
    globalThis.fetch = async () => Response.json({ result: ['requests', '2', 'errors', '1', 'totalTokens', '150'] });
    const result = await getUsage(); assert.equal(result.days.length, 30); assert.equal(result.days[0].requests, 2);
  } finally { globalThis.fetch = originalFetch; process.env = saved; }
});
test('production metrics report unconfigured storage without blocking chat', async () => {
  const saved = { ...process.env };
  process.env = { ...process.env, VERCEL: '1' };
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
  try { assert.equal(await recordUsage({ success: true, durationMs: 1 }), false); assert.equal((await getUsage()).available, false); }
  finally { process.env = saved; }
});

