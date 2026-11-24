import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CENARIO_EXTERNO, CENARIO_INTERNO, estimar, mediaReal } from '../src/lib/custos/calculo';
import { MODELOS, modeloPorId } from '../src/lib/custos/precos';

const perto = (a: number, b: number, tolerancia = 1e-6) => assert.ok(Math.abs(a - b) <= tolerancia, `${a} ≠ ${b}`);

test('custos: cenário interno (10 pessoas × 20 msg × 22 dias) com Haiku 5.5 bate com a conta à mão', () => {
  const r = estimar(CENARIO_INTERNO);
  assert.equal(r.mensagens, 4400); perto(r.chamadas, 5060);
  perto(r.tokensEntrada, 10_120_000); perto(r.tokensSaida, 1_265_000);
  // 10,12 mi × US$ 0,10 + 1,265 mi × US$ 0,50
  perto(r.custoEntrada, 1.012); perto(r.custoSaida, 0.6325); perto(r.totalUsd, 1.6445);
  perto(r.porPessoaUsd, 0.16445); perto(r.totalBrl, 1.6445 * 5.5);
});

test('custos: Haiku 4.5 custa 10× o Haiku 5.5 na mesma carga; o externo divide por mais pessoas', () => {
  const novo = estimar(CENARIO_EXTERNO); const antigo = estimar({ ...CENARIO_EXTERNO, modelo: 'claude-haiku-4-5' });
  assert.equal(novo.mensagens, 110 * 5 * 22); perto(antigo.totalUsd / novo.totalUsd, 10, 1e-9);
  assert.ok(novo.porPessoaUsd < estimar(CENARIO_INTERNO).porPessoaUsd, 'associados usam menos por pessoa');
});

test('custos: cache reduz só a entrada; entradas absurdas não viram NaN nem custo negativo', () => {
  const sem = estimar(CENARIO_INTERNO); const com = estimar({ ...CENARIO_INTERNO, usarCache: true });
  assert.equal(com.custoSaida, sem.custoSaida); assert.ok(com.custoEntrada < sem.custoEntrada);
  perto(com.custoEntrada, sem.custoEntrada * (0.45 + 0.55 * 0.1));
  for (const ruim of [NaN, -5, Infinity]) {
    const r = estimar({ ...CENARIO_INTERNO, pessoas: ruim, mensagensPorDia: ruim, cambio: ruim });
    assert.ok(Number.isFinite(r.totalUsd) && r.totalUsd >= 0 && Number.isFinite(r.porPessoaBrl));
  }
  assert.equal(modeloPorId('inexistente').id, MODELOS[0].id);
});

test('custos: média real de /uso só com medições suficientes', () => {
  assert.equal(mediaReal([{ inputTokens: 100, outputTokens: 10, measured: 1 }]), undefined);
  assert.deepEqual(mediaReal([{ inputTokens: 40_000, outputTokens: 5_000, measured: 20 }, { inputTokens: 20_000, outputTokens: 1_000, measured: 10 }]), { entrada: 2000, saida: 200, chamadas: 30 });
});
