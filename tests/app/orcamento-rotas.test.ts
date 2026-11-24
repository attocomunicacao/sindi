import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { POST as calcular } from '@/app/api/orcamento/calcular/route';
import { POST as pdf } from '@/app/api/orcamento/pdf/route';
import { GET as catalogo } from '@/app/api/orcamento/catalogo/route';
import { calcularOrcamento } from '@/lib/orcamento/calculo';
import { resumoDoOrcamento } from '@/lib/orcamento/resumo';
import { catalogoPublico } from '@/lib/orcamento/catalogo-publico';
import { reiniciarLimitesNaMemoria } from '@/lib/infra/limite-por-minuto';

const corpo = {
  postos: [
    { funcaoId: 'auxiliar-de-limpeza', quantidade: 2, turno: 'diurno', periculosidade: true, insalubridade: 0.2 },
  ],
  iss: 0.05,
  metrosQuadrados: 500,
};
const requisicao = (
  url: string,
  init: { origem?: string | null; tipo?: string | null; corpo?: BodyInit; ip?: string } = {},
) => {
  const headers = new Headers();
  if (init.origem !== null) headers.set('origin', init.origem ?? 'http://localhost');
  if (init.tipo !== null) headers.set('content-type', init.tipo ?? 'application/json');
  if (init.ip) headers.set('x-real-ip', init.ip);
  return new Request(url, { method: 'POST', headers, body: init.corpo ?? JSON.stringify(corpo) });
};
const porRota = (rota: typeof calcular) => (init?: Parameters<typeof requisicao>[1]) =>
  rota(requisicao('http://localhost/api/orcamento/calcular', init));

test('POST /api/orcamento/calcular: origem, tipo, tamanho e validação do corpo são checados antes de calcular', async () => {
  reiniciarLimitesNaMemoria();
  const chamar = porRota(calcular);
  assert.equal((await chamar({ origem: 'https://estranho.example' })).status, 403);
  assert.equal((await chamar({ origem: null })).status, 403);
  assert.equal((await chamar({ tipo: 'text/plain' })).status, 415);
  assert.equal((await chamar({ corpo: 'isto não é json' })).status, 400);
  assert.equal((await chamar({ corpo: JSON.stringify({ postos: [] }) })).status, 400);
  const grande = await chamar({ corpo: JSON.stringify({ ...corpo, cliente: { observacoes: 'x'.repeat(70 * 1024) } }) });
  assert.equal(grande.status, 413);
  const repetido = await chamar({ corpo: JSON.stringify({ postos: [corpo.postos[0], corpo.postos[0]] }) });
  assert.equal(repetido.status, 400);
  assert.match((await repetido.json()).error, /Posto repetido/);
  const he = await chamar({
    corpo: JSON.stringify({ postos: [{ ...corpo.postos[0], horasExtras: { h50: 80, h100: 80 } }] }),
  });
  assert.equal(he.status, 400);
  assert.match((await he.json()).error, /Horas extras somadas/);
});

test('POST /api/orcamento/calcular devolve o mesmo resumo que a página calcula no navegador, com o adicional aplicado', async () => {
  const resposta = await porRota(calcular)();
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get('cache-control'), 'no-store');
  const dados = await resposta.json();
  // Mesma conta, mesma função: o que a tela mostra é o que a rota devolve (e o PDF usa).
  const esperado = JSON.parse(JSON.stringify(resumoDoOrcamento(calcularOrcamento(corpo as never))));
  assert.deepEqual(dados, esperado);
  assert.equal(dados.postos[0].adicional, 'periculosidade');
  assert.equal(dados.postos[0].adicionalDescartado, 'insalubridade');
});

test('POST /api/orcamento/pdf: tipo inválido é recusado, e os dois PDFs saem com cabeçalhos de download e premissas do cálculo', async () => {
  reiniciarLimitesNaMemoria();
  const chamar = (tipo: string, init?: Parameters<typeof requisicao>[1]) =>
    pdf(requisicao(`http://localhost/api/orcamento/pdf?tipo=${tipo}`, init));
  assert.equal((await chamar('outro')).status, 400);
  assert.equal((await chamar('orcamento', { origem: 'https://estranho.example' })).status, 403);
  for (const [tipo, arquivo] of [
    ['orcamento', 'orcamento-terceirizacao.pdf'],
    ['custo', 'relatorio-de-custo.pdf'],
  ]) {
    const r = await chamar(tipo, { corpo: JSON.stringify({ ...corpo, cliente: { empresa: 'Acme Ltda' } }) });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/pdf');
    assert.match(r.headers.get('content-disposition') ?? '', new RegExp(arquivo));
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    const bytes = new Uint8Array(await r.arrayBuffer());
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
    assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 1);
  }
});

test('GET /api/orcamento/catalogo e a página usam a mesma fonte, com salário mínimo e data da tabela', async () => {
  const dados = await (await catalogo(new Request('http://localhost/api/orcamento/catalogo'))).json();
  assert.deepEqual(dados, JSON.parse(JSON.stringify(catalogoPublico())));
  assert.equal(dados.salarioMinimo, 1212);
  assert.match(dados.referencia.extraidoEm, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(dados.funcoes.length > 5 && dados.funcoes.every((f: { salario: number }) => f.salario > 0));
});
