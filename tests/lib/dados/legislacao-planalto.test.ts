import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { comBanco, simularRede } from '../../apoio/rede-simulada';
import { coletarNorma, extrairEmenta, legislacao } from '@/lib/dados/coletores/legislacao';
import { NORMAS, urlDoPlanalto, type NormaColetada } from '@/lib/dados/legislacao-lista';
import { dividirArtigos, juntarQuebras } from '@/lib/dados/legal';
import { abrirBanco, gravarDocumento, type BancoDeDados } from '@/lib/dados/db';
import { chaveDoArtigo } from '@/lib/recuperacao/termos-de-documento';
import { trechosDeLei } from '@/lib/recuperacao/leis';
import { trechosDeDocumentos } from '@/lib/recuperacao/documentos';
import { normasCitadas } from '@/lib/recuperacao/legislacao';
import { estanteDoDocumento, estantePorId } from '@/lib/biblioteca/estantes';
import { extrairEntidades } from '@/lib/grafo/entidades';

const ler = (nome: string) => readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'legislacao', nome), 'utf8');
const PLANALTO = 'https://www.planalto.gov.br/ccivil_03/';
const compilada: NormaColetada = {
  ...NORMAS[0],
  url: `${PLANALTO}leis/l6019.htm`,
  minimoDeArtigos: 3,
};
const alteradora: NormaColetada = {
  ...NORMAS[1],
  url: `${PLANALTO}_ato2015-2018/2017/lei/l13429.htm`,
  minimoDeArtigos: 3,
};
const documentos = (db: BancoDeDados) =>
  db.prepare("SELECT url, title, content, meta FROM documents WHERE source = 'legislacao' ORDER BY url").all() as {
    url: string;
    title: string;
    content: string;
    meta: string;
  }[];

test('a lista curada só tem endereços https do Planalto, sem duplicatas', () => {
  assert.equal(new Set(NORMAS.map((n) => n.url)).size, NORMAS.length);
  assert.equal(new Set(NORMAS.map((n) => n.id)).size, NORMAS.length);
  for (const n of NORMAS) assert.ok(urlDoPlanalto(n.url), n.url);
});

test('urlDoPlanalto recusa outro domínio, http, credenciais, porta, IP e caminho fora de /ccivil_03/', () => {
  for (const ruim of [
    'http://www.planalto.gov.br/ccivil_03/leis/l6019.htm',
    'https://planalto.gov.br.evil.example/ccivil_03/leis/l6019.htm',
    'https://evil.example/ccivil_03/leis/l6019.htm',
    'https://www.planalto.gov.br@evil.example/ccivil_03/leis/l6019.htm',
    'https://user:senha@www.planalto.gov.br/ccivil_03/leis/l6019.htm',
    'https://www.planalto.gov.br:8443/ccivil_03/leis/l6019.htm',
    'https://127.0.0.1/ccivil_03/leis/l6019.htm',
    'https://www.planalto.gov.br/outra/pasta/l6019.htm',
    'https://www.planalto.gov.br/ccivil_03/leis/arquivo.pdf',
    'file:///etc/passwd',
    'não é url',
  ])
    assert.equal(urlDoPlanalto(ruim), false, ruim);
});

test('"Art. 5º - O texto" não vira o artigo 5-O, mas "Art. 5º-A" continua sendo o 5-A', () => {
  const artigos = dividirArtigos(
    [
      'Art. 5º - O funcionamento da empresa dependerá de registro.',
      'Art. 5º-A. Contratante é a pessoa que celebra contrato.',
    ].join('\n'),
  );
  assert.deepEqual(
    artigos.map((a) => a.key),
    ['5', '5-A'],
  );
});

test('modo sequencial: artigos citados no corpo de uma lei alteradora não abrem artigo novo', () => {
  const texto = [
    'Art. 1º A Lei passa a vigorar com as alterações:',
    'Art. 4º-A. Empresa prestadora de serviços a terceiros é a pessoa jurídica.',
    'Art. 11. O contrato de trabalho temporário não poderá exceder cento e oitenta dias.',
    'Art. 2º Esta Lei entra em vigor na data de sua publicação.',
    'Art. 2º Texto repetido que não deve abrir outro artigo 2.',
  ].join('\n');
  const artigos = dividirArtigos(texto, { sequencial: true });
  assert.deepEqual(
    artigos.map((a) => a.key),
    ['1', '2'],
  );
  assert.match(artigos[0].content, /Art\. 4º-A[\s\S]*Art\. 11\./);
});

test('juntarQuebras cola a frase quebrada pelo HTML sem mexer nas alíneas', () => {
  assert.equal(
    juntarQuebras('Art. 2º - Trabalho temporário é aquele\nprestado por pessoa física\na) alínea\n§\n1º - texto'),
    'Art. 2º - Trabalho temporário é aquele prestado por pessoa física\na) alínea\n§ 1º - texto',
  );
});

test('extrairEmenta pega o que a norma diz de si e para antes do preâmbulo', () => {
  assert.equal(
    extrairEmenta([
      'LEI Nº 1',
      'Texto compilado',
      'Dispõe sobre o Trabalho',
      'Temporário nas Empresas.',
      'O',
      'PRESIDENTE',
    ]),
    'Dispõe sobre o Trabalho Temporário nas Empresas.',
  );
  assert.equal(extrairEmenta(['sem ementa', 'nada']), undefined);
});

test('coleta o texto compilado: um documento por artigo, ementa, meta da lei e título com o número', async () => {
  await comBanco(async (db) => {
    const rede = simularRede([[compilada.url, { texto: ler('lei-compilada-exemplo.htm') }]]);
    try {
      const r = await coletarNorma(db, compilada);
      assert.equal(r.fetched, 1);
      const docs = documentos(db);
      assert.deepEqual(
        docs.map((d) => d.url.split('#')[1]),
        ['1', '2', '20', '4-A', '5', '5-A', 'ementa'].sort(),
      );
      const ementa = docs.find((d) => d.url.endsWith('#ementa'))!;
      assert.equal(ementa.title, 'Lei 6.019/1974 — Ementa');
      assert.match(ementa.content, /Dispõe sobre o Trabalho Temporário nas Empresas Urbanas/);
      const art5a = docs.find((d) => d.url.endsWith('#5-A'))!;
      assert.equal(art5a.title, 'Lei 6.019/1974 — Art. 5º-A');
      assert.deepEqual(JSON.parse(art5a.meta), { lei: '6019-1974', norma: 'Lei 6.019/1974' });
      assert.match(art5a.content, /celebra contrato com empresa de prestação de serviços determinados e específicos/);
      assert.match(art5a.content, /\(Redação dada pela Lei nº 13\.467, de 2017\)/);
      assert.ok(docs.every((d) => d.url.startsWith(`${compilada.url}#`)));
    } finally {
      rede.restaurar();
    }
  });
});

test('verificação diária condicional: segunda rodada no mesmo dia não pede nada; depois de um dia envia If-Modified-Since e 304 não altera', async () => {
  await comBanco(async (db) => {
    const cabecalhos: Record<string, string>[] = [];
    const original = globalThis.fetch;
    const rede = simularRede([
      [
        compilada.url,
        new Response(ler('lei-compilada-exemplo.htm'), {
          headers: { 'content-type': 'text/html; charset=utf-8', 'last-modified': 'Thu, 23 Apr 2026 23:00:40 GMT' },
        }),
      ],
    ]);
    try {
      assert.equal((await coletarNorma(db, compilada)).changed > 0, true);
      assert.deepEqual(await coletarNorma(db, compilada), { fetched: 0, changed: 0 });
      assert.equal(rede.chamadas.length, 1);
      rede.restaurar();
      globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(entrada));
        if (url.pathname === '/robots.txt') return new Response('', { status: 404 });
        cabecalhos.push(Object.fromEntries(new Headers(init?.headers).entries()));
        return new Response(null, { status: 304 });
      }) as typeof fetch;
      const antes = documentos(db).length;
      // `full` ignora o intervalo de um dia, mas então não envia o cabeçalho condicional; a data guardada só vale na verificação diária.
      db.prepare("UPDATE state SET updated_at = '2020-01-01T00:00:00.000Z' WHERE key = ?").run(
        'legislacao:6019-1974:check',
      );
      assert.deepEqual(await coletarNorma(db, compilada), { fetched: 1, changed: 0 });
      assert.equal(cabecalhos[0]['if-modified-since'], 'Thu, 23 Apr 2026 23:00:40 GMT');
      assert.equal(documentos(db).length, antes);
    } finally {
      globalThis.fetch = original;
    }
  });
});

test('lei alteradora: o artigo 1 leva o corpo inteiro, com os artigos citados dentro dele', async () => {
  await comBanco(async (db) => {
    const rede = simularRede([[alteradora.url, { texto: ler('lei-alteradora-exemplo.htm') }]]);
    try {
      await coletarNorma(db, alteradora);
      const docs = documentos(db);
      assert.deepEqual(
        docs.map((d) => d.url.split('#')[1]),
        ['1', '2', '3', 'ementa'],
      );
      assert.match(docs.find((d) => d.url.endsWith('#1'))!.content, /Art\. 11\.[\s\S]*Art\. 4º-A/);
      assert.match(docs.find((d) => d.url.endsWith('#ementa'))!.content, /Altera dispositivos da Lei n ?o 6\.019/);
    } finally {
      rede.restaurar();
    }
  });
});

test('artigo que some da página é apagado; mas uma extração muito menor que a anterior é recusada e nada é apagado', async () => {
  await comBanco(async (db) => {
    // Banco já com 20 artigos desta norma: uma página com 3 artigos é suspeita (pode ser a página de manutenção do portal).
    for (let i = 1; i <= 20; i++)
      gravarDocumento(db, {
        source: 'legislacao',
        url: `${compilada.url}#${i}`,
        title: `Lei 6.019/1974 — Art. ${i}`,
        content: `Art. ${i} texto de teste do artigo ${i} da lei.`,
      });
    const rede = simularRede([[compilada.url, { texto: ler('lei-compilada-exemplo.htm') }]]);
    try {
      await assert.rejects(coletarNorma(db, compilada, true), /Extração suspeita.*havia 20/);
      assert.equal(documentos(db).length, 20);
    } finally {
      rede.restaurar();
    }
  });
});

test('caso hostil: HTML malformado ou sem artigos vira erro e não grava nada', async () => {
  for (const corpo of [
    '<html><body><p>Art. 1º <b><i></p><div><<<>>>',
    '<html><head><title>Manutenção</title></head><body>Portal em manutenção</body></html>',
    '',
    '\u0000\u0001\u0002'.repeat(50),
  ])
    await comBanco(async (db) => {
      const rede = simularRede([[compilada.url, { texto: corpo }]]);
      try {
        await assert.rejects(coletarNorma(db, compilada), /Extração suspeita/);
        assert.equal(documentos(db).length, 0);
      } finally {
        rede.restaurar();
      }
    });
});

test('caso hostil: página gigante é recusada antes de ser decodificada', async () => {
  await comBanco(async (db) => {
    const rede = simularRede([[compilada.url, { texto: 'Art. 1º x\n'.repeat(1_400_000) }]]);
    try {
      await assert.rejects(coletarNorma(db, compilada), /grande demais/);
      assert.equal(documentos(db).length, 0);
    } finally {
      rede.restaurar();
    }
  });
});

test('caso hostil: endereço fora do Planalto na lista é recusado sem chamar a rede', async () => {
  await comBanco(async (db) => {
    const rede = simularRede([]);
    try {
      for (const url of [
        'https://evil.example/ccivil_03/leis/l6019.htm',
        'http://www.planalto.gov.br/ccivil_03/leis/l6019.htm',
      ])
        await assert.rejects(coletarNorma(db, { ...compilada, url }), /fora do Planalto/);
      assert.deepEqual(rede.chamadas, []);
    } finally {
      rede.restaurar();
    }
  });
});

test('caso hostil: redirecionamento do Planalto para rede interna é bloqueado', async () => {
  await comBanco(async (db) => {
    const rede = simularRede([
      [compilada.url, new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/ccivil_03/x.htm' } })],
    ]);
    try {
      await assert.rejects(coletarNorma(db, compilada), /interno bloqueado/);
    } finally {
      rede.restaurar();
    }
  });
});

test('caso hostil: redirecionamento do Planalto para outro host público é recusado (senão a lei de outro site passaria por oficial)', async () => {
  await comBanco(async (db) => {
    const rede = simularRede([
      [
        compilada.url,
        new Response(null, { status: 302, headers: { location: 'https://exemplo-falso.com.br/l6019.htm' } }),
      ],
      ['https://exemplo-falso.com.br/l6019.htm', { texto: '<html>Art. 1º falso</html>' }],
    ]);
    try {
      await assert.rejects(coletarNorma(db, compilada), /outro host recusado/);
      assert.ok(
        !rede.chamadas.some((c) => String(c).includes('exemplo-falso')),
        'o conteúdo do outro host nem é baixado',
      );
    } finally {
      rede.restaurar();
    }
  });
});

test('o coletor segue com as demais normas quando uma falha, e relata todas as falhas no fim', async () => {
  await comBanco(async (db) => {
    const rede = simularRede([[PLANALTO, { texto: 'fora do ar', status: 404 }]]);
    try {
      await assert.rejects(legislacao.run({ db, full: false }), (erro: Error) => {
        assert.equal(rede.chamadas.length, NORMAS.length);
        for (const n of NORMAS) assert.match(erro.message, new RegExp(`HTTP 404 no Planalto \\(${n.id}\\)`));
        return true;
      });
    } finally {
      rede.restaurar();
    }
  });
});

test('o artigo é lido da pergunta: "5º-A" é 5-A, "7º a lei" é 7, "art. 59 da CLT" é 59', () => {
  assert.equal(chaveDoArtigo('O que diz o art. 5º-A da Lei 6.019?'), '5-A');
  assert.equal(chaveDoArtigo('art. 4-A da Lei 6.019'), '4-A');
  assert.equal(chaveDoArtigo('Qual o art. 7º a lei trata?'), '7');
  assert.equal(chaveDoArtigo('art. 59 da CLT'), '59');
  assert.equal(chaveDoArtigo('O que a Lei 6.019 diz?'), undefined);
});

test('a pergunta é ligada à norma certa; "trabalho temporário" sem a palavra lei não vira consulta de lei', () => {
  const ids = (p: string) => normasCitadas(p).map((n) => n.id);
  assert.deepEqual(ids('Qual a lei do trabalho temporário?'), ['6019-1974']);
  assert.deepEqual(ids('art. 5º-A da Lei 6.019/74'), ['6019-1974']);
  assert.deepEqual(ids('Lei nº 6.019, de 1974'), ['6019-1974']);
  assert.deepEqual(ids('Qual lei alterou a Lei 6.019/74?'), ['6019-1974']);
  assert.deepEqual(ids('O que mudou com a reforma trabalhista?'), ['13467-2017']);
  assert.deepEqual(ids('art. 59 da CLT'), ['5452-1943']);
  assert.deepEqual(ids('O que diz a Emenda Constitucional 141?'), ['ec141-2026']);
  assert.deepEqual(ids('Qual é a lei da terceirização?'), ['13429-2017']);
  assert.deepEqual(ids('Como funciona o contrato de trabalho temporário?'), []);
  assert.deepEqual(ids('Qual o piso da portaria?'), []);
});

test('a busca acha o artigo, a ementa e quem alterou a lei, só no texto oficial coletado', async () => {
  const pasta = mkdtempSync(path.join(tmpdir(), 'sindi-leg-'));
  const arquivo = path.join(pasta, 'dados.sqlite');
  try {
    const db = abrirBanco(arquivo);
    const rede = simularRede([
      [compilada.url, { texto: ler('lei-compilada-exemplo.htm') }],
      [alteradora.url, { texto: ler('lei-alteradora-exemplo.htm') }],
    ]);
    process.env.SINDI_HTTP_PAUSA_MS = '0';
    try {
      // Os dois textos entram sob os endereços reais da lista, que é o que a busca procura.
      await coletarNorma(db, { ...NORMAS[0], minimoDeArtigos: 3 });
      await coletarNorma(db, { ...NORMAS[1], minimoDeArtigos: 3 });
    } finally {
      rede.restaurar();
      delete process.env.SINDI_HTTP_PAUSA_MS;
    }
    gravarDocumento(db, {
      source: 'constituicao',
      url: 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm#7',
      title: 'Constituição Federal — Art. 7º',
      content: 'Art. 7º São direitos dos trabalhadores urbanos e rurais: ...',
    });
    db.close();

    const artigo = trechosDeLei('Qual o art. 5º-A da Lei 6.019?', [], arquivo);
    assert.equal(artigo.passages.length, 1);
    assert.equal(artigo.passages[0].title, 'Lei 6.019/1974 — Art. 5º-A');
    assert.equal(artigo.passages[0].url, NORMAS[0].url);
    assert.match(artigo.passages[0].content, /Contratante é a pessoa física ou jurídica/);

    // Não confunde o artigo 5 com o 5-A.
    assert.match(
      trechosDeLei('art. 5 da Lei 6.019', [], arquivo).passages[0].content,
      /registro no Ministério do Trabalho/,
    );
    assert.match(trechosDeLei('art. 99 da Lei 6.019', [], arquivo).semResposta ?? '', /Não encontrei esse artigo/);

    const qual = trechosDeLei('Qual a lei do trabalho temporário?', ['trabalho', 'temporario'], arquivo);
    assert.match(qual.passages[0].content, /Lei 6\.019\/1974\. Dispõe sobre o Trabalho Temporário/);

    const alterou = trechosDeLei('Qual lei alterou a Lei 6.019/74?', ['alterou'], arquivo);
    assert.ok(
      alterou.passages.some((p) => /Lei 13\.429\/2017/.test(p.title) && /Altera dispositivos da Lei/.test(p.content)),
    );
    assert.ok(alterou.passages.every((p) => p.pinned));

    // Constituição continua valendo quando a pergunta cita o artigo dela, e o roteador marca a estante certa.
    assert.match(trechosDeLei('art. 7º da Constituição', [], arquivo).passages[0].title, /Constituição Federal/);
    assert.equal(trechosDeDocumentos('art. 5º-A da Lei 6.019', [], arquivo).passages[0].no, 'estante:legislacao');
    assert.equal(trechosDeDocumentos('art. 7º da Constituição', [], arquivo).passages[0].no, 'estante:constituicao');
    assert.deepEqual(
      trechosDeLei('Como funciona o trabalho temporário na prática?', ['temporario'], arquivo).passages,
      [],
    );
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('a estante "legislacao" existe e os documentos coletados vão para ela; o grafo liga a norma pelo título', () => {
  assert.equal(estantePorId('legislacao')?.onde, "d.source = 'legislacao'");
  assert.equal(estanteDoDocumento({ source: 'legislacao', url: `${NORMAS[0].url}#5-A` }), 'legislacao');
  assert.ok(extrairEntidades('Lei 6.019/1974 — Art. 5º-A').some((e) => e.id === 'lei:6019/1974'));
  assert.ok(extrairEntidades('Decreto-Lei 5.452/1943 (CLT) — Art. 59').some((e) => e.id === 'lei:5452/1943'));
});

test('juntarQuebras cola "Art." sozinho na ponta da linha ao número da linha seguinte (como o Planalto serve)', () => {
  assert.equal(
    juntarQuebras('Art.\n10. Qualquer que seja o ramo da empresa\ntomadora de serviços.'),
    'Art. 10. Qualquer que seja o ramo da empresa tomadora de serviços.',
  );
});
