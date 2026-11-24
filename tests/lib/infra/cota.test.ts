import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  consumirCota,
  diaDaCota,
  mensagemDeCota,
  reiniciarCotaNaMemoria,
  segundosAteOReinicio,
} from '@/lib/infra/cota';
import { ipDoPedido } from '@/lib/http/ip';

const pedido = (cabecalhos: Record<string, string> = {}) =>
  new Request('http://localhost/api/chat', { method: 'POST', headers: cabecalhos });
async function comAmbiente(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const salvo = { ...process.env };
  const fetchOriginal = globalThis.fetch;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.SINDI_IP_HEADER;
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  reiniciarCotaNaMemoria();
  try {
    await fn();
  } finally {
    process.env = salvo;
    globalThis.fetch = fetchOriginal;
    reiniciarCotaNaMemoria();
  }
}

test('limite por pessoa: conta mensagens, mostra as que restam e bloqueia a seguinte', async () => {
  await comAmbiente({ SINDI_COTA_IP_DIA: '3', SINDI_COTA_GLOBAL_DIA: '0' }, async () => {
    const a = pedido({ 'x-real-ip': '198.51.100.1' });
    assert.equal((await consumirCota(a)).restantes, 2);
    assert.equal((await consumirCota(a)).restantes, 1);
    assert.equal((await consumirCota(a)).restantes, 0);
    const negado = await consumirCota(a);
    assert.equal(negado.ok, false);
    assert.equal(negado.motivo, 'ip');
    assert.ok(negado.reiniciaEmSegundos > 0 && negado.reiniciaEmSegundos <= 86400);
    assert.equal((await consumirCota(pedido({ 'x-real-ip': '198.51.100.2' }))).ok, true);
  });
});

test('teto global: vale para todos e recusa com a mensagem do site', async () => {
  await comAmbiente({ SINDI_COTA_IP_DIA: '0', SINDI_COTA_GLOBAL_DIA: '2' }, async () => {
    assert.equal((await consumirCota(pedido({ 'x-real-ip': '1.1.1.1' }))).ok, true);
    assert.equal((await consumirCota(pedido({ 'x-real-ip': '2.2.2.2' }))).ok, true);
    const negado = await consumirCota(pedido({ 'x-real-ip': '3.3.3.3' }));
    assert.equal(negado.ok, false);
    assert.equal(negado.motivo, 'global');
    assert.match(mensagemDeCota(negado), /limite de mensagens de hoje/);
  });
});

test('0 desliga os limites; valor inválido volta ao padrão', async () => {
  await comAmbiente({ SINDI_COTA_IP_DIA: '0', SINDI_COTA_GLOBAL_DIA: '0' }, async () => {
    for (let i = 0; i < 50; i++) assert.equal((await consumirCota(pedido())).ok, true);
    assert.equal((await consumirCota(pedido())).restantes, undefined);
  });
  await comAmbiente({ SINDI_COTA_IP_DIA: 'muito', SINDI_COTA_GLOBAL_DIA: '-3' }, async () => {
    assert.equal((await consumirCota(pedido({ 'x-real-ip': '9.9.9.9' }))).restantes, 19);
  });
});

test('o dia vira à meia-noite de São Paulo e zera a contagem', async () => {
  await comAmbiente({ SINDI_COTA_IP_DIA: '1', SINDI_COTA_GLOBAL_DIA: '0' }, async () => {
    const ontem = new Date('2026-11-19T20:00:00Z');
    const amanha = new Date('2026-11-20T20:00:00Z');
    assert.equal(diaDaCota(ontem), '2026-11-19');
    assert.equal(diaDaCota(new Date('2026-11-20T02:59:00Z')), '2026-11-19');
    assert.equal(diaDaCota(new Date('2026-11-20T03:00:00Z')), '2026-11-20');
    assert.equal(segundosAteOReinicio(new Date('2026-11-20T02:59:00Z')), 60);
    const p = pedido({ 'x-real-ip': '5.5.5.5' });
    assert.equal((await consumirCota(p, ontem)).ok, true);
    assert.equal((await consumirCota(p, ontem)).ok, false);
    assert.equal((await consumirCota(p, amanha)).ok, true);
  });
});

test('IP do visitante: cabeçalho configurável, primeiro valor da lista, sem cabeçalho cai em um grupo único', async () => {
  await comAmbiente({}, async () => {
    assert.equal(
      ipDoPedido(pedido({ 'x-vercel-forwarded-for': '203.0.113.9', 'x-real-ip': '10.0.0.1' })),
      '203.0.113.9',
    );
    assert.equal(ipDoPedido(pedido({ 'cf-connecting-ip': '203.0.113.10' })), '203.0.113.10');
    assert.equal(ipDoPedido(pedido()), 'desconhecido');
    process.env.SINDI_IP_HEADER = 'x-forwarded-for';
    assert.equal(
      ipDoPedido(pedido({ 'x-forwarded-for': '198.51.100.4, 10.0.0.1', 'x-real-ip': '10.0.0.1' })),
      '198.51.100.4',
    );
    assert.equal(ipDoPedido(pedido({ 'x-real-ip': '10.0.0.1' })), 'desconhecido');
  });
});

test('com Redis a contagem é atômica e só guarda hash do IP; se o Redis cair, a memória do processo protege', async () => {
  await comAmbiente(
    {
      SINDI_COTA_IP_DIA: '2',
      SINDI_COTA_GLOBAL_DIA: '0',
      UPSTASH_REDIS_REST_URL: 'https://redis.example',
      UPSTASH_REDIS_REST_TOKEN: 't',
    },
    async () => {
      const comandos: (string | number)[][] = [];
      let n = 0;
      globalThis.fetch = async (_url, init) => {
        comandos.push(JSON.parse(init!.body as string));
        return Response.json({ result: ++n });
      };
      assert.equal((await consumirCota(pedido({ 'x-real-ip': '192.0.2.55' }))).restantes, 1);
      assert.equal(comandos[0][0], 'EVAL');
      assert.match(String(comandos[0][1]), /INCR/);
      assert.match(String(comandos[0][3]), /^sindi:cota:ip:\d{4}-\d{2}-\d{2}:[0-9a-f]{32}$/);
      assert.ok(!JSON.stringify(comandos).includes('192.0.2.55'), 'o IP não é gravado');
      globalThis.fetch = async () => {
        throw new Error('Redis fora do ar');
      };
      assert.equal((await consumirCota(pedido({ 'x-real-ip': '192.0.2.56' }))).ok, true);
    },
  );
});
