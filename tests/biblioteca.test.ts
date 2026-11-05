import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb, upsertDocument } from '../src/lib/dados/db';
import { buscarNaBiblioteca, consultaFts, lerDocumento, listarEstante, partesDoTrecho, resumoDaBiblioteca } from '../src/lib/biblioteca/consulta';
import { ESTANTES, estanteDoDocumento, estantePorId } from '../src/lib/biblioteca/estantes';

test('library searches use only words, so user input cannot inject FTS operators', () => {
  assert.equal(consultaFts('terceirização NR-1'), '"terceirizacao"* AND "nr"*');
  assert.equal(consultaFts('a OR bb', 'OR'), '"or"* OR "bb"*');
  assert.equal(consultaFts('"\' ; -- * ( )'), undefined);
  assert.equal(consultaFts('um dois tres quatro cinco seis sete oito nove dez')!.split(' AND ').length, 8);
});

test('highlighted snippets are split into plain parts, never HTML', () => {
  assert.deepEqual(partesDoTrecho('antes \u0001<b>termo\u0002 depois'), [{ texto: 'antes ', destaque: false }, { texto: '<b>termo', destaque: true }, { texto: ' depois', destaque: false }]);
});

test('every document is cataloged on exactly one existing shelf', () => {
  const ids = ESTANTES.map(e => e.id); assert.equal(new Set(ids).size, ids.length);
  for (const d of [{ source: 'sindeprestem', section: 'convencao', url: 'x' }, { source: 'sindeprestem', section: 'noticia', url: 'x' }, { source: 'sindeprestem', section: 'contato', url: 'x' }, { source: 'mte', kind: 'noticia', url: 'x' },
    { source: 'mte', kind: 'assunto', url: 'https://x/normas-regulamentadoras-vigentes/nr-1' }, { source: 'mte', kind: 'assunto', url: 'x' }, { source: 'camara', url: 'x' }, { source: 'senado', url: 'x' }, { source: 'tst', url: 'x' }, { source: 'constituicao', url: 'x' }, { source: 'regimentos', url: 'x' }])
    assert.ok(estantePorId(estanteDoDocumento(d)), JSON.stringify(d));
});

test('the library lists shelves, filters by facet, searches with highlights and reads a document', () => {
  const pasta = mkdtempSync(path.join(tmpdir(), 'sindi-biblioteca-')); const anterior = process.env.SINDI_DATA_DIR; process.env.SINDI_DATA_DIR = pasta;
  try {
    const db = openDb(path.join(pasta, 'sindi-dados.sqlite'));
    const site = 'https://www.sindeprestem.com.br';
    upsertDocument(db, { source: 'sindeprestem', url: `${site}/a.pdf`, title: 'CCT Portaria 2025', content: 'Capa registrada no MTE. CLÁUSULA PRIMEIRA - ABRANGÊNCIA A convenção abrange porteiros e controladores de acesso do Estado de São Paulo.', meta: { section: 'convencao', category: 'Portaria', year: 2025, type: 'Convenção coletiva' } });
    upsertDocument(db, { source: 'sindeprestem', url: `${site}/b.pdf`, title: 'CCT Geral 2023', content: 'Texto da convenção geral sobre terceirização e trabalho temporário.', meta: { section: 'convencao', category: 'Geral', year: 2023, type: 'Convenção coletiva' } });
    upsertDocument(db, { source: 'sindeprestem', url: `${site}/lista`, title: 'Lista', content: 'Página de listagem de convenções', meta: { section: 'convencao', listing: true } });
    upsertDocument(db, { source: 'mte', url: 'https://gov.br/x/normas-regulamentadoras-vigentes/nr-1', title: 'Norma Regulamentadora No. 1 (NR-1)', content: 'A NR-1 estabelece disposições gerais sobre segurança e saúde no trabalho.', meta: { kind: 'assunto' } });
    db.close();

    const resumo = resumoDaBiblioteca();
    assert.equal(resumo.estantes.find(e => e.estante.id === 'convencoes')?.total, 2, 'a página de listagem não conta');
    assert.equal(resumo.estantes.find(e => e.estante.id === 'normas')?.total, 1);

    const todas = listarEstante(estantePorId('convencoes')!, { facetas: {}, pagina: 1 });
    assert.equal(todas.total, 2); assert.deepEqual(todas.facetas.find(f => f.id === 'categoria')?.opcoes.map(o => o.valor), ['Geral', 'Portaria']);
    const portaria = listarEstante(estantePorId('convencoes')!, { facetas: { categoria: 'Portaria' }, pagina: 1 });
    assert.deepEqual(portaria.itens.map(i => i.titulo), ['CCT Portaria 2025']);
    assert.match(portaria.itens[0].resumo, /^CLÁUSULA PRIMEIRA/, 'o resumo pula a capa da convenção');
    assert.equal(listarEstante(estantePorId('convencoes')!, { facetas: { ano: '2023' }, pagina: 1 }).itens[0].titulo, 'CCT Geral 2023');
    assert.equal(listarEstante(estantePorId('convencoes')!, { q: 'porteiros', facetas: {}, pagina: 1 }).total, 1);

    const busca = buscarNaBiblioteca('terceirizacao trabalho');
    assert.equal(busca.achados[0].titulo, 'CCT Geral 2023'); assert.equal(busca.achados[0].estante, 'convencoes');
    assert.ok(busca.achados[0].partes.some(p => p.destaque));
    assert.deepEqual(busca.porEstante.map(e => e.id).sort(), ['convencoes', 'normas'], 'poucos resultados com todas as palavras: a busca amplia para qualquer palavra');

    const documento = lerDocumento(portaria.itens[0].id);
    assert.equal(documento?.estante, 'convencoes'); assert.match(documento?.texto ?? '', /porteiros/); assert.equal(documento?.fonteOriginal, `${site}/a.pdf`);
    assert.equal(lerDocumento(999999), undefined);
  } finally { if (anterior === undefined) delete process.env.SINDI_DATA_DIR; else process.env.SINDI_DATA_DIR = anterior; rmSync(pasta, { recursive: true, force: true }); }
});
