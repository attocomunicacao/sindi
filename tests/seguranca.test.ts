import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { linkSeguro } from '@/lib/base/url-segura';
import { urlDeDocumentoValida } from '@/lib/dados/url-documento';
import { limitarPorMinuto, reiniciarLimitesNaMemoria } from '@/lib/infra/limite-por-minuto';
import { pedidoLocal } from '@/lib/atualizacao';
import { arquivoDoCache, podarCache } from '@/lib/biblioteca/pdf';
import { destinoPermitido, hostInterno, politeFetch } from '@/lib/dados/http';

const pedido = (cabecalhos: Record<string, string> = {}) => new Request('http://localhost/api/x', { headers: cabecalhos });

test('links: só http(s) sem credenciais viram href; javascript:, data: e file: viram "#"', () => {
  assert.equal(linkSeguro('https://www.sindeprestem.com.br/post/x'), 'https://www.sindeprestem.com.br/post/x');
  for (const ruim of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', 'https://usuario:senha@exemplo.com/', 'não é url', '', null, undefined]) assert.equal(linkSeguro(ruim as string), '#', String(ruim));
  assert.equal(urlDeDocumentoValida('ftp://ftp.mtps.gov.br/pdet/microdados/'), true);
  for (const ruim of ['javascript:alert(1)', 'data:text/plain,x', 'https://a:b@exemplo.com/', 'x'.repeat(3000)]) assert.equal(urlDeDocumentoValida(ruim), false);
});

test('limite por minuto: bloqueia o excesso de um visitante, não o dos outros, e libera na janela seguinte', () => {
  reiniciarLimitesNaMemoria(); const t0 = 1_000_000;
  const a = pedido({ 'x-real-ip': '198.51.100.1' });
  for (let i = 0; i < 3; i++) assert.equal(limitarPorMinuto(a, 'pdf', 3, t0 + i).ok, true);
  const negado = limitarPorMinuto(a, 'pdf', 3, t0 + 10); assert.equal(negado.ok, false); assert.ok(negado.reiniciaEmSegundos >= 1 && negado.reiniciaEmSegundos <= 60);
  assert.equal(limitarPorMinuto(pedido({ 'x-real-ip': '198.51.100.2' }), 'pdf', 3, t0 + 10).ok, true);
  assert.equal(limitarPorMinuto(a, 'outra-rota', 3, t0 + 10).ok, true, 'cada rota tem o seu limite');
  assert.equal(limitarPorMinuto(a, 'pdf', 3, t0 + 61_000).ok, true);
  reiniciarLimitesNaMemoria();
});

test('atualização só no computador local: Host local sem nenhum cabeçalho de repasse', () => {
  const salvo = process.env.VERCEL; delete process.env.VERCEL;
  try {
    assert.equal(pedidoLocal(pedido({ host: 'localhost:3000' })), true);
    assert.equal(pedidoLocal(pedido({ host: '127.0.0.1:3100' })), true);
    // O Next acrescenta x-forwarded-for com o loopback até no acesso local; só endereço de fora indica repasse.
    assert.equal(pedidoLocal(pedido({ host: 'localhost:3000', 'x-forwarded-for': '::1', 'x-forwarded-host': 'localhost:3000' })), true);
    assert.equal(pedidoLocal(pedido({ host: 'localhost:3000', 'x-forwarded-for': '127.0.0.1' })), true);
    assert.equal(pedidoLocal(pedido({ host: 'localhost:3000', 'x-forwarded-for': '127.0.0.1, 203.0.113.9' })), false);
    for (const cabecalho of ['x-forwarded-for', 'cf-connecting-ip', 'x-real-ip', 'x-vercel-forwarded-for', 'forwarded', 'cf-ray']) assert.equal(pedidoLocal(pedido({ host: 'localhost:3100', [cabecalho]: '203.0.113.9' })), false, cabecalho);
    assert.equal(pedidoLocal(pedido({ host: 'sindi.trycloudflare.com' })), false);
    process.env.VERCEL = '1'; assert.equal(pedidoLocal(pedido({ host: 'localhost' })), false);
  } finally { if (salvo === undefined) delete process.env.VERCEL; else process.env.VERCEL = salvo; }
});

test('cache de PDFs: o nome depende do endereço de origem e a poda remove vencidos, excesso de arquivos e de bytes', async () => {
  const a = arquivoDoCache(7, new URL('https://www.sindeprestem.com.br/a.pdf')); const b = arquivoDoCache(7, new URL('https://www.sindeprestem.com.br/b.pdf'));
  assert.notEqual(a, b); assert.match(path.basename(a), /^7-[0-9a-f]{12}\.pdf$/);
  const pasta = mkdtempSync(path.join(tmpdir(), 'sindi-pdf-')); const agora = Date.now();
  try {
    const criar = (nome: string, bytes: number, idadeMs: number) => { const f = path.join(pasta, nome); writeFileSync(f, Buffer.alloc(bytes, 1)); const d = new Date(agora - idadeMs); utimesSync(f, d, d); return f; };
    const velho = criar('1-aaa.pdf', 10, 10_000); const recente1 = criar('2-bbb.pdf', 10, 100); const recente2 = criar('3-ccc.pdf', 10, 200); const recente3 = criar('4-ddd.pdf', 10, 300); const grande = criar('5-eee.pdf', 500, 400);
    const removidos = await podarCache(pasta, agora, { arquivos: 3, bytes: 100, validadeMs: 5_000 });
    assert.equal(removidos, 2); // o vencido e o que estoura o teto de bytes
    assert.equal(existsSync(velho), false); assert.equal(existsSync(grande), false);
    assert.ok([recente1, recente2, recente3].every(existsSync));
    assert.equal(await podarCache(pasta, agora, { arquivos: 1, bytes: 100, validadeMs: 5_000 }), 2); assert.ok(existsSync(recente1));
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});

test('coletores: destinos internos, IPs e portas fora do padrão são bloqueados', () => {
  for (const interno of ['localhost', 'intranet', '127.0.0.1', '10.0.0.5', '169.254.169.254', '[::1]', '2130706433', 'servidor.local', 'api.internal']) assert.equal(hostInterno(interno), true, interno);
  for (const externo of ['www.camara.leg.br', 'servicodados.ibge.gov.br', 'api.bcb.gov.br']) assert.equal(hostInterno(externo), false, externo);
  assert.throws(() => destinoPermitido(new URL('http://www.camara.leg.br/')), /HTTPS/);
  assert.throws(() => destinoPermitido(new URL('https://u:s@www.camara.leg.br/')), /credenciais/);
  assert.throws(() => destinoPermitido(new URL('https://www.camara.leg.br:8443/')), /Porta/);
  assert.throws(() => destinoPermitido(new URL('https://169.254.169.254/latest/meta-data')), /interno/);
  assert.doesNotThrow(() => destinoPermitido(new URL('https://www.camara.leg.br/')));
});

test('politeFetch: segue redirecionamento só para destino permitido e não tenta de novo um destino bloqueado', async () => {
  const original = globalThis.fetch; const visitados: string[] = [];
  try {
    globalThis.fetch = (async (url: URL | string) => {
      visitados.push(String(url));
      if (String(url).endsWith('/entrada')) return new Response(null, { status: 302, headers: { location: 'https://servicodados.ibge.gov.br/destino' } });
      if (String(url).endsWith('/mal')) return new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data' } });
      if (String(url).endsWith('/http')) return new Response(null, { status: 301, headers: { location: 'http://exemplo.gov.br/' } });
      return new Response('conteúdo ok');
    }) as typeof fetch;
    const ok = await politeFetch('https://www.ibge.gov.br/entrada', { minMs: 0, respectRobots: false });
    assert.equal(await ok.text(), 'conteúdo ok'); assert.deepEqual(visitados, ['https://www.ibge.gov.br/entrada', 'https://servicodados.ibge.gov.br/destino']);
    await assert.rejects(politeFetch('https://www.ibge.gov.br/mal', { minMs: 0, respectRobots: false }), /interno/);
    await assert.rejects(politeFetch('https://www.ibge.gov.br/http', { minMs: 0, respectRobots: false }), /HTTPS/);
    assert.ok(!visitados.includes('https://169.254.169.254/latest/meta-data'), 'o destino interno nunca é acessado');
  } finally { globalThis.fetch = original; }
});
