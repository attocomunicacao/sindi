import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { POST as danfse } from '@/app/api/danfse/route';
import { reiniciarLimitesNaMemoria } from '@/lib/infra/limite-por-minuto';

const XML = readFileSync(new URL('../fixtures/nfse-exemplo.xml', import.meta.url), 'utf8');
const requisicao = (init: { origem?: string | null; tipo?: string | null; corpo?: BodyInit; ip?: string } = {}) => {
  const headers = new Headers();
  if (init.origem !== null) headers.set('origin', init.origem ?? 'http://localhost');
  if (init.tipo !== null) headers.set('content-type', init.tipo ?? 'application/json');
  if (init.ip) headers.set('x-real-ip', init.ip);
  return new Request('http://localhost/api/danfse', {
    method: 'POST',
    headers,
    body: init.corpo ?? JSON.stringify({ xml: XML }),
  });
};
const chamar = (init?: Parameters<typeof requisicao>[0]) => danfse(requisicao(init));

test('POST /api/danfse: origem, tipo, JSON, validação e tamanho são checados antes de gerar', async () => {
  reiniciarLimitesNaMemoria();
  assert.equal((await chamar({ origem: 'https://estranho.example' })).status, 403);
  assert.equal((await chamar({ origem: null })).status, 403);
  assert.equal((await chamar({ tipo: 'text/plain' })).status, 415);
  assert.equal((await chamar({ corpo: 'isto não é json' })).status, 400);
  assert.equal((await chamar({ corpo: JSON.stringify({}) })).status, 400);
  assert.equal((await chamar({ corpo: JSON.stringify({ xml: '' }) })).status, 400);
  assert.equal((await chamar({ corpo: JSON.stringify({ xml: 123 }) })).status, 400);
  assert.equal((await chamar({ corpo: JSON.stringify({ xml: XML, stc: 3 }) })).status, 400);
  assert.equal((await chamar({ corpo: JSON.stringify({ xml: XML, canhoto: 'sim' }) })).status, 400);
  assert.equal((await chamar({ corpo: JSON.stringify({ xml: XML, extra: 1 }) })).status, 400);
  const grande = await chamar({ corpo: JSON.stringify({ xml: 'a'.repeat(6 * 1024 * 1024) }) });
  assert.equal(grande.status, 413);
});

test('POST /api/danfse: devolve o PDF com cabeçalhos de download e respeita situação e canhoto', async () => {
  reiniciarLimitesNaMemoria();
  const r = await chamar();
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.match(r.headers.get('content-disposition') ?? '', /attachment; filename="danfse\.pdf"/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  const bytes = new Uint8Array(await r.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
  const cancelada = await chamar({ corpo: JSON.stringify({ xml: XML, stc: 2, canhoto: false }) });
  assert.equal(cancelada.status, 200);
  assert.notDeepEqual(new Uint8Array(await cancelada.arrayBuffer()), bytes);
});

test('POST /api/danfse: XML inválido dá 400 em português, sem ecoar o conteúdo enviado', async () => {
  reiniciarLimitesNaMemoria();
  const segredo = 'SEGREDO-DO-USUARIO-12345';
  for (const xml of [
    `<Outra>${segredo}</Outra>`,
    `<!DOCTYPE a [<!ENTITY x "${segredo}">]><NFSe><infNFSe Id="a"/></NFSe>`,
    `<NFSe><infNFSe Id="a">${segredo}`,
    `<NFSe><infNFSe Id="a"><valores><vLiq>${segredo}</vLiq></valores></infNFSe></NFSe>`,
  ]) {
    const r = await chamar({ corpo: JSON.stringify({ xml }) });
    assert.equal(r.status, 400);
    const texto = await r.text();
    assert.ok(!texto.includes(segredo), 'a mensagem não pode ecoar o XML');
    assert.match(JSON.parse(texto).error, /XML|NFSe|campo/);
  }
});

test('POST /api/danfse: passou de 10 pedidos por minuto, 429 com Retry-After (por visitante)', async () => {
  reiniciarLimitesNaMemoria();
  for (let i = 0; i < 10; i++)
    assert.equal((await chamar({ ip: '203.0.113.9', corpo: JSON.stringify({ xml: '<x/>' }) })).status, 400);
  const barrado = await chamar({ ip: '203.0.113.9' });
  assert.equal(barrado.status, 429);
  assert.ok(barrado.headers.get('retry-after'));
  assert.notEqual((await chamar({ ip: '203.0.113.10', corpo: JSON.stringify({ xml: '<x/>' }) })).status, 429);
  reiniciarLimitesNaMemoria();
});
