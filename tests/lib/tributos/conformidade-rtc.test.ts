import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calcularCbsIbsServico } from '@/lib/tributos/regime-regular';
import { SERVICOS } from '@/lib/tributos/servicos';

// Conformidade com a calculadora oficial da Receita (calculadora-rtc-regime-regular). As respostas oficiais ficam gravadas em tests/fixtures/rtc/ (geradas por
// `npm run rtc:conferir:regime -- --gravar` com o serviço no ar), então este teste roda na CI sem Java. Qualquer diferença de centavo entre a nossa conta e a oficial reprova.
type Caso = {
  servicoId: string;
  uf: string;
  ano: number;
  base: number;
  aliquotas?: { cbs: number; ibsEstadual: number; ibsMunicipal: number };
  oficial: { estado: string; vCBS: string; vIBSUF: string; vIBSMun: string; vIBS: string };
};
const { casos, origem } = JSON.parse(readFileSync('tests/fixtures/rtc/regime-geral-casos.json', 'utf8')) as {
  casos: Caso[];
  origem: string;
};

test('conformidade RTC: as fixtures vêm da calculadora oficial e cobrem 2026 (oficial) e 2027–2033 (alíquotas informadas, simulado)', () => {
  assert.match(origem, /Receita Federal/);
  assert.ok(casos.length >= 190);
  assert.deepEqual(
    [...new Set(casos.map((c) => c.servicoId))].sort(),
    SERVICOS.map((s) => s.id).sort(),
    'todos os serviços do catálogo',
  );
  assert.ok(new Set(casos.map((c) => c.uf)).size >= 3, 'mais de um município');
  assert.ok(casos.some((c) => c.ano === 2026 && c.oficial.estado === 'CALCULADO'));
  assert.ok(casos.some((c) => c.ano > 2026 && c.oficial.estado === 'CALCULO_SIMULADO'));
});

for (const c of casos) {
  test(`conformidade RTC: ${c.servicoId} (${c.uf}), ${c.ano}, base R$ ${c.base}${c.aliquotas ? ' (alíquotas informadas)' : ''} = oficial ao centavo`, () => {
    const r = calcularCbsIbsServico({
      base: c.base,
      ano: c.ano,
      servicoId: c.servicoId,
      ...(c.aliquotas
        ? { aliquotas: { cbs: c.aliquotas.cbs, ibsUf: c.aliquotas.ibsEstadual, ibsMun: c.aliquotas.ibsMunicipal } }
        : {}),
    });
    assert.deepEqual(
      { vCBS: r.vCBS.toFixed(2), vIBSUF: r.vIBSUF.toFixed(2), vIBSMun: r.vIBSMun.toFixed(2), vIBS: r.vIBS.toFixed(2) },
      { vCBS: c.oficial.vCBS, vIBSUF: c.oficial.vIBSUF, vIBSMun: c.oficial.vIBSMun, vIBS: c.oficial.vIBS },
    );
    assert.equal(
      r.simulado,
      c.oficial.estado === 'CALCULO_SIMULADO',
      'o estado "simulado" também confere com o oficial',
    );
  });
}
