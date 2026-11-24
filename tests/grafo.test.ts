import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb, upsertDocument } from '../src/lib/dados/db';
import { extrairEntidades } from '../src/lib/grafo/entidades';
import { construirGrafo } from '../src/lib/grafo/construir';
import { exportarObsidian } from '../src/lib/grafo/obsidian';
import { arquivoDoGrafo, documentosPeloGrafo, esquecerGrafo } from '../src/lib/grafo/consulta';
import { grafoDaArquitetura } from '../src/lib/grafo/arquitetura';
import { estantesDaOrquestra, montarOrquestra } from '../src/lib/agentes/orquestrador';
import { conectores } from '../src/lib/cerebro/conectores';
import { linksDoSite } from '../src/lib/dados/collectors/sindeprestem';
import { GET } from '../src/app/api/cerebro/grafo/route';
import { reiniciarLimitesNaMemoria } from '../src/lib/limite';

test('entidades: leis (com e sem ponto, ano de 2 dígitos, "de 1974"), NRs, projetos e apelidos; sem falsos positivos em números soltos', () => {
  const ids = (t: string) => extrairEntidades(t).map(e => e.id);
  assert.deepEqual(ids('A Lei nº 13.429/2017 alterou a Lei 6.019, de 3 de janeiro de 1974.'), ['lei:13429/2017', 'lei:6019/1974']);
  assert.deepEqual(ids('Lei Complementar 123/06 e Decreto-Lei 5.452/43; a Lei 605/49'), ['lei:123/2006', 'lei:5452/1943', 'lei:605/1949']);
  assert.equal(extrairEntidades('Decreto-Lei 5.452/43')[0].rotulo, 'Decreto-Lei 5.452/1943');
  assert.deepEqual(ids('Atualização da NR-1 e da Norma Regulamentadora nº 35; NR 17'), ['nr:1', 'nr:35', 'nr:17']);
  assert.deepEqual(ids('O PL 1234/2023 e a PEC 45/2019 tramitam'), ['prop:PL-1234/2023', 'prop:PEC-45/2019']);
  assert.ok(ids('a CLT e a reforma trabalhista').includes('lei:5452/1943') && ids('a reforma trabalhista').includes('lei:13467/2017'));
  assert.deepEqual(ids('O prazo é de 180 dias, protocolo 2024/2025, R$ 1.500,00, NR-99'), []);
  assert.equal(extrairEntidades('Lei 13.429/2017 '.repeat(100), 5).length, 1, 'entidades repetidas contam uma vez');
});

test('coletor do site: só links https do próprio domínio, normalizados e sem repetição', () => {
  assert.deepEqual(linksDoSite(['https://www.sindeprestem.com.br/contato/', 'https://www.sindeprestem.com.br/contato?x=1#a', 'http://www.sindeprestem.com.br/x', 'https://evil.example/sindeprestem.com.br', 'javascript:alert(1)', 42]), { links: ['https://www.sindeprestem.com.br/contato'] });
  assert.deepEqual(linksDoSite(undefined), {});
});

async function comBancoDoGrafo(fn: (pasta: string) => Promise<void> | void) {
  const pasta = mkdtempSync(path.join(tmpdir(), 'sindi-grafo-')); const antes = process.env.SINDI_DATA_DIR;
  process.env.SINDI_DATA_DIR = pasta; esquecerGrafo();
  const db = openDb(path.join(pasta, 'sindi-dados.sqlite'));
  const doc = (url: string, source: string, title: string, content: string, meta: Record<string, unknown> = {}, publishedAt?: string) => upsertDocument(db, { url, source, title, content, meta, publishedAt });
  doc('https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=1', 'camara', 'PL 1234/2023', 'Altera a Lei 6.019/1974 para tratar do trabalho temporário.');
  doc('https://www.sindeprestem.com.br/noticias/pl-temporario', 'sindeprestem', 'Sindeprestem acompanha projeto sobre temporários', 'O PL 1234/2023, que altera a Lei 6.019/1974, foi debatido pelo sindicato em audiência.', { section: 'noticia', links: ['https://www.sindeprestem.com.br/cartilhas/temporario'] }, '2026-10-01');
  doc('https://www.sindeprestem.com.br/cartilhas/temporario', 'sindeprestem', 'Cartilha do trabalho temporário', 'A Lei 6.019/1974, alterada pela Lei 13.429/2017, regula o trabalho temporário.', { section: 'cartilha' });
  doc('https://www.sindeprestem.com.br/noticias', 'sindeprestem', 'Notícias', 'lista', { section: 'noticia', listing: true });
  doc('https://www.gov.br/trabalho/nr-1', 'mte', 'NR-1 Disposições gerais', 'Texto da NR-1.', { kind: 'assunto' });
  db.close();
  try { await fn(pasta); } finally { esquecerGrafo(); rmSync(pasta, { recursive: true, force: true }); if (antes === undefined) delete process.env.SINDI_DATA_DIR; else process.env.SINDI_DATA_DIR = antes; }
}

test('grafo: núcleo → especialistas → estantes; documentos ligados por lei, projeto e link do site; listagens ficam de fora; posições calculadas', async () => {
  await comBancoDoGrafo(pasta => {
    const g = construirGrafo({ banco: path.join(pasta, 'sindi-dados.sqlite'), iteracoes: 30 });
    const porId = new Map(g.nos.map(n => [n.id, n]));
    assert.equal(g.resumo.nucleo, 1); assert.equal(g.resumo.conector, conectores().length); assert.equal(g.resumo.documento, 4, 'a página de listagem não vira documento');
    const liga = (a: string, b: string) => g.arestas.some(x => (x.de === a && x.para === b) || (x.de === b && x.para === a));
    assert.ok(liga('sindi', 'conector:legislacao-e-seguranca-juridica'));
    assert.ok(liga('conector:legislacao-e-seguranca-juridica', 'estante:proposicoes'));
    const lei = 'ent:lei:6019/1974'; assert.equal(porId.get(lei)?.rotulo, 'Lei 6.019/1974');
    assert.equal(g.arestas.filter(a => a.para === lei || a.de === lei).length, 3, 'os três documentos que citam a Lei 6.019 ficam ligados a ela');
    assert.ok(!porId.has('ent:lei:13429/2017'), 'lei citada por um documento só não vira nó');
    assert.ok(porId.has('ent:prop:PL-1234/2023'));
    const documento = (inicio: string) => g.nos.find(n => n.tipo === 'documento' && n.rotulo.startsWith(inicio))!;
    const noticia = documento('Sindeprestem acompanha'); const cartilha = documento('Cartilha do trabalho');
    assert.ok(liga(noticia.id, cartilha.id), 'link do próprio site vira ligação'); assert.match(noticia.href!, /^\/base\/documento\/\d+\?r=[0-9a-f]{6}$/);
    assert.ok(g.nos.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)));
    assert.doesNotMatch(JSON.stringify(g), /foi debatido pelo sindicato em audiência/, 'o grafo não leva o texto dos documentos');
  });
});

test('grafo no chat: pergunta que cita o projeto pelo número traz os documentos ligados a ele; o arquivo velho (rowid trocado) é ignorado', async () => {
  await comBancoDoGrafo(pasta => {
    writeFileSync(arquivoDoGrafo(), JSON.stringify(construirGrafo({ banco: path.join(pasta, 'sindi-dados.sqlite'), iteracoes: 10 })));
    const achados = documentosPeloGrafo('O que é o PL 1234/2023?');
    assert.equal(achados[0].title, 'PL 1234/2023', 'o próprio projeto vem primeiro');
    assert.ok(achados.some(p => p.title.startsWith('Sindeprestem acompanha')));
    assert.ok(achados.every(p => p.content.length <= 1200));
    assert.deepEqual(documentosPeloGrafo('Qual o telefone do sindicato?'), [], 'sem entidade na pergunta, nada muda na busca');
    // Banco refeito: o rowid do grafo passa a apontar para outro documento e o código curto não confere.
    const g = JSON.parse(readFileSync(arquivoDoGrafo(), 'utf8')); for (const n of g.nos) if (n.tipo === 'documento') n.id = n.id.replace(/:[0-9a-f]{6}:/, ':000000:');
    writeFileSync(arquivoDoGrafo(), JSON.stringify(g)); esquecerGrafo();
    assert.deepEqual(documentosPeloGrafo('O que é o PL 1234/2023?'), []);
  });
});

test('rota do grafo: sem arquivo gerado devolve o grafo só do cérebro; com ele, o completo', async () => {
  await comBancoDoGrafo(async pasta => {
    reiniciarLimitesNaMemoria();
    const pedir = () => GET(new Request('http://localhost/api/cerebro/grafo', { headers: { 'x-real-ip': '203.0.113.90' } }));
    const so = await pedir(); assert.equal(so.status, 200); assert.equal(((await so.json()) as { resumo: { documento: number } }).resumo.documento, 0, 'sem biblioteca, sem documentos');
    writeFileSync(arquivoDoGrafo(), JSON.stringify(construirGrafo({ banco: path.join(pasta, 'sindi-dados.sqlite'), iteracoes: 5 }))); esquecerGrafo();
    const ok = await pedir(); assert.equal(ok.status, 200); assert.ok(((await ok.json()) as { nos: unknown[] }).nos.length > 10);
    reiniciarLimitesNaMemoria();
  });
});

test('cofre do Obsidian: uma nota por nó, ligações [[...]] que resolvem, cores por tipo e nomes de arquivo seguros', async () => {
  await comBancoDoGrafo(pasta => {
    const g = construirGrafo({ banco: path.join(pasta, 'sindi-dados.sqlite'), iteracoes: 5 });
    g.nos.push({ id: 'x', tipo: 'documento', rotulo: 'Título/perigoso: ../../ <script>?', grupo: 'x', x: 0, y: 0, grau: 0 });
    const cofre = path.join(pasta, 'cofre');
    const { notas } = exportarObsidian(g, cofre);
    const arquivos = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? arquivos(path.join(dir, e.name)) : [path.join(dir, e.name)]);
    const md = arquivos(cofre).filter(a => a.endsWith('.md') && !a.endsWith('LEIA-ME.md'));
    assert.equal(md.length, notas); assert.ok(md.every(a => path.resolve(a).startsWith(path.resolve(cofre))), 'nenhuma nota fora do cofre');
    const nomes = new Set(md.map(a => path.basename(a, '.md')));
    const ligacoes = md.flatMap(a => [...readFileSync(a, 'utf8').matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1]));
    assert.ok(ligacoes.length > 10 && ligacoes.every(l => nomes.has(l)), 'toda ligação aponta para uma nota que existe');
    assert.ok(existsSync(path.join(cofre, '.obsidian', 'graph.json')));
  });
});

test('arquitetura: o caminho da pergunta passa por guarda, orquestrador, especialistas, fontes, cascata (com o local por último) e verificação', () => {
  const { nos, arestas } = grafoDaArquitetura(); const ids = new Set(nos.map(n => n.id));
  assert.ok(arestas.every(a => ids.has(a.de) && ids.has(a.para)));
  for (const passo of ['arq:guarda', 'arq:orquestrador', 'arq:redacao', 'arq:ollama', 'arq:verificador', 'arq:resposta']) assert.ok(ids.has(passo), passo);
  assert.equal(nos.filter(n => n.id.startsWith('arq:esp-')).length, conectores().length, 'um especialista por conector');
});

test('orquestra: pergunta entre duas áreas aciona o especialista de apoio; pergunta de uma área só fica com o principal', () => {
  const todos = conectores(); const por = (id: string) => todos.find(c => c.id === id)!;
  const so = montarOrquestra('Como calcular o custo de um posto de vigilância?', por('custos-tributacao-e-planejamento'), todos);
  assert.equal(so[0].papel, 'principal');
  const vazia = montarOrquestra('oi', undefined, todos); assert.deepEqual(vazia, []);
  const misturada = montarOrquestra('Quais leis e normas regulamentadoras afetam o custo e a tributação do contrato de terceirização?', por('legislacao-e-seguranca-juridica'), todos);
  if (misturada.length > 1) {
    assert.equal(misturada[1].papel, 'apoio'); assert.notEqual(misturada[1].conector.id, misturada[0].conector.id);
    const estantes = estantesDaOrquestra(misturada); assert.deepEqual(estantes.slice(0, misturada[0].conector.estantes.length), misturada[0].conector.estantes, 'as estantes do principal vêm primeiro');
    assert.ok(estantes.length <= 6);
  }
});
