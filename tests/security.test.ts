import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { proxy } from '../src/proxy';
test('uses a fresh CSP nonce per request and does not allow unsafe production scripts', () => {
  const previous = process.env; process.env = { ...process.env, NODE_ENV: 'production' };
  try {
    const first = proxy(new NextRequest('http://localhost/')).headers.get('Content-Security-Policy')!;
    const second = proxy(new NextRequest('http://localhost/')).headers.get('Content-Security-Policy')!;
    assert.notEqual(first, second);
    assert.match(first, /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    assert.doesNotMatch(first.split(';').find(part => part.includes('script-src'))!, /unsafe-inline|unsafe-eval/);
    assert.doesNotMatch(first.split(';').filter(part => part.includes('style-src')).join(';'), /unsafe-inline/);
    assert.match(first, /object-src 'none'/); assert.match(first, /frame-ancestors 'none'/);
  } finally { process.env = previous; }
});

