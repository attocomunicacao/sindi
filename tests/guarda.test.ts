import { test } from 'node:test';
import assert from 'node:assert/strict';
import { erroJson, guardaDeEscrita, guardaDeLeitura, lerJsonLimitado, origemPermitida, respostaPdf } from '@/lib/http/guarda';
import { reiniciarLimitesNaMemoria } from '@/lib/infra/limite-por-minuto';

const post = (corpo: BodyInit | null, cabecalhos: Record<string, string> = {}) =>
  new Request('http://localhost/api/x', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...cabecalhos }, body: corpo });
const opcoes = { nome: 'teste', limiteBytes: 100 };

test('erroJson: sempre JSON { error } sem cache, com campos extras e cabeçalhos opcionais', async () => {
  const r = erroJson('Falhou', 418, { restantes: 0 }, { 'Retry-After': '30' });
  assert.equal(r.status, 418); assert.equal(r.headers.get('cache-control'), 'no-store'); assert.equal(r.headers.get('retry-after'), '30');
  assert.deepEqual(await r.json(), { error: 'Falhou', restantes: 0 });
});

test('origem: igual à do servidor ou à pública configurada; ausente ou estranha é recusada', () => {
  const salvo = process.env.SINDI_PUBLIC_ORIGIN;
  try {
    delete process.env.SINDI_PUBLIC_ORIGIN;
    assert.equal(origemPermitida(post('{}')), true);
    assert.equal(origemPermitida(post('{}', { origin: 'https://estranho.example' })), false);
    process.env.SINDI_PUBLIC_ORIGIN = 'https://sindi.example';
    assert.equal(origemPermitida(post('{}', { origin: 'https://sindi.example' })), true);
    assert.equal(origemPermitida(new Request('http://localhost/api/x', { method: 'POST', body: '{}' })), false);
  } finally { if (salvo === undefined) delete process.env.SINDI_PUBLIC_ORIGIN; else process.env.SINDI_PUBLIC_ORIGIN = salvo; }
});

test('escrita: origem (403), tipo (415), tamanho (413) e JSON inválido (400), nessa ordem, e o JSON válido passa', async () => {
  reiniciarLimitesNaMemoria();
  const status = async (r: Request, o = opcoes) => { const g = await guardaDeEscrita(r, o); return 'resposta' in g ? g.resposta.status : 200; };
  assert.equal(await status(post('{"a":1}', { origin: 'https://estranho.example' })), 403);
  assert.equal(await status(post('{"a":1}', { 'content-type': 'text/plain' })), 415);
  assert.equal(await status(post('x'.repeat(200))), 413);
  assert.equal(await status(post('{isto não é json')), 400);
  assert.equal(await status(post(null)), 400);
  const ok = await guardaDeEscrita(post('{"a":1}'), opcoes); assert.deepEqual('json' in ok ? ok.json : undefined, { a: 1 });
  // O corpo de 4xx não é lido além do limite: 413 vale mesmo com o corpo em pedaços.
  const em = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"a":"')); c.enqueue(new TextEncoder().encode('x'.repeat(150))); c.close(); } });
  assert.equal(await status(new Request('http://localhost/api/x', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: em, duplex: 'half' } as RequestInit)), 413);
});

test('escrita: textos próprios das mensagens e corpo opcional (ausente ou sem tipo JSON é aceito; malformado com tipo JSON é recusado)', async () => {
  reiniciarLimitesNaMemoria();
  const grande = await guardaDeEscrita(post('x'.repeat(200)), { ...opcoes, textos: { grande: 'Conversa muito longa.' } });
  assert.equal('resposta' in grande && (await grande.resposta.json()).error, 'Conversa muito longa.');
  const invalido = await guardaDeEscrita(post('{ruim'), { ...opcoes, textos: { invalido: 'Mensagem inválida.' } });
  assert.equal('resposta' in grande && 'resposta' in invalido && (await invalido.resposta.json()).error, 'Mensagem inválida.');
  const opcional = { ...opcoes, corpo: 'opcional' as const };
  assert.deepEqual(await guardaDeEscrita(post(null), opcional), { json: undefined });
  assert.deepEqual(await guardaDeEscrita(post('texto qualquer', { 'content-type': 'text/plain' }), opcional), { json: undefined });
  assert.deepEqual(await guardaDeEscrita(post('{"completa":true}'), opcional), { json: { completa: true } });
  const malformado = await guardaDeEscrita(post('{ruim'), opcional); assert.ok('resposta' in malformado && malformado.resposta.status === 400);
  assert.deepEqual(await lerJsonLimitado(post(null), 10), { json: undefined });
});

test('limite por minuto: a escrita e a leitura devolvem 429 em JSON com Retry-After, e cada rota tem o seu limite', async () => {
  reiniciarLimitesNaMemoria();
  const com = { ...opcoes, nome: 'rota-a', limitePorMinuto: 2 };
  assert.ok(!('resposta' in await guardaDeEscrita(post('{}'), com))); assert.ok(!('resposta' in await guardaDeEscrita(post('{}'), com)));
  const terceiro = await guardaDeEscrita(post('{}'), com);
  assert.ok('resposta' in terceiro); assert.equal(terceiro.resposta.status, 429); assert.ok(Number(terceiro.resposta.headers.get('retry-after')) > 0);
  assert.match((await terceiro.resposta.json()).error, /Muitos pedidos/);
  const outraRota = await guardaDeEscrita(post('{}'), { ...com, nome: 'rota-b' }); assert.ok(!('resposta' in outraRota));
  const get = () => new Request('http://localhost/api/y');
  assert.equal(guardaDeLeitura(get(), 'leitura', 1), undefined);
  const barrado = guardaDeLeitura(get(), 'leitura', 1); assert.equal(barrado?.status, 429); assert.equal(barrado?.headers.get('content-type')?.includes('application/json'), true);
  // Sem limitePorMinuto não há limite (o chat usa a cota de mensagens).
  for (let i = 0; i < 20; i++) assert.ok(!('resposta' in await guardaDeEscrita(post('{}'), opcoes)));
  reiniciarLimitesNaMemoria();
});

test('respostaPdf: download por padrão, inline sob pedido, com tamanho, cache e nosniff', async () => {
  const bytes = new TextEncoder().encode('%PDF-1.7 teste');
  const baixar = respostaPdf(bytes, 'a.pdf');
  assert.equal(baixar.headers.get('content-type'), 'application/pdf'); assert.equal(baixar.headers.get('content-disposition'), 'attachment; filename="a.pdf"');
  assert.equal(baixar.headers.get('content-length'), String(bytes.length)); assert.equal(baixar.headers.get('cache-control'), 'no-store'); assert.equal(baixar.headers.get('x-content-type-options'), 'nosniff');
  const ver = respostaPdf(bytes, 'b.pdf', { inline: true, cache: 'public, max-age=3600', extras: { 'X-Frame-Options': 'SAMEORIGIN' } });
  assert.equal(ver.headers.get('content-disposition'), 'inline; filename="b.pdf"'); assert.equal(ver.headers.get('cache-control'), 'public, max-age=3600'); assert.equal(ver.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(new TextDecoder().decode(new Uint8Array(await ver.arrayBuffer())), '%PDF-1.7 teste');
});
