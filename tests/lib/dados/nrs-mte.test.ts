import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { comBanco, simularRede } from '../../apoio/rede-simulada';
import { pdfComTexto } from '../../apoio/pdf-simulado';
import { coletarNR, dividirNR, nrs, rotuloDaNR } from '@/lib/dados/coletores/nrs';
import { NRS, pdfDaNR, urlDoPortalDoTrabalho, type NRColetada } from '@/lib/dados/nrs-lista';
import { abrirBanco, gravarDocumento, type BancoDeDados } from '@/lib/dados/db';
import { trechosDeNR } from '@/lib/recuperacao/leis';
import { trechosDeDocumentos } from '@/lib/recuperacao/documentos';
import { estanteDoDocumento, estantePorId } from '@/lib/biblioteca/estantes';
import { fiscalizarFontes } from '@/lib/fontes/fiscalizador';
import { extrairEntidades } from '@/lib/grafo/entidades';

const trecho = readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'nrs', 'nr-06-trecho.txt'), 'utf8');
const PASTA =
  'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/';
const nr6 = NRS.find((n) => n.numero === 6)!;
const PDF6 = `${PASTA}normas-regulamentadora/normas-regulamentadoras-vigentes/nr-06-atualizada-2025-ii.pdf`;
const pagina = (...links: string[]) =>
  `<html><body>${links.map((l) => `<a href="${l}">arquivo</a>`).join('\n')}<p>Norma</p></body></html>`;
const respostaPdf = (texto: string, cabecalhos: Record<string, string> = {}) =>
  new Response(pdfComTexto(texto) as BodyInit, { headers: { 'content-type': 'application/pdf', ...cabecalhos } });
const documentos = (db: BancoDeDados) =>
  db.prepare("SELECT url, title, content, meta FROM documents WHERE source = 'nrs' ORDER BY url").all() as {
    url: string;
    title: string;
    content: string;
    meta: string;
  }[];

test('a lista curada só tem páginas https do portal do Ministério, sem duplicatas, com os títulos conferidos', () => {
  assert.equal(new Set(NRS.map((n) => n.numero)).size, NRS.length);
  assert.equal(new Set(NRS.map((n) => n.pagina)).size, NRS.length);
  for (const n of NRS) assert.ok(urlDoPortalDoTrabalho(n.pagina), n.pagina);
  // NR-2 e NR-27 são revogadas e a NR-37 não tem página no portal: não entram.
  for (const fora of [2, 27, 37]) assert.ok(!NRS.some((n) => n.numero === fora), `NR-${fora}`);
  // As que mais importam ao setor (limpeza, portaria, vigilância, SST geral) estão.
  for (const dentro of [1, 6, 7, 9, 17, 35, 38])
    assert.ok(
      NRS.some((n) => n.numero === dentro),
      `NR-${dentro}`,
    );
  assert.equal(rotuloDaNR(1), 'NR-01');
  assert.equal(rotuloDaNR(35), 'NR-35');
});

test('urlDoPortalDoTrabalho recusa outro domínio, http, credenciais, porta, IP, outro órgão e parâmetros', () => {
  for (const ruim of [
    'http://www.gov.br/trabalho-e-emprego/pt-br/x/nr-06.pdf',
    'https://www.gov.br.evil.example/trabalho-e-emprego/pt-br/x/nr-06.pdf',
    'https://evil.example/trabalho-e-emprego/pt-br/x/nr-06.pdf',
    'https://www.gov.br@evil.example/trabalho-e-emprego/pt-br/x/nr-06.pdf',
    'https://user:senha@www.gov.br/trabalho-e-emprego/pt-br/x/nr-06.pdf',
    'https://www.gov.br:8443/trabalho-e-emprego/pt-br/x/nr-06.pdf',
    'https://127.0.0.1/trabalho-e-emprego/pt-br/x/nr-06.pdf',
    'https://www.gov.br/outro-orgao/pt-br/x/nr-06.pdf',
    'https://www.gov.br/trabalho-e-emprego/pt-br/x/nr-06.pdf?redirect=https://evil.example',
    'file:///etc/passwd',
    'não é url',
  ])
    assert.equal(urlDoPortalDoTrabalho(ruim), false, ruim);
});

test('pdfDaNR escolhe o texto atual da própria norma e ignora anexos, manuais, atas e links de fora', () => {
  const vigentes = `${PASTA}normas-regulamentadora/normas-regulamentadoras-vigentes/`;
  const arquivos = `${PASTA}arquivos/normas-regulamentadoras/`;
  assert.equal(
    pdfDaNR(6, [
      `${arquivos}nr-06.pdf`,
      `${arquivos}nr-06_manual_de_orientacao_para_especificacao_das_vestimentas.pdf`,
      `${vigentes}nr-06-atualizada-2025-i.pdf`,
      `${vigentes}nr-06-atualizada-2025-ii.pdf`,
      `${arquivos}atas-ctpp/28_reuniao_ordinaria.pdf`,
      'https://evil.example/trabalho-e-emprego/pt-br/nr-06-atualizada-2030.pdf',
      `http://www.gov.br/trabalho-e-emprego/pt-br/nr-06-atualizada-2031.pdf`,
    ]),
    `${vigentes}nr-06-atualizada-2025-ii.pdf`,
  );
  // O ano mais recente vence, mesmo que a versão antiga esteja na pasta "vigentes".
  assert.equal(
    pdfDaNR(28, [`${vigentes}nr-28-atualizada-2023.pdf`, `${vigentes}nr-28-atualizada-2026.pdf`]),
    `${vigentes}nr-28-atualizada-2026.pdf`,
  );
  // Nome sem hífen ("NR38atualizada2026.pdf") e anexo da NR-15 ("nr-15-anexo-01.pdf").
  assert.equal(pdfDaNR(38, [`${vigentes}NR38atualizada2026.pdf`]), `${vigentes}NR38atualizada2026.pdf`);
  assert.equal(pdfDaNR(15, [`${arquivos}nr-15-anexo-01.pdf`, `${arquivos}nr-15-anexo-02.pdf`]), undefined);
  // NR-1 não pega o arquivo da NR-10, 11... nem o contrário.
  assert.equal(
    pdfDaNR(1, [`${vigentes}nr-10-atualizada-2026-1.pdf`, `${vigentes}nr-11-atualizada-2016.pdf`]),
    undefined,
  );
  assert.equal(pdfDaNR(6, []), undefined);
});

test('dividirNR: uma seção por item de segundo nível, cabeçalho e sumário fora, ruído de página fora, anexo à parte', () => {
  const secoes = dividirNR(trecho, 6);
  assert.deepEqual(
    secoes.map((s) => s.key),
    ['6.1', '6.2', '6.3', '6.4', '6.5', 'anexo-i'].filter((k) => secoes.some((s) => s.key === k)),
  );
  assert.equal(secoes[0].key, '6.1');
  assert.equal(secoes[0].label, '6.1 Objetivo');
  // A frase partida pela quebra de página volta inteira, sem o ruído do PDF no meio.
  assert.match(secoes[0].content, /utilização de Equipamentos de Proteção Individual - EPI\./);
  for (const s of secoes) assert.doesNotMatch(s.content, /Este texto não substitui|-- \d+ of \d+ --/);
  // A tabela de portarias e o sumário do cabeçalho não viram documento.
  assert.ok(!secoes.some((s) => /Portaria SSMT|Alterações\/Atualizações/.test(s.content)));
  const anexo = secoes.find((s) => s.key === 'anexo-i')!;
  assert.match(anexo.content, /capacete para proteção contra impactos/);
  assert.match(anexo.label, /^ANEXO I/);
});

test('dividirNR: item revogado sai, texto vigente fica; seção grande é partida em itens; texto sem itens vira erro', () => {
  const corpo = [
    'NR 06 - TESTE',
    '6.1 Objetivo',
    '6.1.1 Texto vigente do objetivo.',
    '6.1.2 (Revogado pela Portaria MTE nº 1, de 2020)',
    '6.1.3 Outro texto vigente.',
    '6.2 Campo de aplicação',
    ...Array.from({ length: 12 }, (_, i) => `6.2.${i + 1} ${'Item longo da norma '.repeat(40)}${i}.`),
  ].join('\n');
  const secoes = dividirNR(corpo, 6);
  assert.equal(secoes[0].content.includes('Revogado'), false);
  assert.match(secoes[0].content, /6\.1\.3 Outro texto vigente/);
  const campo = secoes.filter((s) => s.label.startsWith('6.2') || s.key.startsWith('6.2'));
  assert.ok(campo.length > 1, 'seção de 12 itens longos vira mais de um documento');
  assert.ok(campo.every((s) => s.content.length <= 12_000));
  assert.equal(new Set(secoes.map((s) => s.key)).size, secoes.length, 'chaves únicas');
  assert.throws(
    () => dividirNR('NR 06 - TESTE\nsó texto solto sem itens numerados', 6),
    /início do texto não encontrado/,
  );
});

test('dividirNR: PDF de outra norma é recusado pelo cabeçalho', () => {
  assert.throws(() => dividirNR(trecho, 7), /cabeçalho de outra norma/);
  assert.throws(() => dividirNR(trecho, 16), /cabeçalho de outra norma/);
  assert.doesNotThrow(() => dividirNR(trecho, 6));
});

test('coleta uma NR: página, PDF, um documento por seção, título no padrão, meta e URL do PDF com a seção', async () => {
  await comBanco(async (db) => {
    const rede = simularRede([
      [nr6.pagina, { texto: pagina(`${PASTA}arquivos/normas-regulamentadoras/nr-06.pdf`, PDF6) }],
      [PDF6, () => respostaPdf(trecho, { 'last-modified': 'Tue, 01 Jul 2025 12:00:00 GMT' })],
    ]);
    try {
      const r = await coletarNR(db, nr6);
      assert.equal(r.fetched, 2);
      assert.ok(r.changed >= 5);
      const docs = documentos(db);
      const objetivo = docs.find((d) => d.url === `${PDF6}#6.1`)!;
      assert.equal(objetivo.title, 'NR-06 — Equipamentos de proteção individual - EPI — 6.1 Objetivo');
      assert.deepEqual(JSON.parse(objetivo.meta), { nr: 6, norma: 'NR-06', pdf: PDF6, secao: '6.1' });
      assert.match(objetivo.content, /Equipamentos de Proteção Individual/);
      assert.ok(docs.every((d) => d.url.startsWith(`${PDF6}#`)));
      // Só o PDF da própria norma foi baixado.
      assert.ok(rede.chamadas.includes(PDF6));
      assert.ok(!rede.chamadas.includes(`${PASTA}arquivos/normas-regulamentadoras/nr-06.pdf`));
    } finally {
      rede.restaurar();
    }
  });
});

test('verificação diária: segunda rodada no mesmo dia não pede nada; depois de um dia envia If-Modified-Since e 304 não altera', async () => {
  await comBanco(async (db) => {
    const rede = simularRede([
      [nr6.pagina, { texto: pagina(PDF6) }],
      [PDF6, () => respostaPdf(trecho, { 'last-modified': 'Tue, 01 Jul 2025 12:00:00 GMT' })],
    ]);
    const original = globalThis.fetch;
    try {
      assert.ok((await coletarNR(db, nr6)).changed > 0);
      const antes = documentos(db).length;
      assert.deepEqual(await coletarNR(db, nr6), { fetched: 0, changed: 0 });
      assert.equal(rede.chamadas.length, 2);
      rede.restaurar();
      const cabecalhos: Record<string, string>[] = [];
      globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(entrada));
        if (url.pathname === '/robots.txt') return new Response('', { status: 404 });
        if (url.href === nr6.pagina) return new Response(pagina(PDF6), { headers: { 'content-type': 'text/html' } });
        cabecalhos.push(Object.fromEntries(new Headers(init?.headers).entries()));
        return new Response(null, { status: 304 });
      }) as typeof fetch;
      db.prepare("UPDATE state SET updated_at = '2020-01-01T00:00:00.000Z' WHERE key = ?").run('nrs:6:check');
      assert.deepEqual(await coletarNR(db, nr6), { fetched: 2, changed: 0 });
      assert.equal(cabecalhos[0]['if-modified-since'], 'Tue, 01 Jul 2025 12:00:00 GMT');
      assert.equal(documentos(db).length, antes);
    } finally {
      globalThis.fetch = original;
    }
  });
});

test('versão nova do PDF (arquivo com outro nome) troca os documentos antigos pelos novos', async () => {
  await comBanco(async (db) => {
    const novo = `${PASTA}normas-regulamentadora/normas-regulamentadoras-vigentes/nr-06-atualizada-2026.pdf`;
    const antigo = simularRede([
      [nr6.pagina, { texto: pagina(PDF6) }],
      [PDF6, () => respostaPdf(trecho)],
    ]);
    try {
      await coletarNR(db, nr6);
      assert.ok(documentos(db).every((d) => d.url.startsWith(PDF6)));
    } finally {
      antigo.restaurar();
    }
    const segunda = simularRede([
      [nr6.pagina, { texto: pagina(PDF6, novo) }],
      [novo, () => respostaPdf(trecho.replace('Objetivo', 'Objetivo geral'))],
    ]);
    try {
      await coletarNR(db, nr6, true);
      const docs = documentos(db);
      assert.ok(docs.length > 0 && docs.every((d) => d.url.startsWith(novo)), 'nada da versão antiga sobra');
    } finally {
      segunda.restaurar();
    }
  });
});

test('falha de extração não apaga o que já existe: PDF de outra norma, sem itens ou com muito menos seções', async () => {
  await comBanco(async (db) => {
    for (let i = 1; i <= 20; i++)
      gravarDocumento(db, {
        source: 'nrs',
        url: `${PDF6}#6.${i}`,
        title: `NR-06 — x — 6.${i}`,
        content: `6.${i} texto de teste do item ${i} da norma regulamentadora.`,
        meta: { nr: 6, norma: 'NR-06', pdf: PDF6, secao: `6.${i}` },
      });
    for (const texto of ['NR 07 - OUTRA NORMA\n7.1 Objetivo\n7.1.1 Texto.', 'NR 06 - SEM ITENS\nsó texto', trecho]) {
      const rede = simularRede([
        [nr6.pagina, { texto: pagina(PDF6) }],
        [PDF6, () => respostaPdf(texto)],
      ]);
      try {
        await assert.rejects(coletarNR(db, nr6, true), /Extração suspeita/);
        assert.equal(documentos(db).length, 20);
      } finally {
        rede.restaurar();
      }
    }
  });
});

test('caso hostil: PDF malformado, HTML no lugar do PDF e PDF gigante viram erro e não gravam nada', async () => {
  const casos: [string, () => Response, RegExp][] = [
    [
      'bytes soltos com cabeçalho de PDF',
      () =>
        new Response(new TextEncoder().encode('%PDF-1.4\n\u0000\u0001lixo sem estrutura'), {
          headers: { 'content-type': 'application/pdf' },
        }),
      /PDF ilegível/,
    ],
    [
      'HTML com tipo de PDF',
      () => new Response('<html>Portal em manutenção</html>', { headers: { 'content-type': 'application/pdf' } }),
      /não é um PDF/,
    ],
    [
      'HTML com tipo HTML',
      () => new Response('<html>manutenção</html>', { headers: { 'content-type': 'text/html' } }),
      /não devolveu um PDF/,
    ],
    [
      'content-length acima do limite da NR (25 MB)',
      () =>
        new Response('%PDF-', {
          headers: { 'content-type': 'application/pdf', 'content-length': String(26 * 1024 * 1024) },
        }),
      /PDF grande demais/,
    ],
    [
      'content-length acima do limite de qualquer coleta (30 MB)',
      () =>
        new Response('%PDF-', {
          headers: { 'content-type': 'application/pdf', 'content-length': String(80 * 1024 * 1024) },
        }),
      /grande demais/,
    ],
    ['erro HTTP', () => new Response('fora do ar', { status: 503 }), /HTTP 503/],
  ];
  for (const [nome, resposta, erro] of casos)
    await comBanco(async (db) => {
      const rede = simularRede([
        [nr6.pagina, { texto: pagina(PDF6) }],
        [PDF6, resposta],
      ]);
      try {
        await assert.rejects(coletarNR(db, nr6), erro, nome);
        assert.equal(documentos(db).length, 0, nome);
      } finally {
        rede.restaurar();
      }
    });
});

test('caso hostil: página sem o PDF da norma, ou só com PDF de fora do portal, é erro sem baixar nada', async () => {
  await comBanco(async (db) => {
    const rede = simularRede([
      [
        nr6.pagina,
        {
          texto: pagina(
            'https://evil.example/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/nr-06.pdf',
            'http://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/nr-06.pdf',
            `${PASTA}arquivos/normas-regulamentadoras/nr-06_manual.pdf`,
          ),
        },
      ],
    ]);
    try {
      await assert.rejects(coletarNR(db, nr6), /PDF do texto da norma não encontrado/);
      assert.deepEqual(rede.chamadas, [nr6.pagina]);
    } finally {
      rede.restaurar();
    }
  });
});

test('caso hostil: página fora do portal na lista é recusada sem chamar a rede', async () => {
  await comBanco(async (db) => {
    const rede = simularRede([]);
    try {
      for (const pagina of [
        'https://evil.example/trabalho-e-emprego/pt-br/x',
        'http://www.gov.br/trabalho-e-emprego/pt-br/x',
        'https://www.gov.br/outro-orgao/pt-br/x',
      ])
        await assert.rejects(coletarNR(db, { ...nr6, pagina }), /fora do portal/);
      assert.deepEqual(rede.chamadas, []);
    } finally {
      rede.restaurar();
    }
  });
});

test('caso hostil: redirecionamento do portal para rede interna é bloqueado, na página e no PDF', async () => {
  await comBanco(async (db) => {
    const rede = simularRede([
      [
        nr6.pagina,
        new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/trabalho-e-emprego/x' } }),
      ],
    ]);
    try {
      await assert.rejects(coletarNR(db, nr6), /interno bloqueado/);
    } finally {
      rede.restaurar();
    }
  });
  await comBanco(async (db) => {
    const rede = simularRede([
      [nr6.pagina, { texto: pagina(PDF6) }],
      [PDF6, new Response(null, { status: 302, headers: { location: 'https://localhost/nr-06.pdf' } })],
    ]);
    try {
      await assert.rejects(coletarNR(db, nr6), /interno bloqueado/);
      assert.equal(documentos(db).length, 0);
    } finally {
      rede.restaurar();
    }
  });
});

test('o coletor segue com as demais NRs quando uma falha, e relata todas as falhas no fim', async () => {
  await comBanco(async (db) => {
    const rede = simularRede([[PASTA, { texto: 'fora do ar', status: 404 }]]);
    try {
      await assert.rejects(nrs.run({ db, full: false }), (erro: Error) => {
        assert.equal(rede.chamadas.length, NRS.length);
        for (const n of NRS)
          assert.match(erro.message, new RegExp(`HTTP 404 no portal do Ministério \\(NR-${n.numero}\\)`));
        return true;
      });
    } finally {
      rede.restaurar();
    }
  });
});

test('a NR coletada é achada pela pergunta: seções que combinam, objetivo para pergunta geral, aviso quando a NR não foi coletada', async () => {
  const pasta = mkdtempSync(path.join(tmpdir(), 'sindi-nr-'));
  const arquivo = path.join(pasta, 'dados.sqlite');
  try {
    const db = abrirBanco(arquivo);
    const rede = simularRede([
      [nr6.pagina, { texto: pagina(PDF6) }],
      [PDF6, () => respostaPdf(trecho)],
    ]);
    process.env.SINDI_HTTP_PAUSA_MS = '0';
    try {
      await coletarNR(db, nr6);
    } finally {
      rede.restaurar();
      delete process.env.SINDI_HTTP_PAUSA_MS;
    }
    db.close();

    const geral = trechosDeNR('O que é a NR-6?', arquivo);
    assert.match(geral.passages[0].title, /^NR-06 — Equipamentos de proteção individual - EPI — 6\.1 Objetivo$/);
    assert.equal(geral.passages[0].url, PDF6);
    assert.ok(geral.passages.every((p) => p.pinned));

    const fabricante = trechosDeNR('Quem é considerado importador de EPI na NR-06?', arquivo);
    assert.match(fabricante.passages[0].title, /6\.2 Campo de aplicação/);
    assert.match(fabricante.passages[0].content, /importador/);

    // NR que não foi coletada: o aviso de que não vai descrever de memória.
    assert.match(trechosDeNR('O que é a NR-17?', arquivo).semResposta ?? '', /Não encontrei a NR-17/);
    // O roteador marca a estante das normas, e a fonte é oficial (domínio gov.br).
    const doc = trechosDeDocumentos('O que diz a NR-6 sobre EPI?', [], arquivo);
    assert.equal(doc.passages[0].no, 'estante:normas');
    assert.equal(fiscalizarFontes('O que diz a NR-6 sobre EPI?', doc.passages).semOficial, false);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('a estante "normas" cobre o texto coletado e o grafo liga a seção à NR pelo título', () => {
  assert.match(estantePorId('normas')?.onde ?? '', /d\.source = 'nrs'/);
  assert.equal(estanteDoDocumento({ source: 'nrs', url: `${PDF6}#6.1` }), 'normas');
  assert.ok(
    extrairEntidades('NR-06 — Equipamentos de proteção individual - EPI — 6.1 Objetivo').some((e) => e.id === 'nr:6'),
  );
});

test('NRColetada: o título de cada NR da lista não está vazio e o rótulo tem dois algarismos', () => {
  const amostra: NRColetada = NRS[0];
  assert.ok(amostra.titulo.length > 5);
  for (const n of NRS) assert.match(rotuloDaNR(n.numero), /^NR-\d{2}$/);
});
