import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarDashboard, rotuloDoMes } from '../src/lib/dados/dashboard';
import { dashboardPdf } from '../src/lib/dados/dashboard-pdf';
import { emptyPainel, type PainelIndicator } from '../src/lib/dados/painel';

const ind = (id: string, value: number, previous: number | null, unit: string): PainelIndicator => ({ id, group: 'g', label: id, value, unit, period: '08/2026', previous, source: 'x', url: 'https://example.com', fetchedAt: '2026-10-13T00:00:00Z' });
const painel = () => ({ ...emptyPainel(), available: true, updatedAt: '2026-10-13T12:00:00Z', indicators: [
  ind('bcb.selic-meta', 13.75, 14, '% ao ano'), ind('ibge.ipca-12m', 4.58, 4.22, '% em 12 meses'), ind('ibge.desocupacao', 5.3, 5.3, '% da força de trabalho'),
  ind('caged.saldo', 100000, 50000, 'vagas no mês'), ind('caged.saldo-sp', 25000, 10000, 'vagas no mês'), ind('caged.saldo-temporario', -2438, 1423, 'vagas no mês') ],
  series: { 'caged.saldo': [{ period: '202606', value: 145161 }, { period: '202607', value: 58568 }, { period: '202608', value: 165827 }], 'caged.saldo-temporario': [{ period: '202606', value: 13512 }, { period: '202607', value: 1423 }, { period: '202608', value: -2438 }], 'caged.saldo-sp': [{ period: '202608', value: 42533 }] } });

test('dashboard só usa indicadores coletados e marca variação favorável ou desfavorável', () => {
  assert.equal(montarDashboard(emptyPainel()), null);
  const d = montarDashboard(painel())!;
  assert.equal(d.kpis.length, 4);
  const [selic, ipca, desocupacao, caged] = d.kpis;
  assert.equal(selic.favoravel, true); assert.equal(ipca.favoravel, false);
  assert.equal(desocupacao.favoravel, null); assert.equal(desocupacao.sentido, 'estavel');
  assert.equal(caged.favoravel, true); assert.equal(caged.delta, '+50.000');
  assert.ok(d.derivados.some(x => x.rotulo === 'São Paulo no saldo do Brasil' && x.valor === '25,00%'));
  assert.ok(d.derivados.some(x => x.rotulo === 'Juro real aproximado' && x.valor === '9,17 p.p.'));
});
test('a evolução mensal do emprego vem da série coletada, com meses legíveis, e ignora série de um só ponto', () => {
  const d = montarDashboard(painel())!;
  assert.deepEqual(d.series.map(x => x.rotulo), ['Brasil', 'Trabalho temporário']);
  assert.deepEqual(d.series[0].pontos.map(p => p.rotulo), ['jun/26', 'jul/26', 'ago/26']);
  assert.equal(d.series[1].pontos[2].valor, -2438);
  assert.equal(rotuloDoMes('202601'), 'jan/26'); assert.equal(rotuloDoMes('08/2026'), '08/2026');
  const taxa = d.taxas.find(t => t.rotulo === 'Meta Selic')!;
  assert.equal(taxa.favoravel, true); assert.equal(taxa.url, 'https://example.com'); assert.equal(taxa.fonte, 'x', 'fonte desconhecida mantém o código');
});
test('PDF do dashboard tem uma página A4', async () => {
  const bytes = await dashboardPdf(montarDashboard(painel())!);
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-');
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(bytes); assert.equal(pdf.getPageCount(), 1);
  const { width, height } = pdf.getPage(0).getSize(); assert.ok(Math.abs(width - 595.28) < 1 && Math.abs(height - 841.89) < 1);
});
