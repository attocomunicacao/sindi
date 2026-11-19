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


test('CSP: no desenvolvimento libera eval e websocket (só para o recarregamento); a produção não, e o nonce chega à aplicação', () => {
  const previous = process.env;
  try {
    process.env = { ...previous, NODE_ENV: 'development' };
    const dev = proxy(new NextRequest('http://localhost/'));
    const politicaDev = dev.headers.get('Content-Security-Policy')!;
    assert.match(politicaDev.split(';').find(p => p.includes('script-src'))!, /unsafe-eval/); assert.match(politicaDev, /connect-src 'self' ws: wss:/);
    process.env = { ...previous, NODE_ENV: 'production' };
    const prod = proxy(new NextRequest('http://localhost/'));
    const politica = prod.headers.get('Content-Security-Policy')!;
    assert.doesNotMatch(politica, /unsafe-eval/); assert.doesNotMatch(politica, /ws:/);
    // O nonce da política é o mesmo repassado à aplicação no cabeçalho x-nonce (o Next o lê nos componentes do servidor).
    const nonce = /'nonce-([^']+)'/.exec(politica)![1];
    assert.equal(prod.headers.get('x-middleware-request-x-nonce'), nonce);
    assert.match(politica, /default-src 'self'/); assert.match(politica, /base-uri 'self'/); assert.match(politica, /form-action 'self'/);
  } finally { process.env = previous; }
});

test('o proxy cobre as páginas e deixa de fora /api, arquivos estáticos do Next e o favicon', async () => {
  const { config } = await import('../src/proxy');
  const regra = new RegExp(`^${config.matcher[0]}$`);
  for (const caminho of ['/', '/orcamento', '/base/documento/12', '/painel']) assert.equal(regra.test(caminho), true, caminho);
  for (const caminho of ['/api/chat', '/api/painel/pdf', '/_next/static/chunks/a.js', '/_next/image', '/favicon.ico']) assert.equal(regra.test(caminho), false, caminho);
});
