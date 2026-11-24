import { test } from 'node:test';
import assert from 'node:assert/strict';
import { origemConfiavel } from '@/lib/infra/origem';

test('proxy accepts only the exact configured HTTPS origin and same-origin local requests', () => {
  const publicOrigin = 'https://sindi-prototipo.vercel.app';
  assert.equal(origemConfiavel(publicOrigin, 'demo.trycloudflare.com', publicOrigin), true);
  assert.equal(origemConfiavel('http://localhost:3100', 'localhost:3100'), true);
  for (const origin of [
    null,
    'null',
    'https://evil.example',
    'https://sindi-prototipo.vercel.app.evil.example',
    'https://sindi-prototipo.vercel.app/path',
    'https://sindi-prototipo.vercel.app/',
    'http://sindi-prototipo.vercel.app',
  ]) {
    assert.equal(origemConfiavel(origin, 'demo.trycloudflare.com', publicOrigin), false);
  }
  assert.equal(origemConfiavel('http://localhost:3100', 'localhost:3100', '', true), false);
  assert.equal(origemConfiavel(publicOrigin, 'demo.trycloudflare.com'), false);
});
