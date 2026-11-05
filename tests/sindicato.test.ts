import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { categoryOf, cleanPdfText, documentEntries, entryTitle, isArticle, isBare, isMonthOnly, kindOf, lawIdentifier, sectionFor, titleFromPdfText, yearOf } from '../src/lib/dados/sindicato';
import { openDb, upsertDocument } from '../src/lib/dados/db';
import { clausePassages, sindicatoPassages, trechosDeDocumentos } from '../src/lib/dados/painel';

const SITE = 'https://www.sindeprestem.com.br';
test('site pages and posts are classified by section; articles are the ones signed by the president', () => {
  assert.equal(sectionFor(`${SITE}/convencoes-coletivas`, 'x', ''), 'convencao');
  assert.equal(sectionFor(`${SITE}/institucional-do-sindeprestem-sindicat`, 'x', ''), 'institucional');
  assert.equal(sectionFor(`${SITE}/contato`, 'x', ''), 'contato');
  assert.equal(sectionFor(`${SITE}/noticias/page/3`, 'x', ''), 'noticia');
  assert.equal(sectionFor(`${SITE}/post/a`, 'Artigo - Inclusão que exclui', 'texto'), 'artigo');
  assert.equal(sectionFor(`${SITE}/post/b`, 'O Estado sou eu', 'Texto do artigo.\n\nPor Vander Morales - Presidente'), 'artigo');
  assert.equal(sectionFor(`${SITE}/post/c`, 'Sindeprestem recebe deputado', 'A diretoria recebeu o deputado.'), 'noticia');
  assert.equal(isArticle('Reunião mensal', 'sem assinatura'), false);
});
test('document links keep their label; bare years and months take the group header', () => {
  const html = `<html><body><div><div>CCT PORTARIA</div><a href="/_files/ugd/a96667_aaa.pdf">2025</a><a href="/_files/ugd/a96667_bbb.pdf">Aditivo à CCT - Portaria - 2026</a>
    <div>DECRETO Nº 10.854/2021</div><div>2026</div><a href="/_files/ugd/a96667_ccc.pdf">janeiro</a></div></body></html>`;
  const entries = documentEntries(html);
  assert.equal(entries.length, 3);
  assert.equal(entryTitle(entries[0]), 'CCT PORTARIA — 2025');
  assert.equal(entryTitle(entries[1]), 'Aditivo à CCT - Portaria - 2026');
  assert.equal(entryTitle(entries[2]), 'DECRETO Nº 10.854/2021 — janeiro de 2026');
  assert.equal(isBare('2025/2026'), true); assert.equal(isBare('Convenção Coletiva - Geral'), false);
});
test('convention category comes from the title, or from the document text when the title is generic', () => {
  assert.equal(categoryOf('Convenção Coletiva - PROMOTORES DE CRÉDITO - 2025/2026'), 'Promotores de crédito');
  assert.equal(categoryOf('CCT POUPATEMPO E DETRAN — cct 2025'), 'Poupatempo');
  assert.equal(categoryOf('ERRATA – DATA BASE 1° DE JANEIRO DE 2026', 'CONVENÇÃO COLETIVA DE TRABALHO PORTARIA E CONTROLE DE ACESSO'), 'Portaria');
  assert.equal(categoryOf('ERRATA'), 'Outras');
  assert.equal(yearOf('Convenção Coletiva - Geral - 2025/2026'), 2026); assert.equal(kindOf('Aditivo à CCT - Geral - 2026'), 'Aditivo');
});
test('booklet and law titles are read from the PDF text, and page markers are removed', () => {
  const text = '-- 1 of 24 --\n\nSEGURANÇA\nE EFICIÊNCIA\nCARTILHA DO\nBOMBEIRO\nCIVIL\n\n-- 2 of 24 --\n';
  assert.match(titleFromPdfText(text, 'fallback'), /CARTILHA/);
  assert.equal(titleFromPdfText('-- 1 of 3 --\n', 'fallback'), 'fallback');
  assert.equal(cleanPdfText('a\n-- 1 of 2 --\nb'), 'a\n\nb'.replace('\n\n', '\n\n'));
  assert.equal(lawIdentifier('DECRETO Nº 10.854, DE 10 DE NOVEMBRO DE 2021'), 'DECRETO Nº 10.854');
  assert.equal(isMonthOnly('abril de 2024'), true);
});
test('own documents become passages with official titles, grouped, and clause questions go to text search', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'sindi-own-')); const file = path.join(directory, 'dados.sqlite');
  try {
    const db = openDb(file);
    const add = (url: string, title: string, section: string, extra: Record<string, unknown> = {}, published?: string) =>
      upsertDocument(db, { source: 'sindeprestem', url, title, content: 'texto ' + title, publishedAt: published, meta: { section, ...extra } });
    add(`${SITE}/_files/ugd/p25.pdf`, 'Convenção Coletiva - Portaria - 2025/2026', 'convencao', { category: 'Portaria', year: 2026, region: 'São Paulo' });
    add(`${SITE}/_files/ugd/g25.pdf`, 'Convenção Coletiva - Geral - 2025/2026', 'convencao', { category: 'Geral', year: 2026, region: 'São Paulo' });
    add(`${SITE}/_files/ugd/p20.pdf`, 'CCT PORTARIA — 2020', 'convencao', { category: 'Portaria', year: 2020 });
    add(`${SITE}/_files/ugd/c1.pdf`, 'CARTILHA DO BOMBEIRO', 'cartilha');
    add(`${SITE}/_files/ugd/j1.pdf`, 'DECRETO Nº 10.854 — janeiro de 2026', 'juridico', { year: 2026 });
    add(`${SITE}/_files/ugd/j2.pdf`, 'DECRETO Nº 10.854 — fevereiro de 2026', 'juridico', { year: 2026 });
    add(`${SITE}/post/n1`, 'Notícia recente', 'noticia', {}, '2026-10-01T10:00:00.000Z');
    add(`${SITE}/post/n2`, 'Notícia antiga', 'noticia', {}, '2024-01-01T10:00:00.000Z');
    add(`${SITE}/post/a1`, 'Artigo - Teste', 'artigo', {}, '2026-09-01T10:00:00.000Z');
    db.close();
    // Os documentos viram trechos (título, data, categoria, início do texto) com a URL de cada um; quem escreve a resposta é o modelo.
    const texto = (pergunta: string) => sindicatoPassages(pergunta, 'pt', file).map(p => `${p.title} | ${p.content} | ${p.url}`).join('\n');
    const portaria = texto('Qual a convenção coletiva da Portaria em 2026?');
    assert.match(portaria, /Portaria - 2025\/2026/); assert.doesNotMatch(portaria, /Geral/); assert.match(portaria, /p25\.pdf/);
    assert.doesNotMatch(texto('Onde encontro as convenções coletivas?'), /CCT PORTARIA — 2020/);
    assert.match(texto('Quais as cartilhas do sindicato?'), /CARTILHA DO BOMBEIRO/);
    assert.match(texto('Quais documentos jurídicos o sindicato publica?'), /2 edições mensais/);
    const news = texto('Quais as últimas notícias do sindicato?');
    assert.ok(news.indexOf('Notícia recente') < news.indexOf('Notícia antiga')); assert.doesNotMatch(news, /Artigo - Teste/);
    assert.match(texto('Quais os últimos artigos do presidente?'), /Artigo - Teste/);
    // Cláusulas seguem para clausePassages (e o modelo); perguntas gerais e institucionais não viram lista de documentos.
    assert.deepEqual(sindicatoPassages('Qual o piso salarial na convenção da portaria?', 'pt', file), []);
    assert.deepEqual(sindicatoPassages('O que é terceirização?', 'pt', file), []);
    assert.deepEqual(sindicatoPassages('O que é o SINDEPRESTEM?', 'pt', file), []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('clause questions return passages of the right agreement for the model, never a finished text', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'sindi-own2-')); const file = path.join(directory, 'dados.sqlite');
  try {
    const db = openDb(file);
    const NL = String.fromCharCode(10);
    upsertDocument(db, { source: 'sindeprestem', url: `${SITE}/institucional-do-sindeprestem-sindicat`, title: 'Institucional', content: ['Sindicato das Empresas de Terceirização e Trabalho Temporário do Estado de São Paulo', 'Sobre o SINDEPRESTEM', 'Combate a precarização e defende a segurança jurídica.', 'Missão', 'Melhorar o ambiente de negócios.', 'Visão', 'Ser a principal liderança.', 'Valores', 'Compromisso e respeito.', 'Rodapé institucional: x'].join(NL), meta: { section: 'institucional' } });
    const body = ['TERMOS GERAIS', ...Array.from({ length: 200 }, (_, i) => `linha de texto ${i}`), 'CLÁUSULA TERCEIRA - SALÁRIOS PROFISSIONAIS', 'PISO SALARIAL', 'Porteiro R$ 1.912,07', 'Zelador R$ 2.018,19', 'Outra cláusula sobre férias.'].join(NL);
    upsertDocument(db, { source: 'sindeprestem', url: `${SITE}/_files/ugd/p26.pdf`, title: 'Convenção Coletiva - Portaria - 2025/2026', content: body, meta: { section: 'convencao', category: 'Portaria', year: 2026, type: 'Convenção coletiva' } });
    db.close();
    const clause = clausePassages('Qual o piso salarial da convenção coletiva da Portaria 2026?', 'pt', file).passages[0];
    assert.match(clause?.content ?? '', /R\$ 1\.912,07/); assert.match(clause?.url ?? '', /p26\.pdf/);
    assert.match(trechosDeDocumentos('Qual o piso salarial da convenção da portaria?', [], 'pt', file).passages[0]?.content ?? '', /1\.912,07/);
    assert.match(clausePassages('Qual o piso da convenção do Poupatempo?', 'pt', file).semResposta ?? '', /Não encontrei a convenção dessa categoria/);
    // Sem categoria, o cargo precisa aparecer no trecho: a cláusula de outra categoria não serve de resposta.
    assert.match(clausePassages('Qual o valor do piso do técnico de segurança do trabalho na convenção?', 'pt', file).semResposta ?? '', /Não consegui confirmar/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
