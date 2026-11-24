import assert from 'node:assert/strict';
import test from 'node:test';
import { corpoDoOrcamento } from '@/componentes/orcamento/corpo-do-orcamento';
import { novoPosto } from '@/componentes/orcamento/posto';
import { lerNumero } from '@/lib/base/formato';
import {
  calcularOrcamento,
  erroDaEntrada,
  LIMITE_DE_HORAS_NOTURNAS,
  LIMITE_DE_QUANTIDADE,
  type OrcamentoEntrada,
} from '@/lib/orcamento/calculo';

const postos = [{ funcaoId: 'auxiliar-de-limpeza', quantidade: 3, turno: 'diurno' as const }];

test('lerNumero: milhar em pt-BR continua valendo, mas "0.100" é 0,1 (alíquota digitada com ponto), não 100', () => {
  assert.equal(lerNumero('1.200'), 1200);
  assert.equal(lerNumero('1.200,50'), 1200.5);
  assert.equal(lerNumero('500.000'), 500000);
  assert.equal(lerNumero('0.100'), 0.1);
  assert.equal(lerNumero('0.9'), 0.9);
  assert.equal(lerNumero('8,8'), 8.8);
  assert.equal(lerNumero('1.5'), 1.5);
  assert.equal(lerNumero('-3'), undefined);
  assert.equal(lerNumero('abc'), undefined);
  assert.equal(lerNumero(''), undefined);
});

test('área em m²: "1.200" são mil e duzentos metros (antes virava 1,2) e "1.200,50" não vira NaN', () => {
  const posto = [novoPosto('auxiliar-de-limpeza', 2, 'diurno')];
  assert.equal(corpoDoOrcamento(posto, [], '1.200', 0.05).metrosQuadrados, 1200);
  assert.equal(corpoDoOrcamento(posto, [], '1.200,50', 0.05).metrosQuadrados, 1200.5);
  assert.equal(corpoDoOrcamento(posto, [], '850,5', 0.05).metrosQuadrados, 850.5);
  assert.equal('metrosQuadrados' in corpoDoOrcamento(posto, [], '', 0.05), false);
  assert.equal('metrosQuadrados' in corpoDoOrcamento(posto, [], 'abc', 0.05), false);
});

test('entrada fora dos limites é recusada com o motivo (a mesma regra da tela e do servidor)', () => {
  const entrada = (p: Partial<OrcamentoEntrada['postos'][number]>, extra: Partial<OrcamentoEntrada> = {}) =>
    ({ postos: [{ ...postos[0], ...p }], ...extra }) as OrcamentoEntrada;
  assert.equal(erroDaEntrada(entrada({})), undefined);
  assert.match(erroDaEntrada(entrada({ quantidade: LIMITE_DE_QUANTIDADE + 1 }))!, /quantidade/);
  assert.match(
    erroDaEntrada(entrada({ turno: 'noturno', horasNoturnas: LIMITE_DE_HORAS_NOTURNAS + 1 }))!,
    /horas noturnas/,
  );
  assert.match(erroDaEntrada(entrada({ turno: 'noturno', horasNoturnas: -1 }))!, /horas noturnas/);
  assert.match(erroDaEntrada(entrada({}, { iss: 0.07 }))!, /ISS/);
  assert.match(erroDaEntrada(entrada({}, { metrosQuadrados: -5 }))!, /área/);
  assert.throws(() => calcularOrcamento(entrada({ quantidade: 9999 })), RangeError);
  assert.doesNotThrow(() => calcularOrcamento(entrada({ quantidade: LIMITE_DE_QUANTIDADE })));
});

test('Reforma: o valor do serviço, a base de CBS/IBS e o total da nota são centavos e fecham entre si', () => {
  const r = calcularOrcamento({ postos, tributacao: { modo: 'reforma', ano: 2028 } });
  const nota = r.tributacao!.nota!;
  const centavos = (v: number) => Math.round(v * 100) / 100;
  assert.equal(nota.valorServico, centavos(nota.valorServico));
  assert.equal(nota.totalNota, centavos(nota.valorServico + nota.cbs + nota.ibs));
});

test('encargos: no Simples a taxa de encargos do resultado é menor que a do regime atual (o rodapé usa a do resultado)', () => {
  const atual = calcularOrcamento({ postos });
  const simples = calcularOrcamento({
    postos,
    tributacao: { modo: 'simples', anexo: 'IV', rbt12: 1_000_000, folha12: 400_000, ano: 2026 },
  });
  assert.ok(simples.taxaEncargos < atual.taxaEncargos, `${simples.taxaEncargos} < ${atual.taxaEncargos}`);
});
