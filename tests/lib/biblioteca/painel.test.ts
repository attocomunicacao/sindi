import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { abrirBanco, gravarIndicador, iniciarExecucao, finalizarExecucao, gravarDocumento } from '@/lib/dados/db';
import { esquecerPainelEmCache, lerPainelEmCache } from '@/lib/dados/painel';
import { DEFASADA_HORAS, fontesDefasadas } from '@/lib/dados/frescor';
import { lerDocumento, listarEstante, refDoDocumento, resumoDaBiblioteca } from '@/lib/biblioteca/consulta';
import { estantePorId } from '@/lib/biblioteca/estantes';

const hora = 3_600_000;

test('fontes defasadas: cada fonte é medida pela própria última coleta ok, não pela melhor delas', () => {
  const agora = Date.parse('2026-11-20T12:00:00Z');
  const iso = (horasAtras: number) => new Date(agora - horasAtras * hora).toISOString();
  const defasadas = fontesDefasadas(
    [
      { source: 'bcb', lastOk: iso(2), status: 'ok' }, // recente
      { source: 'ibge', lastOk: iso(DEFASADA_HORAS - 1), status: 'ok' }, // no limite, ainda vale
      { source: 'camara', lastOk: iso(72), status: 'ok' }, // parada há 3 dias, coleta "ok" mas antiga
      { source: 'tst', lastOk: iso(50), status: 'error' }, // falhando e antiga
      { source: 'mte', lastOk: null, status: 'error' }, // nunca coletou
      { source: 'wec', lastOk: iso(30), status: 'error' }, // falha recente demais para alarmar? (30 h > 24 h: alarma)
    ],
    agora,
  );
  assert.deepEqual(
    defasadas.map((f) => [f.source, f.motivo, f.horas]),
    [
      ['camara', 'antiga', 72],
      ['tst', 'falha', 50],
      ['mte', 'nunca', null],
      ['wec', 'falha', 30],
    ],
  );
  assert.deepEqual(fontesDefasadas([{ source: 'bcb', lastOk: iso(3), status: 'ok' }], agora), []);
  assert.deepEqual(fontesDefasadas([], agora), []);
  assert.equal(fontesDefasadas([{ source: 'x', lastOk: 'data inválida', status: 'ok' }], agora)[0].motivo, 'nunca');
});

test('lerPainelEmCache: reaproveita a leitura por 30 s e lê de novo depois; lerPainel não tem cache', () => {
  const pasta = mkdtempSync(path.join(tmpdir(), 'sindi-painel-'));
  const arquivo = path.join(pasta, 'dados.sqlite');
  try {
    esquecerPainelEmCache();
    const db = abrirBanco(arquivo);
    gravarIndicador(db, {
      id: 'bcb.selic-meta',
      source: 'bcb',
      group: 'Juros',
      label: 'Meta da taxa Selic',
      value: 13.75,
      unit: '% ao ano',
      period: '17/09/2026',
      previous: 14,
      url: 'https://www.bcb.gov.br/',
    });
    const rodada = iniciarExecucao(db, 'bcb');
    finalizarExecucao(db, rodada, { fetched: 1, changed: 1 });
    const t0 = Date.parse('2026-11-20T12:00:00Z');
    assert.equal(lerPainelEmCache(arquivo, t0).indicators[0].value, 13.75);
    gravarIndicador(db, {
      id: 'bcb.selic-meta',
      source: 'bcb',
      group: 'Juros',
      label: 'Meta da taxa Selic',
      value: 14.25,
      unit: '% ao ano',
      period: '29/10/2026',
      previous: 13.75,
      url: 'https://www.bcb.gov.br/',
    });
    assert.equal(
      lerPainelEmCache(arquivo, t0 + 10_000).indicators[0].value,
      13.75,
      'dentro de 30 s: a leitura guardada',
    );
    assert.equal(lerPainelEmCache(arquivo, t0 + 31_000).indicators[0].value, 14.25, 'depois de 30 s: lê de novo');
    db.close();
    esquecerPainelEmCache();
    assert.equal(lerPainelEmCache(path.join(pasta, 'nao-existe.sqlite')).available, false);
  } finally {
    esquecerPainelEmCache();
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('biblioteca: o link leva o código do endereço, e um id reaproveitado por outro documento não abre o errado', () => {
  const pasta = mkdtempSync(path.join(tmpdir(), 'sindi-ref-'));
  const anterior = process.env.SINDI_DATA_DIR;
  process.env.SINDI_DATA_DIR = pasta;
  try {
    const db = abrirBanco(path.join(pasta, 'sindi-dados.sqlite'));
    const site = 'https://www.sindeprestem.com.br';
    gravarDocumento(db, {
      source: 'sindeprestem',
      url: `${site}/a.pdf`,
      title: 'CCT Portaria 2025',
      content: 'CLÁUSULA PRIMEIRA - ABRANGÊNCIA porteiros',
      meta: { section: 'convencao', category: 'Portaria', year: 2025 },
    });
    db.close();
    const item = listarEstante(estantePorId('convencoes')!, { facetas: {}, pagina: 1 }).itens[0];
    assert.match(item.ref, /^[0-9a-f]{6}$/);
    assert.equal(item.ref, refDoDocumento(`${site}/a.pdf`));
    assert.equal(refDoDocumento(`${site}/a.pdf#parte-2`), item.ref, 'o fragmento não muda o código');
    assert.notEqual(refDoDocumento(`${site}/b.pdf`), item.ref);
    assert.equal(lerDocumento(item.id, item.ref)?.titulo, 'CCT Portaria 2025');
    assert.equal(lerDocumento(item.id)?.titulo, 'CCT Portaria 2025', 'links antigos, sem código, continuam abrindo');
    assert.equal(
      lerDocumento(item.id, refDoDocumento(`${site}/outro.pdf`)),
      undefined,
      'id apontando para outro documento: não abre',
    );
    assert.equal(resumoDaBiblioteca().disponivel, true);
  } finally {
    if (anterior === undefined) delete process.env.SINDI_DATA_DIR;
    else process.env.SINDI_DATA_DIR = anterior;
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('biblioteca: sem banco, a leitura devolve vazio sem lançar erro e o resumo diz que não há dados', () => {
  const pasta = mkdtempSync(path.join(tmpdir(), 'sindi-vazio-'));
  const anterior = process.env.SINDI_DATA_DIR;
  process.env.SINDI_DATA_DIR = pasta;
  try {
    assert.equal(lerDocumento(1), undefined);
    assert.deepEqual(listarEstante(estantePorId('convencoes')!, { facetas: {}, pagina: 1 }).itens, []);
    assert.equal(resumoDaBiblioteca().estantes.find((e) => e.estante.id === 'convencoes')?.total, 0);
  } finally {
    if (anterior === undefined) delete process.env.SINDI_DATA_DIR;
    else process.env.SINDI_DATA_DIR = anterior;
    rmSync(pasta, { recursive: true, force: true });
  }
});
