import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '@/app/api/rtc/simples-nacional/route';
import { reiniciarLimitesNaMemoria } from '@/lib/infra/limite-por-minuto';
import {
  atividadeDoAnexo,
  corpoParaOSimples,
  enderecoDoServicoSimples,
  lerRespostaDoSimples,
} from '@/lib/rtc/simples-nacional';

const entrada = {
  receita: 50000,
  anexo: 'IV',
  comRedistribuicao: { cbs: 2.3874, ibs: 0.0263 },
  semRedistribuicao: { cbs: 2.5, ibs: 0.03 },
  retido: true,
  semIss: false,
  isencao: false,
} as const;

const pedir = (corpo: unknown, cabecalhos: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/api/rtc/simples-nacional', {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        'content-type': 'application/json',
        'x-real-ip': '203.0.113.51',
        ...cabecalhos,
      },
      body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
    }),
  );

async function comServico(url: string | undefined, fn: () => Promise<void>) {
  const salvo = process.env.SINDI_RTC_SIMPLES_URL;
  const fetchOriginal = globalThis.fetch;
  if (url === undefined) delete process.env.SINDI_RTC_SIMPLES_URL;
  else process.env.SINDI_RTC_SIMPLES_URL = url;
  reiniciarLimitesNaMemoria();
  try {
    await fn();
  } finally {
    globalThis.fetch = fetchOriginal;
    if (salvo === undefined) delete process.env.SINDI_RTC_SIMPLES_URL;
    else process.env.SINDI_RTC_SIMPLES_URL = salvo;
    reiniciarLimitesNaMemoria();
  }
}

// O serviço devolve os valores como texto, mesmo o OpenAPI dizendo number.
const respostaOficial = (vCBSSN: string, vIBSSN: string, estadoItem = 'CALCULADO') => ({
  objetos: [{ estadoItem, tribCalc: { vCBSSN, vIBSSN } }],
});

test('rtc simples: só endereço desta máquina vale', () => {
  assert.equal(enderecoDoServicoSimples('http://127.0.0.1:8082/api/'), 'http://127.0.0.1:8082/api');
  for (const ruim of [
    '',
    undefined,
    'http://10.0.0.5:8082/api',
    'https://x.example.com/api',
    'http://u:s@127.0.0.1/api',
  ])
    assert.equal(enderecoDoServicoSimples(ruim as string | undefined), undefined, String(ruim));
});

test('rtc simples: o corpo é uma NFS-e de optante, com a atividade do anexo e os fatos do ISS', () => {
  assert.equal(atividadeDoAnexo('III', false), '07');
  assert.equal(atividadeDoAnexo('IV', false), '14');
  assert.equal(atividadeDoAnexo('V', false), '09');
  assert.equal(atividadeDoAnexo('III', true), '12');
  assert.equal(atividadeDoAnexo('IV', true), '13');
  assert.equal(atividadeDoAnexo('V', true), undefined, 'o serviço ignora a isenção fora das atividades 12 e 13');
  const corpo = corpoParaOSimples(entrada);
  assert.equal(corpo.tpDoc, '91');
  assert.equal(corpo.itens[0].cAtivSN, '14');
  assert.equal(corpo.itens[0].baseCalculo, '50000.00');
  assert.equal(corpo.itens[0].tpRetISSQN, '2');
  assert.deepEqual(corpo.aliquotasEfetivas.anexoIV, {
    pCBSSN: '2.3874',
    pIBSSN: '0.0263',
    semRedistribuicaoISS: { pCBSSN: '2.5', pIBSSN: '0.03' },
  });
  const semIss = corpoParaOSimples({ ...entrada, semIss: true }).itens[0];
  assert.equal(semIss.tribISSQN, '4');
  assert.equal('tpRetISSQN' in semIss, false);
  assert.throws(() => corpoParaOSimples({ ...entrada, anexo: 'V', isencao: true }), /Anexo V/);
});

test('rtc simples: resposta do serviço é lida; estado não calculado e erro viram mensagem', () => {
  assert.deepEqual(lerRespostaDoSimples(respostaOficial('1250.00', '15.00')), {
    estado: 'CALCULADO',
    vCBS: 1250,
    vIBS: 15,
  });
  assert.throws(
    () =>
      lerRespostaDoSimples({
        objetos: [{ estadoItem: 'INCONSISTENCIA_ENTRADA', erros: [{ code: 'VSN-039', title: 'Alíquotas ausentes' }] }],
      }),
    /VSN-039/,
  );
  assert.throws(
    () =>
      lerRespostaDoSimples({
        objetos: [{ estadoItem: 'NAO_CALCULADO', motivoEstado: { descricao: 'Regime somente receita' } }],
      }),
    /somente receita/,
  );
  assert.throws(() => lerRespostaDoSimples({}), /sem cálculo/);
});

test('rota rtc simples: sem o serviço ligado devolve a conta do SINDI e o motivo, sem erro', async () => {
  await comServico(undefined, async () => {
    const r = await pedir(entrada);
    assert.equal(r.status, 200);
    const d = (await r.json()) as {
      local: { vCBS: number; vIBS: number; par: string };
      oficial: unknown;
      motivo: string;
    };
    assert.deepEqual(d.local, { vCBS: 1250, vIBS: 15, par: 'sem-redistribuicao' });
    assert.equal(d.oficial, null);
    assert.match(d.motivo, /não está ligada/);
  });
});

test('rota rtc simples: com o serviço no ar, confere os valores e diz se são idênticos', async () => {
  await comServico('http://127.0.0.1:8082/api', async () => {
    const chamadas: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      chamadas.push(`${url} ${init?.method}`);
      return Response.json(respostaOficial('1250.00', '15.00'));
    }) as typeof fetch;
    const igual = (await (await pedir(entrada)).json()) as { iguais: boolean };
    assert.equal(igual.iguais, true);
    assert.deepEqual(chamadas, [
      'http://127.0.0.1:8082/api/calculadora/observabilidade/simples-nacional/nao-assistido POST',
    ]);
    globalThis.fetch = (async () => Response.json(respostaOficial('1250.01', '15.00'))) as typeof fetch;
    const diferente = (await (await pedir(entrada)).json()) as { iguais: boolean };
    assert.equal(diferente.iguais, false);
  });
});

test('rota rtc simples: isenção no Anexo V não é conferida (o serviço a ignora) e nem chama o serviço', async () => {
  await comServico('http://127.0.0.1:8082/api', async () => {
    let chamou = false;
    globalThis.fetch = (async () => {
      chamou = true;
      return Response.json({});
    }) as typeof fetch;
    const d = (await (await pedir({ ...entrada, anexo: 'V', isencao: true })).json()) as {
      oficial: unknown;
      motivo: string;
    };
    assert.equal(d.oficial, null);
    assert.match(d.motivo, /Anexo V/);
    assert.equal(chamou, false);
  });
});

test('rota rtc simples: serviço fora do ar ou recusando o cálculo não derruba a resposta', async () => {
  await comServico('http://127.0.0.1:8082/api', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const fora = (await (await pedir(entrada)).json()) as { oficial: unknown; motivo: string; local: unknown };
    assert.equal(fora.oficial, null);
    assert.match(fora.motivo, /não respondeu/);
    assert.ok(fora.local);
    globalThis.fetch = (async () => new Response('erro', { status: 500 })) as typeof fetch;
    assert.equal((await pedir(entrada)).status, 200);
  });
});

test('rota rtc simples: entrada hostil é recusada antes de qualquer chamada (anexo, receita, alíquota, campos extras, origem)', async () => {
  await comServico('http://127.0.0.1:8082/api', async () => {
    let chamou = false;
    globalThis.fetch = (async () => {
      chamou = true;
      return Response.json({});
    }) as typeof fetch;
    for (const ruim of [
      { ...entrada, anexo: 'I' },
      { ...entrada, anexo: '../../etc/passwd' },
      { ...entrada, receita: 100.005 },
      { ...entrada, receita: -5 },
      { ...entrada, receita: 1e15 },
      { ...entrada, receita: '100' },
      { ...entrada, comRedistribuicao: { cbs: 500, ibs: 0 } },
      { ...entrada, comRedistribuicao: { cbs: 1, ibs: 1, url: 'http://10.0.0.1' } },
      { ...entrada, url: 'http://10.0.0.1' },
      { ...entrada, retido: 'sim' },
    ])
      assert.equal((await pedir(ruim)).status, 400, JSON.stringify(ruim));
    assert.equal((await pedir('{quebrado')).status, 400);
    assert.equal((await pedir(entrada, { origin: 'https://evil.example' })).status, 403);
    assert.equal(chamou, false, 'nenhuma chamada ao serviço com entrada inválida');
  });
});
