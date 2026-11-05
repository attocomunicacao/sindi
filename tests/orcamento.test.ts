import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { calcularEncargos } from '../src/lib/orcamento/encargos';
import { calcularInsumos, calcularOrcamento, HORAS_NOTURNAS_PADRAO } from '../src/lib/orcamento/calculo';
import { FUNCOES, funcaoPorId } from '../src/lib/orcamento/catalogo';
import { orcamentoSchema } from '../src/lib/orcamento/schema';
import { interpretarPostos, linkFerramenta, orcamentoAnswer } from '../src/lib/orcamento/interpretar';
import { gerarOrcamentoPdf, gerarRelatorioCustoPdf, referencia } from '../src/lib/orcamento/pdf';
import { seguro } from '../src/lib/orcamento/pdf-base';

const perto = (a: number, b: number, tolerancia = 1e-6) => assert.ok(Math.abs(a - b) < tolerancia, `${a} !== ${b}`);

test('payroll charges reproduce the spreadsheet total (84.2359%) and its four groups', () => {
  const e = calcularEncargos();
  perto(e.total, 0.8423586181780701, 1e-12);
  const [a, b, c, d] = e.grupos.map(g => g.total);
  perto(a, 0.368, 1e-12); perto(b, 0.2690555101345284, 1e-12); perto(c, 0.10640310804354156, 1e-12); perto(d, 0.0989, 1e-12);
  assert.ok(e.grupos.every(g => g.linhas.every(l => l.nome)));
  perto(e.dias.uteisAno, 263.47051829439016, 1e-9);
});
test('the spreadsheet example (10 + 1 + 1 cleaning staff, 1,000 m²) matches payroll, benefits and the gross-up formula', () => {
  const r = calcularOrcamento({ postos: [{ funcaoId: 'auxiliar-de-limpeza', quantidade: 10, turno: 'diurno' }, { funcaoId: 'auxiliar-de-limpeza-periculosidade', quantidade: 1, turno: 'diurno' }, { funcaoId: 'operador-de-maquina', quantidade: 1, turno: 'diurno' }], metrosQuadrados: 1000 });
  // Valores da aba Resumo da planilha de referência.
  perto(r.folha.salarios, 17274.65); perto(r.folha.periculosidade, 415.395); perto(r.folha.subtotal, 17690.045);
  perto(r.encargosValor, 14901.36186170788, 1e-6);
  perto(r.beneficios.cestaBasica, 1485.84); perto(r.beneficios.valeRefeicao, 5544.24); perto(r.beneficios.assistenciaSocial, 116.88); perto(r.beneficios.seguroVida, 18.12); perto(r.beneficios.valeTransporte, 2395.521); perto(r.beneficios.subtotal, 9560.601);
  perto(r.outros.subtotal, 409.5);
  // Uniformes e EPIs diferem da planilha pelos ajustes documentados: +R$ 127,95 de uniformes (kits zerados na planilha) e -R$ 17,00 de EPIs sem funcionário.
  perto(r.materiais.uniformes, 1158 + 127.95); perto(r.materiais.epis, 2417 - 17);
  perto(r.custoTotal, 46136.50786170788 + 127.95 - 17, 1e-6);
  perto(r.valorContrato, r.custoTotal / (1 - 0.2225), 1e-6);
  perto(r.tributos.totalBdi + r.tributos.totalImpostos + r.custoTotal, r.valorContrato, 1e-6);
  perto(r.precoPorMetro!, r.valorContrato / 1000, 1e-9);
});
test('night shift adds 20% of the hourly wage over the night hours plus weekly rest, and the shifts are priced separately', () => {
  const r = calcularOrcamento({ postos: [{ funcaoId: 'auxiliar-de-limpeza', quantidade: 3, turno: 'diurno' }, { funcaoId: 'auxiliar-de-limpeza', quantidade: 3, turno: 'noturno' }] });
  const [dia, noite] = r.postos;
  perto(dia.porFuncionario.adicionalNoturno, 0);
  perto(noite.porFuncionario.adicionalNoturno, (1384.65 / 220) * 0.2 * HORAS_NOTURNAS_PADRAO * (1 + 8 / 22), 1e-9);
  assert.ok(noite.valorMensal > dia.valorMensal);
  perto(dia.valorMensal + noite.valorMensal, r.valorContrato, 1e-6);
  perto(dia.valorPorFuncionario * 3, dia.valorMensal, 1e-9);
  const custom = calcularOrcamento({ postos: [{ funcaoId: 'auxiliar-de-limpeza', quantidade: 1, turno: 'noturno', horasNoturnas: 100 }] });
  perto(custom.postos[0].porFuncionario.adicionalNoturno, (1384.65 / 220) * 0.2 * 100 * (1 + 8 / 22), 1e-9);
});
test('hazard pay, unhealthy-work pay and overtime enter the payroll before charges', () => {
  const r = calcularOrcamento({ postos: [{ funcaoId: 'auxiliar-de-limpeza', quantidade: 1, turno: 'diurno', periculosidade: true, insalubridade: 0.2, horasExtras: { h50: 10 } }] });
  const f = r.postos[0].porFuncionario;
  perto(f.periculosidade, 1384.65 * 0.3, 1e-9); perto(f.insalubridade, 1212 * 0.2, 1e-9);
  perto(f.horasExtras, (1384.65 / 220) * 1.5 * 10 * (1 + 8 / 22), 1e-9);
  perto(f.encargos, f.folha * r.taxaEncargos, 1e-9);
});
test('supplies follow the spreadsheet: consumables are quantity × price, equipment is depreciated plus maintenance', () => {
  const [quimico, equipamento] = calcularInsumos([{ categoria: 'quimicos', id: 'detergente-power-det-10', quantidade: 2 }, { categoria: 'equipamentosLimpeza', id: 'aspirador-po-agua-nt27-1', quantidade: 1 }, { categoria: 'quimicos', id: 'nao-existe', quantidade: 1 }]);
  perto(quimico.custoMensal, 2 * 37.41, 1e-9);
  perto(equipamento.custoMensal, 1600 / 24 + (1600 * 0.1) / 12, 1e-9);
  const r = calcularOrcamento({ postos: [{ funcaoId: 'zelador', quantidade: 2, turno: 'diurno' }, { funcaoId: 'jardineiro', quantidade: 1, turno: 'diurno' }], insumos: [{ categoria: 'quimicos', id: 'detergente-power-det-10', quantidade: 2 }] });
  perto(r.postos.reduce((s, p) => s + p.valorMensal, 0), r.valorContrato, 1e-6);
  perto(r.materiais.insumos, 74.82, 1e-9);
});
test('only functions with a salary in the table can be quoted; night shift is restricted to functions that allow it', () => {
  assert.ok(FUNCOES.every(f => f.salario > 0));
  assert.equal(funcaoPorId('bombeiro-civil'), undefined);
  const base = { quantidade: 1, turno: 'diurno' as const };
  assert.equal(orcamentoSchema.safeParse({ postos: [{ funcaoId: 'zelador', ...base }] }).success, true);
  assert.equal(orcamentoSchema.safeParse({ postos: [{ funcaoId: 'bombeiro-civil', ...base }] }).success, false);
  assert.equal(orcamentoSchema.safeParse({ postos: [{ funcaoId: 'jardineiro', quantidade: 1, turno: 'noturno' }] }).success, false);
  assert.equal(orcamentoSchema.safeParse({ postos: [{ funcaoId: 'zelador', quantidade: 0, turno: 'diurno' }] }).success, false);
  assert.equal(orcamentoSchema.safeParse({ postos: [{ funcaoId: 'zelador', ...base }], iss: 0.5 }).success, false);
  assert.equal(orcamentoSchema.safeParse({ postos: [] }).success, false);
  const limpo = orcamentoSchema.parse({ postos: [{ funcaoId: 'zelador', ...base }], cliente: { empresa: '  Acme\n\tLtda  ' } });
  assert.equal(limpo.cliente?.empresa, 'Acme Ltda');
});
test('the chat understands staffing requests, inherits the role for "3 noturno" and ignores unrelated questions', () => {
  assert.deepEqual(interpretarPostos('Preciso de um orçamento para 3 auxiliares de limpeza diurno e 3 noturno')?.postos, [
    { funcaoId: 'auxiliar-de-limpeza', quantidade: 3, turno: 'diurno' }, { funcaoId: 'auxiliar-de-limpeza', quantidade: 3, turno: 'noturno' }]);
  assert.deepEqual(interpretarPostos('quanto custa contratar dois zeladores e um porteiro noturno para 800 m²')?.postos.map(p => `${p.quantidade} ${p.funcaoId} ${p.turno}`), ['2 zelador diurno', '1 porteiro noturno']);
  assert.equal(interpretarPostos('quanto custa contratar dois zeladores e um porteiro noturno para 800 m²')?.metrosQuadrados, 800);
  assert.equal(interpretarPostos('O que é terceirização?'), undefined);
  assert.equal(interpretarPostos('convenção coletiva da portaria 2025')?.postos[0].quantidade === 202, false);
  const resposta = orcamentoAnswer('Preciso de um orçamento para 3 auxiliares de limpeza diurno e 3 noturno', 'pt') || '';
  assert.match(resposta, /R\$\s?30\.756,86/); assert.match(resposta, /\/orcamento\?postos=auxiliar-de-limpeza%3A3%3Adiurno/);
  assert.equal(orcamentoAnswer('Quais são as 10 convenções de portaria?', 'pt'), undefined);
  assert.equal(orcamentoAnswer('Qual o valor da mensalidade de associação?', 'pt'), undefined);
  assert.match(orcamentoAnswer('Quero um orçamento de terceirização de limpeza', 'pt') || '', /ferramenta de orçamento/);
  assert.match(orcamentoAnswer('quanto custa 1 jardineiro noturno?', 'pt') || '', /não prevê turno noturno para Jardineiro/);
  assert.equal(linkFerramenta({ postos: [{ funcaoId: 'zelador', quantidade: 2, turno: 'diurno' }], metrosQuadrados: 500 }), '/orcamento?postos=zelador%3A2%3Adiurno&m2=500');
});
test('PDFs are generated with accents and unsupported characters, with a stable reference code and no page overflow', async () => {
  const entrada = { postos: [{ funcaoId: 'auxiliar-de-limpeza', quantidade: 3, turno: 'diurno' as const }, { funcaoId: 'auxiliar-de-limpeza', quantidade: 3, turno: 'noturno' as const }], metrosQuadrados: 1200, insumos: [{ categoria: 'quimicos', id: 'detergente-power-det-10', quantidade: 2 }] };
  const resultado = calcularOrcamento(entrada);
  const cliente = { empresa: 'Açaí & Cia — Ltda 😀', contato: 'João', local: 'São Paulo/SP', observacoes: 'Cobertura de seg. a sáb. '.repeat(10) };
  for (const bytes of [await gerarOrcamentoPdf(entrada, resultado, cliente), await gerarRelatorioCustoPdf(entrada, resultado, cliente)]) {
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
    const doc = await PDFDocument.load(bytes); assert.ok(doc.getPageCount() >= 1 && doc.getPageCount() <= 8);
  }
  assert.equal(referencia(entrada, cliente), referencia(entrada, cliente));
  assert.notEqual(referencia(entrada, cliente), referencia({ ...entrada, metrosQuadrados: 10 }, cliente));
  assert.equal(seguro('Nº 1 — R$ 2,00 … “ok” 😀 ≥ −'), 'Nº 1 — R$ 2,00 … “ok” ? >= -');
});
