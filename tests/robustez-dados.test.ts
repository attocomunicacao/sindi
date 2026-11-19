import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { abandonarExecucoes, falhasSeguidas, finishRun, openDb, podarExecucoes, startRun } from '../src/lib/dados/db';
import { syncAll } from '../src/lib/dados/sync';
import { dataIso, listaOuErro } from '../src/lib/dados/http';
import { pdfToText } from '../src/lib/dados/legal';
import type { Collector } from '../src/lib/dados/collectors/types';

const atraso = (ms: number) => new Promise(r => setTimeout(r, ms));
async function comBanco(fn: (db: ReturnType<typeof openDb>, pasta: string) => Promise<void>) {
  const pasta = mkdtempSync(path.join(tmpdir(), 'sindi-robustez-')); const anterior = process.env.SINDI_DATA_DIR; process.env.SINDI_DATA_DIR = pasta;
  const db = openDb(path.join(pasta, 'dados.sqlite'));
  try { await fn(db, pasta); } finally { db.close(); if (anterior === undefined) delete process.env.SINDI_DATA_DIR; else process.env.SINDI_DATA_DIR = anterior; rmSync(pasta, { recursive: true, force: true }); }
}
const coletor = (source: string, run: Collector['run']): Collector => ({ source, label: source.toUpperCase(), run });
const ultimaExecucao = (db: ReturnType<typeof openDb>, source: string) => ({ ...(db.prepare('SELECT status, error FROM runs WHERE source = ? ORDER BY id DESC LIMIT 1').get(source) as { status: string; error: string | null }) });

test('coleta: um coletor que trava estoura o tempo e os outros seguem; erro vira registro, não exceção', async () => {
  await comBanco(async db => {
    const logs: string[] = [];
    const resultado = await syncAll(db, { log: m => logs.push(m), timeoutMs: 60, collectors: [
      coletor('lento', () => new Promise(() => {})), coletor('bom', async () => ({ fetched: 3, changed: 1 })), coletor('quebrado', async () => { throw new Error('HTTP 500 em api.exemplo'); }),
    ] });
    assert.deepEqual(resultado.map(r => [r.source, r.error ?? null]), [['lento', 'tempo esgotado (0 min)'], ['bom', null], ['quebrado', 'HTTP 500 em api.exemplo']]);
    assert.equal(ultimaExecucao(db, 'lento').status, 'error'); assert.equal(ultimaExecucao(db, 'bom').status, 'ok');
    assert.ok(logs.some(l => /LENTO: ERRO tempo esgotado/.test(l)));
  });
});

test('coleta: no máximo N coletores ao mesmo tempo, e todos rodam', async () => {
  await comBanco(async db => {
    let ativos = 0; let pico = 0; const rodaram: string[] = [];
    const lento = (nome: string) => coletor(nome, async () => { ativos++; pico = Math.max(pico, ativos); await atraso(25); ativos--; rodaram.push(nome); return { fetched: 1, changed: 0 }; });
    await syncAll(db, { concurrency: 2, collectors: ['a', 'b', 'c', 'd', 'e', 'f'].map(lento) });
    assert.equal(pico, 2); assert.equal(rodaram.length, 6);
    await syncAll(db, { concurrency: 3, only: ['a', 'b', 'c'], collectors: ['a', 'b', 'c', 'd'].map(lento) });
    assert.equal(rodaram.length, 9, '`only` filtra os coletores');
  });
});

test('coleta: falhas seguidas são contadas, destacadas no log depois de três e zeradas por um sucesso', async () => {
  await comBanco(async db => {
    const logs: string[] = []; let quebrar = true;
    const instavel = coletor('fonte', async () => { if (quebrar) throw new Error('fora do ar'); return { fetched: 1, changed: 1 }; });
    for (let i = 0; i < 3; i++) await syncAll(db, { log: m => logs.push(m), collectors: [instavel] });
    assert.equal(falhasSeguidas(db, 'fonte'), 3);
    assert.ok(logs.filter(l => /falhas seguidas/.test(l)).length === 1, 'só a terceira falha é destacada'); assert.match(logs.at(-1)!, /3 falhas seguidas: a fonte precisa de atenção/);
    quebrar = false; await syncAll(db, { collectors: [instavel] });
    assert.equal(falhasSeguidas(db, 'fonte'), 0);
    assert.equal(falhasSeguidas(db, 'sem-historico'), 0);
  });
});

test('execuções que ficaram "running" (processo encerrado) são fechadas, e o histórico antigo é podado sem perder a última coleta ok', async () => {
  await comBanco(async db => {
    startRun(db, 'orfa'); // fica "running"
    assert.equal(abandonarExecucoes(db), 1);
    assert.deepEqual(ultimaExecucao(db, 'orfa'), { status: 'error', error: 'interrompida (o processo foi encerrado)' });
    const velho = new Date(Date.now() - 200 * 86_400_000).toISOString();
    const inserir = (source: string, status: string, quando: string) => db.prepare('INSERT INTO runs (source, started_at, finished_at, status) VALUES (?,?,?,?)').run(source, quando, quando, status);
    inserir('antiga', 'ok', velho);                                   // a única coleta ok: nunca é podada
    for (let i = 0; i < 60; i++) inserir('antiga', 'error', velho);   // 60 falhas velhas: só as 50 mais recentes ficam
    for (let i = 0; i < 3; i++) inserir('nova', 'ok', new Date().toISOString());
    const removidas = podarExecucoes(db, 90, 50);
    assert.ok(removidas >= 10);
    assert.equal((db.prepare("SELECT count(*) AS n FROM runs WHERE source = 'antiga' AND status = 'ok'").get() as { n: number }).n, 1, 'a última coleta ok sobrevive');
    assert.ok((db.prepare("SELECT count(*) AS n FROM runs WHERE source = 'antiga'").get() as { n: number }).n <= 52);
    assert.equal((db.prepare("SELECT count(*) AS n FROM runs WHERE source = 'nova'").get() as { n: number }).n, 3, 'o histórico recente fica inteiro');
    const run = startRun(db, 'x'); finishRun(db, run, { fetched: 1, changed: 0 }); assert.equal(ultimaExecucao(db, 'x').status, 'ok');
  });
});

test('respostas externas: lista ausente vira erro claro e data inválida vira undefined (não RangeError)', () => {
  assert.deepEqual(listaOuErro([1, 2], 'x'), [1, 2]);
  assert.throws(() => listaOuErro(undefined, 'api.exemplo.gov.br'), /Resposta inesperada de api\.exemplo\.gov\.br/);
  assert.throws(() => listaOuErro({ items: [] }, 'x'), /Resposta inesperada/);
  assert.equal(dataIso('2026-10-13T12:00:00Z'), '2026-10-13T12:00:00.000Z'); assert.equal(dataIso('não é data'), undefined); assert.equal(dataIso('ontem'), undefined, 'o V8 leria "ontem" como uma data qualquer');
  assert.equal(dataIso('2026-10-01T10:30', { fuso: '-03:00' }), '2026-10-01T13:30:00.000Z'); assert.equal(dataIso('2026-10-01T10:30:45', { fuso: '-03:00' }), '2026-10-01T13:30:45.000Z'); assert.equal(dataIso('2026-10-01T10:30:00Z', { fuso: '-03:00' }), '2026-10-01T10:30:00.000Z', 'data que já tem fuso não muda'); assert.equal(dataIso(123 as never), undefined); assert.equal(dataIso(''), undefined); assert.equal(dataIso(undefined), undefined); assert.equal(dataIso('NaN-NaN-NaNT12:00:00Z'), undefined);
});

test('PDF: o teto de páginas limita o texto extraído', async () => {
  const doc = await PDFDocument.create();
  for (const t of ['Primeira pagina', 'Segunda pagina', 'Terceira pagina']) doc.addPage().drawText(t);
  const bytes = new Uint8Array(await doc.save());
  // O leitor de PDF toma posse do buffer (ele fica inutilizável depois): cada leitura recebe a sua cópia.
  const tudo = await pdfToText(new Uint8Array(bytes)); assert.match(tudo, /Primeira/); assert.match(tudo, /Terceira/);
  const so = await pdfToText(new Uint8Array(bytes), { paginas: 1 }); assert.match(so, /Primeira/); assert.doesNotMatch(so, /Segunda|Terceira/);
});

test('cérebro: erro na reavaliação depois de gravar restaura a versão anterior (e repassa o erro); pasta interrompida é recuperada', async () => {
  const { publicarCerebro, MINIMOS, restaurarAnterior } = await import('../src/lib/cerebro/publicar');
  const pasta = mkdtempSync(path.join(tmpdir(), 'sindi-cerebro-rb-')); const anteriorEnv = process.env.SINDI_CEREBRO_DIR; process.env.SINDI_CEREBRO_DIR = pasta;
  mkdirSync(path.join(pasta, 'auto'));
  const arquivosValidos = (marca: string) => Object.fromEntries(Object.entries(MINIMOS).map(([nome, minimo]) => [nome, `---\natualizado: 2026-10-13\n---\n${marca} `.padEnd(minimo + 50, 'x')]));
  const caso = (pergunta: string, ok: boolean) => ({ pergunta, ok, origem: 'direta', faltam: [], proibidos: [], evidencia: '' });
  const db = {} as never; const logs: string[] = []; const ler = (arq: string) => readFileSync(path.join(pasta, 'auto', arq), 'utf8');
  try {
    for (const [nome, texto] of Object.entries(arquivosValidos('antigo'))) writeFileSync(path.join(pasta, 'auto', nome), texto);
    let chamada = 0;
    await assert.rejects(publicarCerebro(db, m => logs.push(m), { gerar: () => arquivosValidos('novo'), avaliar: async () => { if (++chamada === 2) throw new Error('avaliação caiu'); return [caso('a', true)]; } }), /avaliação caiu/);
    assert.match(ler('convencoes.md'), /antigo/, 'a versão anterior voltou ao lugar'); assert.doesNotMatch(ler('convencoes.md'), /novo/);
    assert.ok(logs.some(l => /erro ao gravar ou avaliar a nova versão .*avaliação caiu.*versão anterior restaurada/.test(l)), 'o log diz a verdade');
    assert.equal(existsSync(path.join(pasta, 'auto.descartada')), false);
    // Queda entre os dois passos da restauração: a pasta atual sumiu e só a cópia existe; a próxima publicação a recoloca antes de qualquer coisa.
    const anterior = path.join(pasta, 'auto.anterior'); mkdirSync(anterior);
    writeFileSync(path.join(anterior, 'convencoes.md'), 'COPIA SEGURA'); rmSync(path.join(pasta, 'auto'), { recursive: true });
    const igual = await publicarCerebro(db, () => {}, { gerar: () => ({}), avaliar: async () => [] }).catch(e => e);
    assert.ok(existsSync(path.join(pasta, 'auto', 'convencoes.md')), 'a cópia assumiu o lugar da pasta ausente'); assert.equal(ler('convencoes.md'), 'COPIA SEGURA'); void igual;
    // restaurarAnterior sozinho: troca sem apagar antes e sem deixar sobras.
    mkdirSync(path.join(pasta, 'x-atual')); writeFileSync(path.join(pasta, 'x-atual', 'a.txt'), 'atual'); mkdirSync(path.join(pasta, 'x-anterior')); writeFileSync(path.join(pasta, 'x-anterior', 'a.txt'), 'anterior');
    restaurarAnterior(path.join(pasta, 'x-atual'), path.join(pasta, 'x-anterior'));
    assert.equal(readFileSync(path.join(pasta, 'x-atual', 'a.txt'), 'utf8'), 'anterior'); assert.equal(existsSync(path.join(pasta, 'x-anterior')), false); assert.equal(existsSync(path.join(pasta, 'x-atual.descartada')), false);
  } finally { if (anteriorEnv === undefined) delete process.env.SINDI_CEREBRO_DIR; else process.env.SINDI_CEREBRO_DIR = anteriorEnv; rmSync(pasta, { recursive: true, force: true }); }
});

test('índice de vetores: cada lote é gravado ao terminar, então uma falha no meio não perde o que já foi calculado', async () => {
  const { indexarCerebro, arquivoDeVetores } = await import('../src/lib/cerebro/embeddings');
  const { dividirEmTrechos } = await import('../src/lib/cerebro/carregar');
  const pasta = mkdtempSync(path.join(tmpdir(), 'sindi-indice-')); const antes = { dados: process.env.SINDI_DATA_DIR, fetch: globalThis.fetch, chave: process.env.GEMINI_API_KEY };
  process.env.SINDI_DATA_DIR = pasta; process.env.GEMINI_API_KEY = 'chave-de-teste';
  const markdown = Array.from({ length: 45 }, (_, i) => `## Assunto ${i}\nTexto do assunto número ${i} com conteúdo suficiente para virar um trecho.`).join('\n\n');
  const trechos = dividirEmTrechos(markdown, 'longo.md', { gatilhos: [], tipo: 'curado', prioridade: 1, direta: false, semantica: true });
  const semantica = trechos.filter(t => t.semantica).length;
  try {
    assert.ok(semantica > 40, `trechos semânticos: ${semantica}`);
    let lotes = 0;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      const { requests } = JSON.parse(String(init?.body)) as { requests: unknown[] }; lotes++;
      return lotes === 2 ? new Response('{}', { status: 500 }) : Response.json({ embeddings: requests.map(() => ({ values: [1, 0, 0] })) });
    }) as typeof fetch;
    const original = global.setTimeout;
    // As pausas entre lotes (15 s) não fazem parte do que se testa.
    global.setTimeout = ((fn: () => void) => original(fn, 0)) as typeof setTimeout;
    try { await assert.rejects(indexarCerebro(trechos), /Embeddings HTTP 500/); } finally { global.setTimeout = original; }
    const gravado = JSON.parse(readFileSync(arquivoDeVetores(), 'utf8')) as { vetores: Record<string, unknown> };
    assert.equal(Object.keys(gravado.vetores).length, 20, 'o primeiro lote (20 trechos) foi gravado antes da falha do segundo');
    lotes = 100; // a próxima tentativa só calcula o que falta
    global.setTimeout = ((fn: () => void) => original(fn, 0)) as typeof setTimeout;
    try { const r = await indexarCerebro(trechos); assert.equal(r.novos, semantica - 20); } finally { global.setTimeout = original; }
  } finally {
    globalThis.fetch = antes.fetch; if (antes.chave === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = antes.chave;
    if (antes.dados === undefined) delete process.env.SINDI_DATA_DIR; else process.env.SINDI_DATA_DIR = antes.dados; rmSync(pasta, { recursive: true, force: true });
  }
});
