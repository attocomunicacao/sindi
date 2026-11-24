import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calcularNoSindi, type EntradaSimplesOficial } from '@/lib/rtc/simples-nacional';

// Conformidade com a calculadora oficial do Simples Nacional (calculadora-rtc-simples-nacional). As respostas oficiais ficam gravadas em tests/fixtures/rtc/
// (geradas por `npm run rtc:conferir:simples -- --gravar` com o serviço no ar), então este teste roda na CI sem Java. Diferença de centavo reprova.
type Caso = EntradaSimplesOficial & {
  situacao: string;
  par: string;
  oficial: { estado: string; vCBS: string; vIBS: string };
};
const { casos, origem } = JSON.parse(readFileSync('tests/fixtures/rtc/simples-nacional-casos.json', 'utf8')) as {
  casos: Caso[];
  origem: string;
};

test('conformidade RTC Simples: as fixtures vêm da calculadora oficial e cobrem os anexos III, IV e V e as situações do ISS', () => {
  assert.match(origem, /Receita Federal/);
  assert.ok(casos.length >= 70);
  assert.deepEqual([...new Set(casos.map((c) => c.anexo))].sort(), ['III', 'IV', 'V']);
  for (const par of ['com-redistribuicao', 'sem-redistribuicao'])
    assert.ok(
      casos.some((c) => c.par === par),
      par,
    );
  assert.ok(casos.every((c) => c.oficial.estado === 'CALCULADO'));
});

for (const { situacao, par, oficial, ...entrada } of casos) {
  test(`conformidade RTC Simples: Anexo ${entrada.anexo}, ${situacao}, receita R$ ${entrada.receita} = oficial ao centavo`, () => {
    const r = calcularNoSindi(entrada);
    assert.equal(r.par, par, 'o par escolhido também confere com o do serviço oficial');
    assert.deepEqual({ vCBS: r.vCBS.toFixed(2), vIBS: r.vIBS.toFixed(2) }, { vCBS: oficial.vCBS, vIBS: oficial.vIBS });
  });
}
