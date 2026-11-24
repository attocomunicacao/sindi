import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '@/app/api/rtc/regime-geral/route';
import { reiniciarLimitesNaMemoria } from '@/lib/infra/limite-por-minuto';
import { corpoParaOServico, enderecoDoServicoRtc, lerRespostaDoServico } from '@/lib/rtc/regime-geral';

const pedir = (corpo: unknown, cabecalhos: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/api/rtc/regime-geral', {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        'content-type': 'application/json',
        'x-real-ip': '203.0.113.50',
        ...cabecalhos,
      },
      body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
    }),
  );

async function comServico(url: string | undefined, fn: () => Promise<void>) {
  const salvo = process.env.SINDI_RTC_REGIME_URL;
  const fetchOriginal = globalThis.fetch;
  if (url === undefined) delete process.env.SINDI_RTC_REGIME_URL;
  else process.env.SINDI_RTC_REGIME_URL = url;
  reiniciarLimitesNaMemoria();
  try {
    await fn();
  } finally {
    globalThis.fetch = fetchOriginal;
    if (salvo === undefined) delete process.env.SINDI_RTC_REGIME_URL;
    else process.env.SINDI_RTC_REGIME_URL = salvo;
    reiniciarLimitesNaMemoria();
  }
}

const respostaOficial = (vCBS: string, vIBSUF: string, vIBSMun: string, vIBS: string, estado = 'CALCULADO') => ({
  objetos: [
    {
      estadoItem: estado,
      tribCalc: { IBSCBS: { gIBSCBS: { gCBS: { vCBS }, gIBSUF: { vIBSUF }, gIBSMun: { vIBSMun }, vIBS } } },
    },
  ],
});

test('rtc: só endereço desta máquina vale (nada de rede interna, credencial ou outro protocolo)', () => {
  assert.equal(enderecoDoServicoRtc('http://127.0.0.1:8081/api/'), 'http://127.0.0.1:8081/api');
  assert.equal(enderecoDoServicoRtc('http://localhost:8081/api'), 'http://localhost:8081/api');
  for (const ruim of [
    '',
    undefined,
    'http://10.0.0.5:8081/api',
    'http://192.168.0.10/api',
    'https://calculadora.exemplo.com/api',
    'http://169.254.169.254/latest',
    'http://user:senha@127.0.0.1:8081/api',
    'ftp://127.0.0.1/api',
    'file:///etc/passwd',
    'não é url',
  ])
    assert.equal(enderecoDoServicoRtc(ruim as string | undefined), undefined, String(ruim));
});

test('rtc: o corpo para o serviço usa NBS, CST e cClassTrib do catálogo e as alíquotas informadas', () => {
  const corpo = corpoParaOServico({
    ano: 2029,
    base: 1000,
    servicoId: 'mao-de-obra',
    aliquotas: { cbs: 8.5, ibsUf: 1.6, ibsMun: 0.25 },
  });
  assert.equal(corpo.dhFatoGerador, '2029-06-10T10:00:00-03:00');
  assert.deepEqual(corpo.itens[0].aliquotasNominais, { cbs: 8.5, ibsEstadual: 1.6, ibsMunicipal: 0.25 });
  assert.equal(corpo.itens[0].nbs, '118012100');
  assert.equal(corpo.itens[0].cClassTrib, '000001');
  assert.equal(
    'aliquotasNominais' in corpoParaOServico({ ano: 2026, base: 1000, servicoId: 'mao-de-obra' }).itens[0],
    false,
  );
});

test('rtc: resposta do serviço é lida; erro da Receita vira mensagem com o código', () => {
  assert.deepEqual(lerRespostaDoServico(respostaOficial('900.00', '100.00', '0.00', '100.00')), {
    estado: 'CALCULADO',
    vCBS: 900,
    vIBSUF: 100,
    vIBSMun: 0,
    vIBS: 100,
  });
  assert.throws(
    () =>
      lerRespostaDoServico({
        objetos: [
          {
            estadoItem: 'INCONSISTENCIA_ENTRADA',
            erros: [{ code: 'VAL-010', title: 'Quantidade de dígitos inválida' }],
          },
        ],
      }),
    /VAL-010/,
  );
  assert.throws(() => lerRespostaDoServico({}), /sem cálculo/);
});

test('rota rtc: sem o serviço ligado devolve a conta do SINDI e o motivo, sem erro', async () => {
  await comServico(undefined, async () => {
    const r = await pedir({ ano: 2026, base: 100000, servicoId: 'mao-de-obra' });
    assert.equal(r.status, 200);
    const d = (await r.json()) as { local: { vCBS: number; vIBS: number }; oficial: unknown; motivo: string };
    assert.equal(d.local.vCBS, 900);
    assert.equal(d.local.vIBS, 100);
    assert.equal(d.oficial, null);
    assert.match(d.motivo, /não está ligada/);
  });
});

test('rota rtc: com o serviço no ar, confere os valores e diz se são idênticos', async () => {
  await comServico('http://127.0.0.1:8081/api', async () => {
    const chamadas: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      chamadas.push(`${url} ${init?.method}`);
      return Response.json(respostaOficial('900.00', '100.00', '0.00', '100.00'));
    }) as typeof fetch;
    const igual = (await (await pedir({ ano: 2026, base: 100000, servicoId: 'mao-de-obra' })).json()) as {
      iguais: boolean;
    };
    assert.equal(igual.iguais, true);
    assert.deepEqual(chamadas, ['http://127.0.0.1:8081/api/calculadora/observabilidade/regime-geral POST']);
    globalThis.fetch = (async () =>
      Response.json(respostaOficial('901.00', '100.00', '0.00', '100.00'))) as typeof fetch;
    const diferente = (await (await pedir({ ano: 2026, base: 100000, servicoId: 'mao-de-obra' })).json()) as {
      iguais: boolean;
    };
    assert.equal(diferente.iguais, false);
  });
});

test('rota rtc: serviço fora do ar ou recusando o cálculo não derruba a resposta', async () => {
  await comServico('http://127.0.0.1:8081/api', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const fora = (await (await pedir({ ano: 2026, base: 100, servicoId: 'mao-de-obra' })).json()) as {
      oficial: unknown;
      motivo: string;
      local: unknown;
    };
    assert.equal(fora.oficial, null);
    assert.match(fora.motivo, /não respondeu/);
    assert.ok(fora.local);
    globalThis.fetch = (async () => new Response('erro', { status: 500 })) as typeof fetch;
    assert.equal((await pedir({ ano: 2026, base: 100, servicoId: 'mao-de-obra' })).status, 200);
  });
});

test('rota rtc: entrada hostil é recusada antes de qualquer chamada (ano, base, serviço, campos extras, origem)', async () => {
  await comServico('http://127.0.0.1:8081/api', async () => {
    let chamou = false;
    globalThis.fetch = (async () => {
      chamou = true;
      return Response.json({});
    }) as typeof fetch;
    for (const ruim of [
      { ano: 2025, base: 100, servicoId: 'mao-de-obra' },
      { ano: 2026, base: 100.005, servicoId: 'mao-de-obra' },
      { ano: 2026, base: -5, servicoId: 'mao-de-obra' },
      { ano: 2026, base: 1e15, servicoId: 'mao-de-obra' },
      { ano: 2026, base: 100, servicoId: '../../etc/passwd' },
      { ano: 2026, base: 100, servicoId: 'mao-de-obra', url: 'http://10.0.0.1' },
      { ano: 2026, base: 100, servicoId: 'mao-de-obra', aliquotas: { cbs: 500, ibsUf: 0, ibsMun: 0 } },
      { ano: '2026', base: '100', servicoId: 'mao-de-obra' },
    ])
      assert.equal((await pedir(ruim)).status, 400, JSON.stringify(ruim));
    assert.equal((await pedir('{quebrado')).status, 400);
    assert.equal(
      (await pedir({ ano: 2026, base: 100, servicoId: 'mao-de-obra' }, { origin: 'https://evil.example' })).status,
      403,
    );
    assert.equal(chamou, false, 'nenhuma chamada ao serviço com entrada inválida');
  });
});
