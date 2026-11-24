import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { corpoParaOServico } from '@/lib/rtc/regime-geral';
import { corpoParaOSimples, type AnexoServico } from '@/lib/rtc/simples-nacional';
import { SERVICOS } from '@/lib/tributos/servicos';
import { validarContraOpenApi } from '../../apoio/openapi';

// Contrato com os serviços da Receita: o corpo que a SINDI envia precisa ser válido para o OpenAPI de cada serviço (guardado em tests/fixtures/rtc/, tirado do
// Swagger de cada um). Se a Receita mudar o contrato e as fixtures forem atualizadas, este teste aponta o que quebrou antes de o serviço recusar o cálculo.
const regime = JSON.parse(readFileSync('tests/fixtures/rtc/openapi-regime-geral.json', 'utf8'));
const simples = JSON.parse(readFileSync('tests/fixtures/rtc/openapi-simples-nacional.json', 'utf8'));

test('contrato: o validador reconhece campo desconhecido, obrigatório ausente e tipo errado', () => {
  const ruim = {
    id: 'x',
    versao: '1',
    municipio: '3550308',
    uf: 'SP',
    itens: [{ numero: 1, cst: '000', inventado: 1 }],
  };
  const problemas = validarContraOpenApi(regime, 'OperacaoInput', ruim);
  assert.ok(
    problemas.some((p) => /municipio: esperado integer/.test(p)),
    problemas.join('\n'),
  );
  assert.ok(problemas.some((p) => /cClassTrib: obrigatório ausente/.test(p)));
  assert.ok(problemas.some((p) => /inventado: campo desconhecido/.test(p)));
});

test('contrato regime regular: o corpo de cada serviço do catálogo, com e sem alíquotas informadas, é válido', () => {
  for (const s of SERVICOS)
    for (const aliquotas of [undefined, { cbs: 8.5, ibsUf: 1.6, ibsMun: 0.25 }]) {
      const corpo = corpoParaOServico({ ano: aliquotas ? 2029 : 2026, base: 1234.56, servicoId: s.id, aliquotas });
      assert.deepEqual(
        validarContraOpenApi(regime, 'OperacaoInput', corpo),
        [],
        `${s.id} ${aliquotas ? '2029' : '2026'}`,
      );
    }
});

test('contrato Simples Nacional: o corpo de cada anexo e situação do ISS é válido', () => {
  const par = { cbs: 2.3874, ibs: 0.0263 };
  for (const anexo of ['III', 'IV', 'V'] as AnexoServico[])
    for (const fatos of [
      { retido: false, semIss: false, isencao: false },
      { retido: true, semIss: false, isencao: false },
      { retido: false, semIss: true, isencao: false },
      ...(anexo === 'V' ? [] : [{ retido: false, semIss: false, isencao: true }]),
    ]) {
      const corpo = corpoParaOSimples({
        receita: 50000,
        anexo,
        comRedistribuicao: par,
        semRedistribuicao: par,
        ...fatos,
      });
      assert.deepEqual(
        validarContraOpenApi(simples, 'OperacaoSimplesNaoAssistidaInput', corpo),
        [],
        `${anexo} ${JSON.stringify(fatos)}`,
      );
    }
});
