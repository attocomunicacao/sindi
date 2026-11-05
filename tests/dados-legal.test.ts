import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { decodeHtml, splitArticles } from '../src/lib/dados/legal';
import { deleteMissing, due, enqueue, getSeries, markFetched, nextQueued, openDb, setSeries, setState, upsertDocument } from '../src/lib/dados/db';
import { addLine, emptyAggregate, net, monthLabel } from '../src/lib/dados/collectors/caged';
import { isNewsArticle, isSubjectPage, parseGovBr, titleFromSlug } from '../src/lib/dados/collectors/mte';
import { REGIMENTS, pdfLinks } from '../src/lib/dados/collectors/regimentos';
import { articleKey, indicatorPassages, lawPassages, nrNumber, nrPassages, termosDoDocumento, trechosRelevantes } from '../src/lib/dados/painel';
import { setIndicator } from '../src/lib/dados/db';

test('windows-1252 pages are decoded without replacement characters', () => {
  const bytes = Uint8Array.from([0x53, 0xe3, 0x6f, 0x20, 0x64, 0x69, 0x72, 0x65, 0x69, 0x74, 0x6f, 0x73]); // "São direitos"
  assert.equal(decodeHtml(bytes, 'text/html'), 'São direitos');
  assert.equal(decodeHtml(new TextEncoder().encode('Constituição'), 'text/html'), 'Constituição');
});
test('articles are split on line starts; the ADCT restarts numbering and references are not articles', () => {
  const text = ['TÍTULO I', 'Art. 1º A República se funda em:', 'I - soberania;', 'Art. 2º São Poderes da União. Veja o art. 1º.', 'Art. 5-A Dispositivo acrescido.',
    'ATO DAS DISPOSIÇÕES CONSTITUCIONAIS TRANSITÓRIAS', 'Art. 1º O Presidente da República promulgará.', 'Ato das Disposições Constitucionais Transitórias (sumário)'].join('\n');
  const articles = splitArticles(text, { adct: true });
  assert.deepEqual(articles.map(a => a.key), ['1', '2', '5-A', 'adct-1']);
  assert.match(articles[0].content, /soberania/); assert.equal(articles[3].label, 'ADCT, Art. 1º');
});
test('article numbers are read from questions, including suffix letters', () => {
  assert.equal(articleKey('O que diz o art. 7º da Constituição?'), '7');
  assert.equal(articleKey('Artigo 37 da CF'), '37');
  assert.equal(articleKey('art. 5-A do regimento'), '5-A');
  assert.equal(articleKey('O que a Constituição diz sobre greve?'), undefined);
});
test('CAGED lines are aggregated by month, state, services section and temporary labour', () => {
  const aggregate = emptyAggregate();
  const row = (month: string, uf: string, section: string, subclass: string, balance: number) => [month, '3', uf, '355030', section, subclass, balance, '411010'].join(';');
  for (const line of [row('202608', '35', 'N', '7820500', 1), row('202608', '35', 'N', '7820500', 1), row('202608', '35', 'N', '8121400', -1), row('202608', '33', 'C', '1011201', 1), row('202607', '35', 'N', '7820500', 1), row('202608', '35', 'N', '7820500', 0)]) addLine(aggregate, line, '202608');
  assert.equal(net(aggregate.brasil), 2); assert.equal(net(aggregate.sp), 1); assert.equal(net(aggregate.servicos), 1); assert.equal(net(aggregate.temporario), 2);
  assert.equal(aggregate.brasil.admissions, 3); assert.equal(aggregate.brasil.dismissals, 1);
  assert.equal(monthLabel('202608'), '08/2026');
});
test('Ministry portal links are limited to news articles and subject pages, without files or searches', () => {
  assert.equal(isNewsArticle(new URL('https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo/2026/setembro/novo-caged')), true);
  assert.equal(isNewsArticle(new URL('https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo/2026/setembro')), false);
  assert.equal(isSubjectPage(new URL('https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho')), true);
  assert.equal(isSubjectPage(new URL('https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/x/norma.pdf')), false);
  assert.equal(isSubjectPage(new URL('https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/x?b_start:int=30')), false);
  assert.equal(isSubjectPage(new URL('https://evil.example/trabalho-e-emprego/pt-br/assuntos/x')), false);
  const page = parseGovBr('<html><head><meta property="og:title" content="NR-1 — Ministério do Trabalho e Emprego"></head><body><div id="content-core"><p>' + 'Disposições gerais sobre gerenciamento de riscos. '.repeat(8) + '</p></div></body></html>');
  assert.equal(page.title, 'NR-1'); assert.match(page.content, /gerenciamento de riscos/);
});
test('official regiment PDFs are found from each house page', () => {
  const html = '<a href="/atividade-legislativa/legislacao/regimento-interno-da-camara-dos-deputados/arquivos-1/RICDatualizado.pdf">formato pdf</a><a href="/x/outro.pdf">outro</a>';
  const links = pdfLinks(html, 'https://www2.camara.leg.br/atividade-legislativa/legislacao/regimento-interno-da-camara-dos-deputados');
  assert.equal(REGIMENTS[0].pick(links).length, 1); assert.match(REGIMENTS[0].pick(links)[0].href, /^https:\/\/www2\.camara\.leg\.br\/.*RICDatualizado\.pdf$/);
  const senado = pdfLinks('<a href="/documents/1/RISF+2018+Volume+1.pdf/abc">PDF</a><a href="https://www25.senado.leg.br/documents/2/RCCN.pdf/def">PDF</a>', 'https://www25.senado.leg.br/web/x');
  assert.equal(REGIMENTS[1].pick(senado).length, 1); assert.equal(REGIMENTS[2].pick(senado).length, 1);
});
test('state, queue, series and pruning behave incrementally', () => {
  const db = openDb(':memory:');
  assert.equal(due(db, 'k', 1000), true); setState(db, 'k', 'v'); assert.equal(due(db, 'k', 60000), false); assert.equal(due(db, 'k', 60000, true), true);
  enqueue(db, 'mte', ['https://a', 'https://b']); enqueue(db, 'mte', ['https://a']);
  const stale = new Date(Date.now() - 1000).toISOString();
  assert.deepEqual(nextQueued(db, 'mte', 5, stale).sort(), ['https://a', 'https://b']);
  markFetched(db, 'https://a'); assert.deepEqual(nextQueued(db, 'mte', 5, stale), ['https://b']);
  setSeries(db, 's', '202607', 1); setSeries(db, 's', '202608', 2); setSeries(db, 's', '202608', 3);
  assert.deepEqual(getSeries(db, 's'), [{ period: '202607', value: 1 }, { period: '202608', value: 3 }]);
  for (const key of ['1', '2', '3']) upsertDocument(db, { source: 'constituicao', url: `https://x/cf#${key}`, title: key, content: 'texto ' + key });
  assert.equal(deleteMissing(db, 'constituicao', 'https://x/cf', new Set(['https://x/cf#1', 'https://x/cf#2'])), 1);
});
test('law and CAGED answers quote the collected official text', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'sindi-legal-')); const file = path.join(directory, 'dados.sqlite');
  try {
    const db = openDb(file);
    upsertDocument(db, { source: 'constituicao', url: 'https://www.planalto.gov.br/c.htm#9', title: 'Constituição Federal — Art. 9º', content: 'Art. 9º É assegurado o direito de greve, competindo aos trabalhadores decidir sobre a oportunidade de exercê-lo.' });
    upsertDocument(db, { source: 'regimentos', url: 'https://www2.camara.leg.br/ricd.pdf#93', title: 'Regimento Interno da Câmara dos Deputados — Art. 93', content: 'Art. 93. Para iniciar-se a sessão secreta, o Presidente fará sair do recinto as pessoas estranhas.', meta: { regiment: 'ricd' } });
    setIndicator(db, { id: 'caged.saldo', source: 'caged', group: 'Emprego formal', label: 'Saldo de emprego formal — Brasil', value: 165827, unit: 'vagas no mês', period: '08/2026', previous: 58568, url: 'https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo' });
    db.close();
    assert.match(lawPassages('O que diz o art. 9º da Constituição?', [], 'pt', file).passages[0]?.content ?? '', /direito de greve/);
    assert.match(lawPassages('art. 93 do regimento da Câmara', [], 'pt', file).passages[0]?.content ?? '', /sessão secreta/);
    assert.match(lawPassages('O que a Constituição diz sobre greve?', ['greve'], 'pt', file).passages[0]?.content ?? '', /Art\. 9º/);
    assert.match(lawPassages('art. 500 da Constituição', [], 'pt', file).semResposta ?? '', /Não encontrei/);
    assert.deepEqual(lawPassages('Redija um texto sobre a Constituição', ['texto'], 'pt', file).passages, []);
    assert.deepEqual(lawPassages('O que é terceirização?', ['terceirizacao'], 'pt', file).passages, []);
    assert.match(indicatorPassages('Qual o saldo do CAGED?', 'pt', file)[0]?.content ?? '', /165\.827 vagas/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Regulatory norms are quoted from the Ministry portal and never described from memory', () => {
  assert.equal(nrNumber('O que é a NR-1?'), 1); assert.equal(nrNumber('O que diz a NR 35?'), 35); assert.equal(nrNumber('norma regulamentadora nº 17'), 17); assert.equal(nrNumber('O que é terceirização?'), undefined);
  assert.equal(titleFromSlug('https://x/y/norma-regulamentadora-no-01-nr-01'), 'Norma Regulamentadora No. 1 (NR-1)');
  assert.equal(isSubjectPage(new URL('https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-1')), true);
  assert.equal(isSubjectPage(new URL('https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/x/img/banner.png/view')), false);
  const directory = mkdtempSync(path.join(tmpdir(), 'sindi-nr-')); const file = path.join(directory, 'dados.sqlite');
  try {
    const db = openDb(file);
    upsertDocument(db, { source: 'mte', url: 'https://www.gov.br/trabalho-e-emprego/pt-br/x/normas-regulamentadoras-vigentes/nr-1', title: 'Norma Regulamentadora No. 1 (NR-1)', content: 'A NR-1 estabelece disposições gerais sobre segurança e saúde no trabalho.' });
    upsertDocument(db, { source: 'mte', url: 'https://www.gov.br/trabalho-e-emprego/pt-br/x/perguntas-e-respostas-capitulo-1-5-da-nr-1', title: 'Perguntas e respostas', content: 'Texto muito mais longo sobre o capítulo 1.5. '.repeat(50) });
    db.close();
    assert.match(nrPassages('O que é a NR-1?', 'pt', file).passages[0]?.content ?? '', /disposições gerais/);
    assert.match(nrPassages('O que diz a NR-17?', 'pt', file).semResposta ?? '', /não vou descrevê-la de memória/);
    assert.deepEqual(nrPassages('O que é terceirização?', 'pt', file), { passages: [] });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('long documents are searched by the question: different questions about the same norm return different blocks', () => {
  const paragrafos = ['A NR-1 estabelece disposições gerais sobre segurança e saúde no trabalho.', ...Array.from({ length: 12 }, (_, i) => 'Parágrafo de histórico número ' + i + ' sobre alterações da norma em anos anteriores, sem relação com o tema pedido. '.repeat(3)),
    'O Gerenciamento de Riscos Ocupacionais exige inventário de riscos e plano de ação para empresas terceirizadas e prestadoras de serviço.', ...Array.from({ length: 6 }, (_, i) => 'Outro parágrafo de histórico ' + i + '. '.repeat(20))].join('\n');
  const intro = trechosRelevantes(paragrafos, termosDoDocumento('O que é a NR-1?'));
  const terceirizadas = trechosRelevantes(paragrafos, termosDoDocumento('Como a NR-1 impacta empresas terceirizadas?'));
  assert.deepEqual(termosDoDocumento('Como a NR-1 impacta minha vida?'), []);
  assert.match(intro, /disposições gerais/); assert.doesNotMatch(intro, /inventário de riscos/);
  assert.match(terceirizadas, /disposições gerais/); assert.match(terceirizadas, /inventário de riscos/);
  assert.ok(terceirizadas.length <= 2600);
});
