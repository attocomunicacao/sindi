import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { arred2, publicarAliquota, aliquotaNfse, ErroTributario } from '@/lib/tributos/decimal';
import { ALIQUOTAS_ESTIMADAS, calcularCbsIbsServico, transicaoDoAno } from '@/lib/tributos/regime-regular';
import { calcularCbsIbsSimples, escolherParAliquotas } from '@/lib/tributos/simples-cbs-ibs';
import { calcularDas, faixaDaReceita, type Anexo } from '@/lib/tributos/das';
import { SERVICOS } from '@/lib/tributos/servicos';
import { tributacaoSchema } from '@/lib/tributos/schema';
import { calcularOrcamento } from '@/lib/orcamento/calculo';
import { calcularEncargos } from '@/lib/orcamento/encargos';
import { orcamentoSchema } from '@/lib/orcamento/schema';
import { POST as calcular } from '@/app/api/orcamento/calcular/route';
import { POST as pdf } from '@/app/api/orcamento/pdf/route';
import { reiniciarLimitesNaMemoria } from '@/lib/infra/limite-por-minuto';

const perto = (a: number, b: number, tolerancia = 1e-9) => assert.ok(Math.abs(a - b) < tolerancia, `${a} !== ${b}`);
const postos = [{ funcaoId: 'auxiliar-de-limpeza', quantidade: 3, turno: 'diurno' as const }, { funcaoId: 'zelador', quantidade: 1, turno: 'diurno' as const }];

test('arredondamento HALF_EVEN: no meio exato vai para o par; alíquota publicada com 4 casas; NFS-e com 2', () => {
  assert.equal(arred2(0.125).toString(), '0.12'); assert.equal(arred2(0.135).toString(), '0.14'); assert.equal(arred2(2.675).toString(), '2.68'); assert.equal(arred2(2.665).toString(), '2.66');
  assert.equal(publicarAliquota(1.00005).toString(), '1'); assert.equal(publicarAliquota(1.00015).toString(), '1.0002'); assert.equal(aliquotaNfse(0.125).toString(), '0.12');
  assert.throws(() => arred2(Number.NaN), ErroTributario);
});

test('exemplo da Receita: 2026, base 100.000 -> vCBS 900,00, vIBSUF 100,00, vIBSMun 0,00; não é simulado e é informativo', () => {
  const r = calcularCbsIbsServico({ base: 100000, ano: 2026 });
  perto(r.vCBS, 900); perto(r.vIBSUF, 100); perto(r.vIBSMun, 0); perto(r.vIBS, 100); perto(r.total, 1000);
  assert.equal(r.simulado, false); assert.equal(r.informativo, true);
  assert.equal(r.servico.cst, '000'); assert.equal(r.servico.cClassTrib, '000001'); assert.ok(r.memoria.length >= 4);
});

test('2027 em diante é simulado, com a tabela de referência como padrão editável; alíquotas informadas também são simuladas', () => {
  for (const ano of [2027, 2029, 2033]) { const r = calcularCbsIbsServico({ base: 100000, ano }); assert.equal(r.simulado, true, String(ano)); assert.equal(r.origemAliquotas, 'estimativa'); assert.match(r.avisos[0], /tabela de referência retirada pela Receita/); }
  const r27 = calcularCbsIbsServico({ base: 100000, ano: 2027 });
  perto(r27.vCBS, 8400); perto(r27.vIBSUF, 50); perto(r27.vIBSMun, 50); assert.equal(r27.informativo, false);
  assert.deepEqual(ALIQUOTAS_ESTIMADAS[2033], { cbs: 8.5, ibsUf: 16, ibsMun: 2.5 });
  const livre = calcularCbsIbsServico({ base: 1000, ano: 2026, aliquotas: { cbs: 1, ibsUf: 1, ibsMun: 1 } });
  assert.equal(livre.simulado, true); perto(livre.total, 30);
  assert.throws(() => calcularCbsIbsServico({ base: 1000, ano: 2034 }), ErroTributario);
  assert.throws(() => calcularCbsIbsServico({ base: -1, ano: 2026 }), ErroTributario);
  assert.throws(() => calcularCbsIbsServico({ base: 1, ano: 2026, aliquotas: { cbs: 101, ibsUf: 0, ibsMun: 0 } }), ErroTributario);
});

test('redução de 30% (cClassTrib 200052) publica a alíquota efetiva com 4 casas antes de multiplicar', () => {
  const s = SERVICOS.find(x => x.cClassTrib === '200052')!; assert.equal(s.reducaoPct, 30);
  const r = calcularCbsIbsServico({ base: 100000, ano: 2026, servicoId: 'profissoes-intelectuais' });
  perto(r.aliquotas.cbs, 0.63); perto(r.aliquotas.ibsUf, 0.07); perto(r.vCBS, 630); perto(r.vIBSUF, 70);
});

test('transição: PIS/COFINS somem em 2027 e o ISS cai a 90, 80, 70, 60% e acaba em 2033', () => {
  const fator = (ano: number) => transicaoDoAno(ano).fatorIss;
  assert.deepEqual([2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033].map(fator), [1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0]);
  assert.equal(transicaoDoAno(2026).pisCofins, true); assert.equal(transicaoDoAno(2027).pisCofins, false);
  assert.equal(transicaoDoAno(2026).cbsIbsInformativo, true); assert.equal(transicaoDoAno(2027).cbsIbsInformativo, false);
});

test('DAS: Anexo IV com RBT12 de 500.000 tem alíquota efetiva de 7,716% (faixa 3) e a CPP fica fora do DAS', () => {
  const r = calcularDas({ anexo: 'IV', rbt12: 500000, receitaMes: 100000 });
  assert.equal(r.faixa, 3); perto(r.aliquotaEfetiva, 7.716, 1e-9); perto(r.valorDas!, 7716, 0.005); assert.equal(r.cppForaDoDas, true);
  assert.equal(r.partilha.find(p => p.tributo === 'CPP')!.percentualDoDas, 0);
  assert.ok(r.avisos.some(a => /CPP/.test(a))); assert.ok(r.avisos.some(a => /CONFERIR/.test(a)));
  assert.equal(faixaDaReceita(180000), 1); assert.equal(faixaDaReceita(180000.01), 2); assert.equal(faixaDaReceita(4800000), 6);
  assert.throws(() => calcularDas({ anexo: 'IV', rbt12: 4800000.01 }), ErroTributario); assert.throws(() => calcularDas({ anexo: 'IV', rbt12: 0 }), ErroTributario);
});

test('partilha do DAS soma 100% da alíquota efetiva em todos os anexos e faixas', () => {
  for (const anexo of ['III', 'IV', 'V'] as Anexo[]) for (const rbt12 of [100000, 300000, 600000, 1500000, 3000000, 3599999.99, 4000000, 4800000]) {
    const r = calcularDas({ anexo, rbt12, folha12: 0 });
    perto(r.partilha.reduce((s, p) => s + p.percentualDoDas, 0), 100, 1e-9);
    perto(r.partilha.reduce((s, p) => s + p.aliquota, 0), r.aliquotaEfetiva, 1e-9);
  }
});

test('limite do ISS na 5ª faixa: acima de 14,92537% (Anexo III) o ISS fica em 5% e o excedente vai aos federais', () => {
  const r = calcularDas({ anexo: 'III', rbt12: 3600000 });
  assert.equal(r.faixa, 5); assert.ok(r.aliquotaEfetiva > 14.92537); assert.equal(r.issLimitado, true);
  perto(r.partilha.find(p => p.tributo === 'ISS')!.aliquota, 5, 1e-9);
  perto(r.partilha.find(p => p.tributo === 'IRPJ')!.aliquota, (r.aliquotaEfetiva - 5) * 0.0602, 1e-9);
  perto(r.partilha.find(p => p.tributo === 'CPP')!.aliquota, (r.aliquotaEfetiva - 5) * 0.6526, 1e-9);
  // Abaixo do limite não há trava; no Anexo IV o corte é 12,5%.
  assert.equal(calcularDas({ anexo: 'III', rbt12: 1900000 }).issLimitado, false);
  const iv = calcularDas({ anexo: 'IV', rbt12: 3600000 }); assert.equal(iv.issLimitado, true); perto(iv.partilha.find(p => p.tributo === 'ISS')!.aliquota, 5, 1e-9);
  perto(iv.partilha.find(p => p.tributo === 'Cofins')!.aliquota, (iv.aliquotaEfetiva - 5) * 0.3013, 1e-9);
  // 6ª faixa: ISS fora do DAS.
  const seis = calcularDas({ anexo: 'III', rbt12: 4000000 }); assert.equal(seis.issForaDoDas, true); assert.equal(seis.partilha.find(p => p.tributo === 'ISS')!.percentualDoDas, 0);
});

test('Fator R: folha de 28% ou mais da RBT12 troca o Anexo V pelo III; abaixo disso fica no V', () => {
  const abaixo = calcularDas({ anexo: 'V', rbt12: 500000, folha12: 139999 }); assert.equal(abaixo.anexoAplicado, 'V'); assert.equal(abaixo.fatorR.trocouParaIII, false);
  const igual = calcularDas({ anexo: 'V', rbt12: 500000, folha12: 140000 }); assert.equal(igual.anexoAplicado, 'III'); assert.equal(igual.fatorR.trocouParaIII, true);
  perto(igual.aliquotaEfetiva, ((500000 * 0.135 - 17640) / 500000) * 100);
  perto(abaixo.aliquotaEfetiva, ((500000 * 0.195 - 9900) / 500000) * 100);
  assert.ok(calcularDas({ anexo: 'V', rbt12: 500000 }).avisos.some(a => /Fator R/.test(a)));
});

test('Simples CBS/IBS: valor = arred2(receita × fator × alíquota), HALF_EVEN, com alíquota de 2 casas; regime regular não calcula', () => {
  const r = calcularCbsIbsSimples({ receita: 10000, pCBSSN: 0.125, pIBSSN: 0.1 });
  assert.equal(r.calculado, true); perto(r.pCBSSN, 0.12); perto(r.vCBS, 12); perto(r.vIBS, 10); perto(r.total, 22);
  perto(calcularCbsIbsSimples({ receita: 10000, fatorReceita: 0.5, pCBSSN: 1, pIBSSN: 1 }).total, 100);
  const regular = calcularCbsIbsSimples({ receita: 10000, pCBSSN: 1, pIBSSN: 1, optaRegimeRegular: true }); assert.equal(regular.calculado, false); assert.equal(regular.total, 0);
  assert.throws(() => calcularCbsIbsSimples({ receita: -1, pCBSSN: 1, pIBSSN: 1 }), ErroTributario);
});

test('par de alíquotas: com redistribuição no padrão; sem quando o ISS está fora, não incide, é isento ou é retido', () => {
  assert.equal(escolherParAliquotas({ anexo: 'III', tribISSQN: 1, tpRetISSQN: 1 }).par, 'com-redistribuicao');
  assert.equal(escolherParAliquotas({ anexo: 'III', tribISSQN: 1, tpRetISSQN: 2 }).par, 'sem-redistribuicao');
  assert.equal(escolherParAliquotas({ anexo: 'IV', impedimentoSublimite: true }).regra, 'ISS_FORA_DO_SIMPLES');
  assert.equal(escolherParAliquotas({ anexo: 'V', tribISSQN: 4 }).par, 'sem-redistribuicao');
  assert.equal(escolherParAliquotas({ anexo: 'V', tpBM: 1 }).regra, 'ISENCAO_MUNICIPAL');
  assert.equal(escolherParAliquotas({ anexo: 'II' }).par, 'unico');
});

test('orçamento em "regras atuais" é idêntico ao anterior (sem tributacao, com modo atual e o preço de sempre)', () => {
  const sem = calcularOrcamento({ postos, iss: 0.03, metrosQuadrados: 400 });
  const atual = calcularOrcamento({ postos, iss: 0.03, metrosQuadrados: 400, tributacao: { modo: 'atual' } });
  assert.deepEqual(atual, sem); assert.equal('tributacao' in sem, false);
  perto(sem.valorContrato, sem.custoTotal / (1 - (0.03 + 0.03 + 0.03 + 0.0165 + 0.076 + 0.01 + 0.01)), 1e-9);
  assert.deepEqual(Object.keys(sem.tributos.taxas), ['BDI', 'Lucro', 'ISS', 'PIS', 'COFINS', 'Contribuição social', 'IRPJ']);
  assert.equal(calcularEncargos().total, calcularEncargos(undefined, { excluirLinhas: [] }).total);
});

test('orçamento na Reforma: 2026 não muda o preço (CBS/IBS sem custo); 2028 sem PIS/COFINS, CBS/IBS por fora; 2033 sem ISS', () => {
  const atual = calcularOrcamento({ postos });
  const r26 = calcularOrcamento({ postos, tributacao: { modo: 'reforma', ano: 2026 } });
  perto(r26.valorContrato, atual.valorContrato, 1e-9); assert.equal(r26.tributacao!.nota!.informativo, true); perto(r26.tributacao!.nota!.totalNota, r26.valorContrato, 1e-9);
  assert.equal(r26.tributacao!.simulado, false);
  const r28 = calcularOrcamento({ postos, tributacao: { modo: 'reforma', ano: 2028 } }); const n = r28.tributacao!.nota!;
  perto(r28.valorContrato, r28.custoTotal / (1 - (0.03 + 0.03 + 0.05 + 0.01 + 0.01)), 1e-9);
  assert.ok(r28.valorContrato < atual.valorContrato); assert.equal(r28.tributacao!.simulado, true);
  perto(n.cbs, Math.round(r28.valorContrato * 100) / 100 * 0.084, 0.006); perto(n.totalNota, Math.round((Math.round(r28.valorContrato * 100) / 100 + n.cbs + n.ibs) * 100) / 100, 0.006);
  assert.equal(r28.tributos.pis, 0); assert.equal(r28.tributos.cofins, 0);
  const r33 = calcularOrcamento({ postos, tributacao: { modo: 'reforma', ano: 2033, aliquotas: { cbs: 9, ibsUf: 17, ibsMun: 3 } } });
  perto(r33.valorContrato, r33.custoTotal / (1 - (0.03 + 0.03 + 0 + 0.01 + 0.01)), 1e-9); perto(r33.tributacao!.nota!.cbs, Math.round(r33.valorContrato * 100) / 100 * 0.09, 0.006);
  const r30 = calcularOrcamento({ postos, tributacao: { modo: 'reforma', ano: 2030 } }); perto(r30.tributos.taxas.ISS, 0.05 * 0.8, 1e-12);
});

test('orçamento no Simples: o preço usa a alíquota efetiva do DAS; Anexo IV mantém INSS e RAT e tira só os terceiros; III e V tiram também a CPP', () => {
  const atual = calcularOrcamento({ postos });
  const iv = calcularOrcamento({ postos, tributacao: { modo: 'simples', anexo: 'IV', rbt12: 500000 } });
  perto(iv.tributos.taxas['DAS (Simples Nacional)'], 0.07716, 1e-12); perto(iv.valorContrato, iv.custoTotal / (1 - (0.06 + 0.07716)), 1e-9);
  const linhas = (e: ReturnType<typeof calcularEncargos>) => e.grupos[0].linhas.map(l => l.nome);
  assert.ok(linhas(iv.encargos).includes('INSS') && linhas(iv.encargos).includes('SAT')); assert.ok(!linhas(iv.encargos).includes('SEBRAE') && !linhas(iv.encargos).includes('SESC SESI'));
  perto(iv.encargos.grupos[0].total, 0.368 - 0.058, 1e-12); assert.ok(iv.taxaEncargos < atual.taxaEncargos);
  const iii = calcularOrcamento({ postos, tributacao: { modo: 'simples', anexo: 'III', rbt12: 500000 } });
  assert.ok(!linhas(iii.encargos).includes('INSS')); perto(iii.encargos.grupos[0].total, 0.08, 1e-12); assert.ok(iii.taxaEncargos < iv.taxaEncargos);
  const v = calcularOrcamento({ postos, tributacao: { modo: 'simples', anexo: 'V', rbt12: 500000, folha12: 200000 } }); assert.equal(v.tributacao!.das!.anexoAplicado, 'III');
  const par = calcularOrcamento({ postos, tributacao: { modo: 'simples', anexo: 'IV', rbt12: 500000, ano: 2027, pCBSSN: 0.5, pIBSSN: 0.25 } });
  assert.ok(par.tributacao!.cbsIbsSimples!.vCBS > 0); assert.ok(par.tributacao!.avisos.some(a => /2027 em diante/.test(a))); perto(par.valorContrato, iv.valorContrato, 1e-9);
  const seis = calcularOrcamento({ postos, tributacao: { modo: 'simples', anexo: 'III', rbt12: 4000000 } });
  assert.ok('ISS (fora do DAS)' in seis.tributos.taxas);
});

test('schema do orçamento valida a tributação e recusa valores hostis', () => {
  const base = { postos };
  assert.equal(orcamentoSchema.safeParse({ ...base, tributacao: { modo: 'simples', anexo: 'IV', rbt12: 500000 } }).success, true);
  for (const ruim of [{ modo: 'reforma', ano: 2025 }, { modo: 'reforma', ano: 2034 }, { modo: 'reforma', ano: 2030.5 }, { modo: 'simples', anexo: 'I', rbt12: 1 }, { modo: 'simples', anexo: 'IV', rbt12: 0 },
    { modo: 'simples', anexo: 'IV', rbt12: 5_000_000 }, { modo: 'simples', anexo: 'IV', rbt12: Number.NaN }, { modo: 'reforma', ano: 2030, aliquotas: { cbs: -1, ibsUf: 0, ibsMun: 0 } }, { modo: 'qualquer' }, 'reforma'])
    assert.equal(tributacaoSchema.safeParse(ruim).success, false, JSON.stringify(ruim));
});

const pedido = (url: string, corpo: unknown) => new Request(url, { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
test('POST /api/orcamento/calcular e /pdf aceitam a tributação e devolvem o bloco; entrada inválida volta 400', async () => {
  reiniciarLimitesNaMemoria();
  const reforma = { postos, tributacao: { modo: 'reforma', ano: 2028 } };
  const resposta = await calcular(pedido('http://localhost/api/orcamento/calcular', reforma)); assert.equal(resposta.status, 200);
  const dados = await resposta.json(); assert.equal(dados.tributacao.modo, 'reforma'); assert.ok(dados.tributacao.nota.totalNota > dados.valorContrato);
  const comum = await (await calcular(pedido('http://localhost/api/orcamento/calcular', { postos }))).json(); assert.equal('tributacao' in comum, false);
  assert.equal((await calcular(pedido('http://localhost/api/orcamento/calcular', { postos, tributacao: { modo: 'simples', anexo: 'IV', rbt12: 0 } }))).status, 400);
  assert.equal((await calcular(pedido('http://localhost/api/orcamento/calcular', { postos, tributacao: { modo: 'reforma', ano: 1999 } }))).status, 400);
  for (const tipo of ['orcamento', 'custo']) for (const tributacao of [{ modo: 'reforma', ano: 2028 }, { modo: 'simples', anexo: 'IV', rbt12: 500000, ano: 2027, pCBSSN: 0.5, pIBSSN: 0.2 }]) {
    const r = await pdf(pedido(`http://localhost/api/orcamento/pdf?tipo=${tipo}`, { postos, tributacao })); assert.equal(r.status, 200, `${tipo} ${tributacao.modo}`);
    assert.ok((await PDFDocument.load(new Uint8Array(await r.arrayBuffer()))).getPageCount() >= 1);
  }
});
