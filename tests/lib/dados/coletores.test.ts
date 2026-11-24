import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comBanco, simularRede, type Rota } from '../../apoio/rede-simulada';
import { lerData } from '@/lib/dados/html';
import { bcb } from '@/lib/dados/coletores/bcb';
import { ibge } from '@/lib/dados/coletores/ibge';
import { camara } from '@/lib/dados/coletores/camara';
import { senado } from '@/lib/dados/coletores/senado';
import { tst } from '@/lib/dados/coletores/tst';
import { wec } from '@/lib/dados/coletores/wec';
import type { Coletor } from '@/lib/dados/coletores/tipos';
import type { BancoDeDados } from '@/lib/dados/db';

// Cada coletor roda de verdade (banco SQLite temporário, sem esperas) contra respostas gravadas da fonte: uma boa, uma vazia, uma malformada e uma com erro.
async function coletar(coletor: Coletor, db: BancoDeDados, rotas: Rota[], full = false) {
  const rede = simularRede(rotas);
  try { return { resultado: await coletor.run({ db, full }), chamadas: rede.chamadas }; } finally { rede.restaurar(); }
}
const falha = async (coletor: Coletor, db: BancoDeDados, rotas: Rota[]) => { const rede = simularRede(rotas); try { return await coletor.run({ db, full: false }).then(() => undefined, e => e as Error); } finally { rede.restaurar(); } };
const linhas = <T,>(db: BancoDeDados, sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args).map(l => ({ ...l })) as T[];
const dd = (diasAtras: number) => { const d = new Date(Date.now() - diasAtras * 86_400_000); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };

// ---------------------------------------------------------------- Banco Central
test('bcb: grava a meta Selic com o início da vigência e o valor anterior, ignorando datas futuras', async () => {
  await comBanco(async db => {
    const serie = [{ data: dd(200), valor: '14.25' }, { data: dd(100), valor: '14.75' }, { data: dd(30), valor: '15.00' }, { data: dd(29), valor: '15.00' }, { data: dd(-60), valor: '16.00' }];
    const { resultado, chamadas } = await coletar(bcb, db, [['https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados', { json: serie }]]);
    assert.deepEqual(resultado, { fetched: 1, changed: 1 }); assert.equal(chamadas.length, 1); assert.match(chamadas[0], /formato=json&dataInicial=\d{2}\/\d{2}\/\d{4}&dataFinal=/);
    const [selic] = linhas<{ value: number; period: string; previous: number }>(db, "SELECT value, period, previous FROM indicators WHERE id = 'bcb.selic-meta'");
    assert.deepEqual(selic, { value: 15, period: dd(30), previous: 14.75 }, 'valor vigente, desde quando vale e o anterior (a meta futura de 16 é ignorada)');
  });
});
test('bcb: série vazia não grava nada, e resposta que não é lista ou erro HTTP falham com mensagem clara', async () => {
  await comBanco(async db => {
    const vazia = await coletar(bcb, db, [['https://api.bcb.gov.br/', { json: [] }]]); assert.deepEqual(vazia.resultado, { fetched: 1, changed: 0 });
    assert.equal(linhas(db, 'SELECT * FROM indicators').length, 0);
    assert.match((await falha(bcb, db, [['https://api.bcb.gov.br/', { json: { erro: 'fora do ar' } }]]))?.message ?? '', /Resposta inesperada de api\.bcb\.gov\.br/);
    const rede = simularRede([['https://api.bcb.gov.br/', { texto: 'erro interno', status: 500 }]]);
    try { await assert.rejects(bcb.run({ db, full: false }), /HTTP 500 em api\.bcb\.gov\.br/); assert.equal(rede.chamadas.length, 3, 'três tentativas antes de desistir'); } finally { rede.restaurar(); }
  });
});

// ---------------------------------------------------------------- IBGE
const sidra = (serie: Record<string, string>) => [{ resultados: [{ series: [{ serie }] }] }];
const noticia = (extra: object = {}) => ({ id: 1, titulo: 'IBGE divulga a PNAD', introducao: 'A taxa de desocupação ficou em 5,6%.', data_publicacao: '13/11/2026 10:00:00', link: 'https://agenciadenoticias.ibge.gov.br/n/1', editorias: 'Trabalho', ...extra });
const rotasIbge = (noticias: unknown, porTabela: Record<string, unknown> = {}): Rota[] => [
  [/\/agregados\/(\d+)\/periodos/, url => ({ json: porTabela[url.pathname.match(/agregados\/(\d+)/)![1]] ?? sidra({ '202509': '4.10', '202510': '4.20', '202511': '4.50' }) })],
  [/\/noticias\//, { json: noticias }],
];
test('ibge: grava os indicadores (último e anterior), pula o que não tem número e guarda as notícias com data válida ou sem data', async () => {
  await comBanco(async db => {
    const noticias = { totalPages: 1, items: [noticia(), noticia({ id: 2, titulo: 'Sem data válida', data_publicacao: 'sem/data', link: 'https://agenciadenoticias.ibge.gov.br/n/2' }), noticia({ id: 3, link: '' }), noticia({ id: 4, titulo: '' })] };
    const { resultado } = await coletar(ibge, db, rotasIbge(noticias, { '5906': sidra({ '202510': '...', '202511': '-' }) }));
    assert.equal(linhas(db, 'SELECT id FROM indicators').length, 3, 'o indicador sem número (PMS) não é gravado');
    const [desocupacao] = linhas<{ value: number; period: string; previous: number }>(db, "SELECT value, period, previous FROM indicators WHERE id = 'ibge.desocupacao'");
    assert.deepEqual(desocupacao, { value: 4.5, period: '11/2025', previous: 4.2 });
    const docs = linhas<{ title: string; published_at: string | null }>(db, "SELECT title, published_at FROM documents WHERE source = 'ibge' ORDER BY url");
    assert.deepEqual(docs.map(d => d.title), ['IBGE divulga a PNAD', 'Sem data válida'], 'notícia sem link ou sem título é ignorada');
    assert.equal(docs[0].published_at, '2026-11-13T12:00:00.000Z'); assert.equal(docs[1].published_at, null, 'data inválida não derruba o lote');
    assert.equal(resultado.changed, 3 + 2);
  });
});
test('ibge: a mesma notícia de novo não conta como alteração, e o campo de notícias ausente falha com mensagem clara', async () => {
  await comBanco(async db => {
    const rotas = rotasIbge({ totalPages: 1, items: [noticia()] });
    const primeira = await coletar(ibge, db, rotas); const segunda = await coletar(ibge, db, rotas);
    assert.equal(primeira.resultado.changed, 4 + 1); assert.equal(segunda.resultado.changed, 4, 'só os indicadores são regravados; a notícia idêntica não');
    assert.match((await falha(ibge, db, rotasIbge({ totalPages: 1 })))?.message ?? '', /Resposta inesperada de servicodados\.ibge\.gov\.br\/noticias/);
  });
});

// ---------------------------------------------------------------- Câmara
const proposicao = (id: number, extra: object = {}) => ({ dados: { id, siglaTipo: 'PL', numero: 860 + id, ano: 2023, ementa: `Altera a Lei 6.019 (${id}) sobre terceirização`, dataApresentacao: '2023-03-03T00:00', keywords: 'terceirização',
  statusProposicao: { dataHora: '2026-10-01T10:30', siglaOrgao: 'PLEN', descricaoSituacao: 'Aguardando', descricaoTramitacao: 'Apresentação', despacho: '' }, ...extra } });
const rotasCamara = (lista: unknown, detalhe: (id: number) => unknown = id => proposicao(id)): Rota[] => [
  [/\/proposicoes\?keywords=/, { json: lista }], [/\/proposicoes\/(\d+)$/, url => ({ json: detalhe(Number(url.pathname.split('/').pop())) })],
];
test('camara: lista por palavra-chave, baixa cada proposição uma vez e guarda situação e data do último andamento', async () => {
  await comBanco(async db => {
    const { resultado, chamadas } = await coletar(camara, db, rotasCamara({ dados: [{ id: 1 }, { id: 2 }] }));
    assert.equal(chamadas.filter(c => c.includes('keywords=')).length, 6, 'uma consulta por palavra-chave'); assert.equal(chamadas.filter(c => /\/proposicoes\/\d+$/.test(c)).length, 2, 'cada proposição, uma vez, mesmo citada em todas as palavras');
    assert.equal(resultado.changed, 2);
    const docs = linhas<{ title: string; meta: string; published_at: string }>(db, "SELECT title, meta, published_at FROM documents WHERE source = 'camara' ORDER BY title");
    assert.deepEqual(docs.map(d => d.title), ['PL 861/2023', 'PL 862/2023']);
    assert.deepEqual(JSON.parse(docs[0].meta), { movedAt: '2026-10-01T13:30:00.000Z', situacao: 'Aguardando' }, 'o horário é de Brasília (-03:00)'); assert.equal(docs[0].published_at, '2023-03-03T03:00:00.000Z', 'a data sem fuso é de Brasília, em qualquer computador');
    const segunda = await coletar(camara, db, rotasCamara({ dados: [{ id: 1 }, { id: 2 }] })); assert.equal(segunda.resultado.changed, 0, 'sem mudança, nenhum documento alterado');
  });
});
test('camara: data inválida na proposição não derruba o lote; lista fora do formato falha com mensagem clara', async () => {
  await comBanco(async db => {
    const { resultado } = await coletar(camara, db, rotasCamara({ dados: [{ id: 7 }] }, id => proposicao(id, { dataApresentacao: 'ontem', statusProposicao: { dataHora: 'lixo', siglaOrgao: 'PLEN', descricaoSituacao: 'Arquivada', descricaoTramitacao: 'x', despacho: '' } })));
    assert.equal(resultado.changed, 1); const [doc] = linhas<{ published_at: string | null; meta: string }>(db, "SELECT published_at, meta FROM documents WHERE source = 'camara'");
    assert.equal(doc.published_at, null); assert.equal(JSON.parse(doc.meta).movedAt, undefined);
    assert.match((await falha(camara, db, rotasCamara({ dados: 'não é lista' })))?.message ?? '', /Resposta inesperada de dadosabertos\.camara\.leg\.br/);
    assert.match((await falha(camara, db, [[/\/proposicoes\?keywords=/, { texto: 'manutenção', status: 503 }]]))?.message ?? '', /HTTP 503/);
  });
});

// ---------------------------------------------------------------- Senado
const processo = (id: number, extra: object = {}) => ({ id, identificacao: `PL ${id}/2024`, ementa: 'Dispõe sobre terceirização', autoria: 'Senador X', situacaoAtual: 'Em tramitação', dataApresentacao: '2024-05-02', dataSituacaoAtual: '2026-09-15', tramitando: 'Sim', tipoDocumento: 'Projeto de Lei', ...extra });
test('senado: grava os processos de todas as palavras sem duplicar, e a segunda coleta sem mudança não altera nada', async () => {
  await comBanco(async db => {
    const rotas: Rota[] = [['https://legis.senado.leg.br/dadosabertos/processo?termo=', { json: [processo(10), processo(11)] }]];
    const primeira = await coletar(senado, db, rotas);
    assert.deepEqual(primeira.resultado, { fetched: 6, changed: 2 }); assert.equal(linhas(db, "SELECT 1 FROM documents WHERE source = 'senado'").length, 2);
    const [doc] = linhas<{ content: string; meta: string }>(db, "SELECT content, meta FROM documents WHERE source = 'senado' AND title = 'PL 10/2024'");
    assert.match(doc.content, /Situação: Em tramitação \(desde 2026-09-15\)\. Tramitando: Sim\./); assert.equal(JSON.parse(doc.meta).movedAt, '2026-09-15T12:00:00.000Z');
    assert.equal((await coletar(senado, db, rotas)).resultado.changed, 0);
    const mudou = await coletar(senado, db, [['https://legis.senado.leg.br/', { json: [processo(10, { situacaoAtual: 'Aprovado' })] }]]); assert.equal(mudou.resultado.changed, 1, 'o processo que mudou de situação é atualizado');
  });
});
test('senado: resposta que não é lista (a API devolve objeto quando não há resultado) é ignorada sem erro; erro HTTP falha', async () => {
  await comBanco(async db => {
    const { resultado } = await coletar(senado, db, [['https://legis.senado.leg.br/', { json: { mensagem: 'nenhum processo encontrado' } }]]);
    assert.deepEqual(resultado, { fetched: 6, changed: 0 });
    assert.match((await falha(senado, db, [['https://legis.senado.leg.br/', { texto: 'x', status: 500 }]]))?.message ?? '', /HTTP 500/);
  });
});

// ---------------------------------------------------------------- TST
const textoLongo = 'O Tribunal Superior do Trabalho decidiu que a terceirização de atividade-fim é lícita nos termos do entendimento do Supremo. '.repeat(3);
const paginaTst = (titulo: string, corpo: string) => ({ texto: `<html><head><meta property="og:title" content="${titulo}"></head><body><nav>menu</nav><span class="date-info">13/11/2026</span><div class="news-body"><p>${corpo}</p></div></body></html>` });
test('tst: lê o índice de notícias, baixa só as páginas novas e descarta as que têm pouco texto', async () => {
  await comBanco(async db => {
    const indice = { texto: '<html><body><a href="/-/decisao-um">1</a><a href="/-/decisao-dois">2</a><a href="/-/curta">3</a><a href="/outra/pagina">x</a><a href="https://externo.example/-/x">y</a></body></html>' };
    const rotas: Rota[] = [['https://www.tst.jus.br/noticias', indice], ['https://www.tst.jus.br/-/decisao-um', paginaTst('Decisão sobre terceirização - TST', textoLongo)], ['https://www.tst.jus.br/-/decisao-dois', paginaTst('Outra decisão - TST', textoLongo)], ['https://www.tst.jus.br/-/curta', paginaTst('Nota curta', 'Pouco texto.')]];
    const primeira = await coletar(tst, db, rotas);
    assert.deepEqual(primeira.resultado, { fetched: 4, changed: 2 }); assert.deepEqual(primeira.chamadas.filter(c => !c.endsWith('/noticias')).sort(), ['https://www.tst.jus.br/-/curta', 'https://www.tst.jus.br/-/decisao-dois', 'https://www.tst.jus.br/-/decisao-um']);
    const docs = linhas<{ title: string; published_at: string }>(db, "SELECT title, published_at FROM documents WHERE source = 'tst' ORDER BY title");
    assert.deepEqual(docs.map(d => d.title), ['Decisão sobre terceirização', 'Outra decisão'].sort(), 'o sufixo " - TST" sai do título'); assert.equal(docs[0].published_at, '2026-11-13T12:00:00.000Z');
    const segunda = await coletar(tst, db, rotas); assert.equal(segunda.chamadas.length, 2, 'índice e a página curta (nunca guardada); as duas já guardadas não são baixadas de novo'); assert.equal(segunda.resultado.changed, 0);
  });
});
test('tst: índice sem notícias, índice fora do ar e página de notícia fora do ar', async () => {
  await comBanco(async db => {
    assert.deepEqual((await coletar(tst, db, [['https://www.tst.jus.br/noticias', { texto: '<html><body>sem links</body></html>' }]])).resultado, { fetched: 1, changed: 0 });
    assert.match((await falha(tst, db, [['https://www.tst.jus.br/noticias', { texto: 'x', status: 502 }]]))?.message ?? '', /HTTP 502 em www\.tst\.jus\.br/);
    assert.match((await falha(tst, db, [['https://www.tst.jus.br/noticias', { texto: '<a href="/-/x">x</a>' }], ['https://www.tst.jus.br/-/x', { texto: 'x', status: 500 }]]))?.message ?? '', /HTTP 500/);
  });
});

// ---------------------------------------------------------------- WEC
const sitemap = (...entradas: [string, string][]) => ({ texto: `<?xml version="1.0"?><urlset>${entradas.map(([u, d]) => `<url><loc>${u}</loc><lastmod>${d}</lastmod></url>`).join('')}</urlset>`, tipo: 'application/xml' });
const artigoWec = (titulo: string) => ({ texto: `<html><head><meta property="og:title" content="World Employment Confederation - ${titulo}"><meta property="article:published_time" content="2026-11-02T09:00:00Z"></head><body><article><p>${textoLongo}</p></article></body></html>` });
test('wec: um sitemap por tipo, baixa as páginas novas, tira o prefixo do título e usa a data do artigo', async () => {
  await comBanco(async db => {
    const rotas: Rota[] = [['https://wecglobal.org/news-sitemap.xml', sitemap(['https://wecglobal.org/news/a', '2026-11-03'], ['https://wecglobal.org/news/b', '2026-10-01'])], [/-sitemap\.xml$/, sitemap()],
      ['https://wecglobal.org/news/a', artigoWec('Agency work in 2026')], ['https://wecglobal.org/news/b', artigoWec('Another story')]];
    const primeira = await coletar(wec, db, rotas);
    assert.deepEqual(primeira.resultado, { fetched: 5 + 2, changed: 2 });
    const docs = linhas<{ title: string; published_at: string }>(db, "SELECT title, published_at FROM documents WHERE source = 'wec' ORDER BY title");
    assert.deepEqual(docs.map(d => d.title), ['Agency work in 2026', 'Another story']); assert.equal(docs[0].published_at, '2026-11-02T09:00:00.000Z');
    const segunda = await coletar(wec, db, rotas); assert.equal(segunda.chamadas.filter(c => !c.endsWith('-sitemap.xml')).length, 0, 'páginas já guardadas e sem lastmod novo não são baixadas');
    const alterada = await coletar(wec, db, [['https://wecglobal.org/news-sitemap.xml', sitemap(['https://wecglobal.org/news/a', '2099-01-01'])], [/-sitemap\.xml$/, sitemap()], ['https://wecglobal.org/news/a', artigoWec('Agency work in 2026')]]);
    assert.equal(alterada.chamadas.filter(c => c.endsWith('/news/a')).length, 1, 'lastmod mais novo que a coleta: baixa de novo');
  });
});
test('wec: sitemap vazio ou malformado não grava nada; página curta é descartada; erro HTTP falha com o host', async () => {
  await comBanco(async db => {
    assert.deepEqual((await coletar(wec, db, [[/-sitemap\.xml$/, { texto: '<html>não é xml</html>' }]])).resultado, { fetched: 5, changed: 0 });
    const curta = await coletar(wec, db, [['https://wecglobal.org/news-sitemap.xml', sitemap(['https://wecglobal.org/news/c', '2026-11-03'])], [/-sitemap\.xml$/, sitemap()], ['https://wecglobal.org/news/c', { texto: '<html><body><p>Curta.</p></body></html>' }]]);
    assert.equal(curta.resultado.changed, 0);
    assert.match((await falha(wec, db, [[/-sitemap\.xml$/, { texto: 'x', status: 500 }]]))?.message ?? '', /HTTP 500 em wecglobal\.org/);
  });
});

// ---------------------------------------------------------------- datas das fontes
test('parseDate: ano de quatro dígitos é lido inteiro (13/11/2026 já foi lido como 2020), o de dois dígitos vira 20xx e texto sem data é ignorado', () => {
  assert.equal(lerData('13/11/2026'), '2026-11-13T12:00:00.000Z'); assert.equal(lerData('Publicado em 05/01/2026 às 10:00'), '2026-01-05T12:00:00.000Z');
  assert.equal(lerData('13/11/26'), '2026-11-13T12:00:00.000Z'); assert.equal(lerData('2026-11-13T09:00:00Z'), '2026-11-13T09:00:00.000Z');
  assert.equal(lerData('31/02/2026'), '2026-03-03T12:00:00.000Z', 'data impossível rola para o mês seguinte, como o JavaScript faz; não é erro'); assert.equal(lerData('sem data'), undefined); assert.equal(lerData(undefined), undefined);
});
