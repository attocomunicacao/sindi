import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GET as painel } from '../src/app/api/painel/route';
import { GET as painelPdf } from '../src/app/api/painel/pdf/route';
import { GET as usage } from '../src/app/api/usage/route';
import { GET as knowledge } from '../src/app/api/knowledge/route';
import { GET as atualizarEstado, POST as atualizar } from '../src/app/api/atualizar/route';
import { GET as bibliotecaPdf } from '../src/app/api/biblioteca/pdf/[id]/route';
import { reiniciarLimitesNaMemoria } from '../src/lib/limite';

const get = (url: string, cabecalhos: Record<string, string> = {}) => new Request(url, { headers: cabecalhos });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
async function semUpstash(fn: () => Promise<void>) {
  const salvo = { ...process.env }; delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN; delete process.env.VERCEL;
  reiniciarLimitesNaMemoria();
  try { await fn(); } finally { process.env = salvo; reiniciarLimitesNaMemoria(); }
}

test('/api/painel e /api/knowledge: respondem sem expor estado interno e têm limite por minuto', async () => {
  await semUpstash(async () => {
    const p = await painel(get('http://localhost/api/painel')); assert.equal(p.status, 200); assert.equal(p.headers.get('cache-control'), 'no-store'); assert.equal(p.headers.get('x-content-type-options'), 'nosniff');
    const k = await knowledge(get('http://localhost/api/knowledge')); assert.equal(k.status, 200);
    assert.deepEqual(Object.keys(await k.json()).sort(), ['available', 'phase']);
    // 300 por minuto no painel: o 301º é recusado.
    for (let i = 0; i < 300; i++) assert.equal((await painel(get('http://localhost/api/painel', { 'x-real-ip': '198.51.100.9' }))).status, 200);
    const barrado = await painel(get('http://localhost/api/painel', { 'x-real-ip': '198.51.100.9' }));
    assert.equal(barrado.status, 429); assert.ok(barrado.headers.get('retry-after'));
  });
});

test('/api/usage: devolve os 30 dias ou um erro em JSON (nunca texto solto) e respeita o limite', async () => {
  await semUpstash(async () => {
    const r = await usage(get('http://localhost/api/usage')); assert.ok([200, 503].includes(r.status));
    const dados = await r.json(); assert.ok(r.status === 200 ? Array.isArray(dados.days) : typeof dados.error === 'string');
    for (let i = 0; i < 120; i++) await usage(get('http://localhost/api/usage', { 'x-real-ip': '198.51.100.10' }));
    assert.equal((await usage(get('http://localhost/api/usage', { 'x-real-ip': '198.51.100.10' }))).status, 429);
  });
});

test('/api/painel/pdf: limite por minuto com erro em JSON; sem dados no painel devolve 503, nunca um PDF vazio', async () => {
  await semUpstash(async () => {
    const r = await painelPdf(get('http://localhost/api/painel/pdf'));
    assert.ok([200, 503].includes(r.status)); if (r.status === 503) assert.equal((await r.json()).error, 'Painel sem dados.'); else assert.equal(r.headers.get('content-type'), 'application/pdf');
    for (let i = 0; i < 20; i++) await painelPdf(get('http://localhost/api/painel/pdf', { 'x-real-ip': '198.51.100.11' }));
    const barrado = await painelPdf(get('http://localhost/api/painel/pdf', { 'x-real-ip': '198.51.100.11' }));
    assert.equal(barrado.status, 429); assert.match((await barrado.json()).error, /Muitos pedidos/);
  });
});

test('/api/atualizar: só no computador local; repasse (Cloudflare, Vercel, IP de fora) é recusado; origem estranha também', async () => {
  await semUpstash(async () => {
    const local = await (await atualizarEstado(get('http://localhost:3000/api/atualizar', { host: 'localhost:3000' }))).json(); assert.equal(local.permitido, true); assert.ok(Array.isArray(local.linhas));
    const repasses: Record<string, string>[] = [{ 'cf-connecting-ip': '203.0.113.9' }, { 'x-real-ip': '203.0.113.9' }, { 'x-forwarded-for': '203.0.113.9' }, { 'x-vercel-id': 'gru1::abc' }];
    for (const cab of repasses) {
      assert.deepEqual(await (await atualizarEstado(get('http://localhost:3000/api/atualizar', { host: 'localhost:3000', ...cab }))).json(), { permitido: false }, JSON.stringify(cab));
    }
    const post = (cab: Record<string, string>) => atualizar(new Request('http://localhost:3000/api/atualizar', { method: 'POST', headers: { host: 'localhost:3000', 'content-type': 'application/json', ...cab }, body: '{}' }));
    const postsDeFora: Record<string, string>[] = [{ origin: 'http://localhost:3000', 'cf-connecting-ip': '203.0.113.9' }, { origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9' }];
    for (const cab of postsDeFora) {
      const r = await post(cab); assert.equal(r.status, 403); assert.match((await r.json()).error, /computador que hospeda/);
    }
    // No computador local, mas com origem de outro site: recusado antes de iniciar a coleta.
    const estranha = await post({ origin: 'https://estranho.example' }); assert.equal(estranha.status, 403); assert.equal((await estranha.json()).error, 'Origem não permitida.');
  });
});

test('/api/biblioteca/pdf/[id]: id só com dígitos (400 para 0, 0x10, 1e3, letras), erro em JSON e limite por minuto', async () => {
  await semUpstash(async () => {
    for (const id of ['0', '0x10', '1e3', 'abc', '-5', '1.5', '12345678901']) {
      const r = await bibliotecaPdf(get(`http://localhost/api/biblioteca/pdf/${id}`), ctx(id)); assert.equal(r.status, 400, id); assert.equal((await r.json()).error, 'Documento inválido.');
    }
    // id válido, mas inexistente (ou banco ausente neste ambiente): 404 em JSON, nunca um PDF.
    const inexistente = await bibliotecaPdf(get('http://localhost/api/biblioteca/pdf/987654321'), ctx('987654321'));
    assert.equal(inexistente.status, 404); assert.equal((await inexistente.json()).error, 'Documento não encontrado.');
    for (let i = 0; i < 29; i++) await bibliotecaPdf(get('http://localhost/api/biblioteca/pdf/987654321', { 'x-real-ip': '198.51.100.12' }), ctx('987654321'));
    assert.equal((await bibliotecaPdf(get('http://localhost/api/biblioteca/pdf/987654321', { 'x-real-ip': '198.51.100.12' }), ctx('987654321'))).status, 404);
    assert.equal((await bibliotecaPdf(get('http://localhost/api/biblioteca/pdf/987654321', { 'x-real-ip': '198.51.100.12' }), ctx('987654321'))).status, 429);
  });
});
