import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { openDb, upsertDocument, setIndicator, searchDocuments, startRun, finishRun } from '../src/lib/dados/db';
import { extractArticle, parseDate, sitemapEntries } from '../src/lib/dados/html';
import { parseSgs } from '../src/lib/dados/collectors/bcb';
import { lastTwo, periodLabel } from '../src/lib/dados/collectors/ibge';
import { billDocument } from '../src/lib/dados/collectors/camara';
import { processDocument } from '../src/lib/dados/collectors/senado';
import { parseTst } from '../src/lib/dados/collectors/tst';
import { indicatorPassages, readPainel, BILL_TOPIC } from '../src/lib/dados/painel';
import { exportWorkbook } from '../src/lib/dados/xlsx';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'sindi-dados-'));

test('documents are deduplicated by hash and searchable without accents', () => {
  const db = openDb(':memory:');
  const doc = { source: 'tst', url: 'https://www.tst.jus.br/-/a', title: 'Súmula sobre terceirização', content: 'A responsabilidade subsidiária do tomador de serviços foi mantida.' };
  assert.equal(upsertDocument(db, doc), true);
  assert.equal(upsertDocument(db, doc), false);
  assert.equal(upsertDocument(db, { ...doc, content: doc.content + ' Nova decisão.' }), true);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM documents').get() as { n: number }).n, 1);
  assert.equal(searchDocuments(db, ['terceirizacao']).length, 1);
  assert.equal(searchDocuments(db, ['subsidiaria'], 3, ['wec']).length, 0);
});
test('Selic uses the effective date and ignores future projections', () => {
  const rows = [{ data: '16/09/2026', valor: '14.00' }, { data: '17/09/2026', valor: '13.75' }, { data: '01/10/2026', valor: '13.75' }, { data: '04/11/2026', valor: '13.75' }];
  assert.deepEqual(parseSgs(rows, new Date('2026-10-13T12:00:00Z')), { period: '17/09/2026', value: 13.75, previous: 14 });
});
test('SIDRA series return the latest valid value and the previous one', () => {
  const data = [{ resultados: [{ series: [{ serie: { '202607': '5.3', '202608': '5.4', '202609': '...' } }] }] }];
  assert.deepEqual(lastTwo(data), { period: '202608', value: 5.4, previous: 5.3 });
  assert.equal(periodLabel('202608'), '08/2026');
});
test('bills and Senate processes become readable documents with their last movement', () => {
  const bill = billDocument({ id: 1, siglaTipo: 'PL', numero: 861, ano: 2023, ementa: 'Altera a Lei 6.019', dataApresentacao: '2023-03-03T13:16',
    statusProposicao: { dataHora: '2026-07-22T11:09', siglaOrgao: 'CTRAB', descricaoSituacao: 'Aguardando Parecer', descricaoTramitacao: 'Designação de Relator', despacho: 'Designado' } });
  assert.equal(bill.name, 'PL 861/2023'); assert.match(bill.content, /Aguardando Parecer/); assert.ok(bill.movedAt?.startsWith('2026-07-22'));
  const process = processDocument({ id: 9, identificacao: 'PLS 249/2017', ementa: 'Dispõe sobre terceirização', situacaoAtual: 'AGUARDANDO DESIGNAÇÃO', dataSituacaoAtual: '2023-03-17', tramitando: 'Sim' });
  assert.match(process.content, /desde 2023-03-17/);
  assert.equal(BILL_TOPIC.test('Altera a Lei nº 6.019, de 3 de janeiro de 1974'), true);
  assert.equal(BILL_TOPIC.test('Dispõe sobre exames admissionais'), false);
});
test('articles keep body text, drop navigation and read Brazilian or ISO dates', () => {
  const html = '<html><head><meta property="og:title" content="Notícia - TST"></head><body><nav>Menu Exibir Agência</nav><div class="date-info">Publicado 13/10/26</div><div class="news-body"><p>' + 'Texto da decisão sobre terceirização. '.repeat(10) + '</p></div></body></html>';
  const article = parseTst(html);
  assert.match(article.content, /decisão sobre terceirização/); assert.doesNotMatch(article.content, /Menu Exibir/);
  assert.equal(article.publishedAt?.slice(0, 10), '2026-10-13');
  assert.equal(parseDate('2026-10-13T09:00:00Z')?.slice(0, 10), '2026-10-13');
  assert.equal(parseDate('texto sem data'), undefined);
  assert.equal(extractArticle('<html><body><script>alert(1)</script><main>' + 'a '.repeat(150) + '</main></body></html>').content.includes('alert'), false);
});
test('sitemap entries are ordered from newest to oldest', () => {
  const xml = '<urlset><url><loc>https://x/a</loc><lastmod>2019-01-01</lastmod></url><url><loc>https://x/b</loc><lastmod>2026-01-01</lastmod></url></urlset>';
  assert.deepEqual(sitemapEntries(xml).map(e => e.url), ['https://x/b', 'https://x/a']);
});
test('panel, direct indicator answers and workbook come from the stored data', async () => {
  const directory = tmp(); const file = path.join(directory, 'dados.sqlite');
  const db = openDb(file);
  setIndicator(db, { id: 'bcb.selic-meta', source: 'bcb', group: 'Juros', label: 'Meta da taxa Selic', value: 13.75, unit: '% ao ano', period: '17/09/2026', previous: 14, url: 'https://www.bcb.gov.br/' });
  upsertDocument(db, { source: 'camara', url: 'https://www.camara.leg.br/p?idProposicao=1', title: 'PL 861/2023', content: 'PL 861/2023 — Altera a Lei 6.019 sobre terceirização\nSituação: Aguardando', publishedAt: '2023-03-03T00:00:00.000Z', meta: { movedAt: '2026-07-22T00:00:00.000Z', situacao: 'Aguardando Parecer' } });
  const run = startRun(db, 'camara'); finishRun(db, run, { fetched: 1, changed: 1 });
  const painel = readPainel(file);
  assert.equal(painel.available, true); assert.equal(painel.indicators[0].value, 13.75); assert.equal(painel.bills[0].title, 'PL 861/2023'); assert.ok(painel.updatedAt);
  assert.match(indicatorPassages('Qual a taxa Selic hoje?', 'pt', file).map(p => p.content).join(' '), /13,75/);
  assert.deepEqual(indicatorPassages('Redija um texto sobre a Selic', 'pt', file), []);
  assert.deepEqual(indicatorPassages('O que é terceirização?', 'pt', file), []);
  assert.deepEqual(indicatorPassages('O que é a Selic?', 'pt', file), [], 'definição vai ao glossário, não ao número');
  const workbookFile = path.join(directory, 'dados.xlsx'); await exportWorkbook(db, workbookFile);
  assert.ok(existsSync(workbookFile));
  const files = unzipSync(readFileSync(workbookFile));
  assert.match(strFromU8(files['xl/workbook.xml']), /name="Indicadores"[\s\S]*name="Institucional"[\s\S]*name="Convenções"[\s\S]*name="Câmara"[\s\S]*name="Coletas"/);
  assert.ok(Object.values(files).some(f => strFromU8(f).includes('PL 861/2023')));
  db.close();
  rmSync(directory, { recursive: true, force: true });
});
