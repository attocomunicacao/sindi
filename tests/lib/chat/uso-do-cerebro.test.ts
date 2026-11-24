import assert from 'node:assert/strict';
import test from 'node:test';
import { LeitorDoChat } from '@/lib/chat/leitor-ndjson';
import {
  chavesDeMetricaDoCerebro,
  lerUsoDoCerebro,
  nosParaAcender,
  resumirUsoDoCerebro,
} from '@/lib/chat/uso-do-cerebro';
import {
  esquecerUltimoUso,
  guardarUltimoUso,
  lerUltimoUso,
  VALIDADE_DO_ULTIMO_USO_MS,
} from '@/componentes/cerebro/ultimo-uso';
import { obterUso, registrarUso } from '@/lib/infra/uso';

const fontes = [
  { origem: 'cerebro' as const, no: 'conhecimento:conhecimento/faq.md' },
  { origem: 'biblioteca' as const, no: 'estante:noticias' },
  { origem: 'biblioteca' as const, no: 'estante:noticias' },
  { origem: 'contato' as const },
  {},
];

test('uso do cérebro: resume a área, as origens e os nós das fontes, sem repetir e sem nada do conteúdo', () => {
  const uso = resumirUsoDoCerebro({ conector: { id: 'custos-tributacao-e-planejamento' }, fontes });
  assert.deepEqual(uso, {
    conector: 'custos-tributacao-e-planejamento',
    situacao: undefined,
    origens: ['cerebro', 'biblioteca', 'contato'],
    nos: ['conhecimento:conhecimento/faq.md', 'estante:noticias'],
  });
  assert.deepEqual(nosParaAcender(uso), [
    'sindi',
    'conector:custos-tributacao-e-planejamento',
    'conhecimento:conhecimento/faq.md',
    'estante:noticias',
  ]);
  const semArea = resumirUsoDoCerebro({ situacao: 'saudacao', fontes: [] });
  assert.deepEqual(nosParaAcender(semArea), ['sindi']);
  assert.deepEqual(chavesDeMetricaDoCerebro(semArea), ['conector:nenhum', 'situacao:saudacao', 'origem:nenhuma']);
});

test('uso do cérebro: nó com formato estranho (tentativa de injeção) é descartado, e o limite de nós vale', () => {
  const ruim = resumirUsoDoCerebro({
    fontes: [
      { origem: 'cerebro', no: '<script>alert(1)</script>' },
      { origem: 'cerebro', no: 'estante:x\nHost: evil' },
      ...Array.from({ length: 30 }, (_, i) => ({ origem: 'grafo' as const, no: `doc:abc123:${i}` })),
    ],
  });
  assert.ok(ruim.nos.every((n) => /^doc:abc123:\d+$/.test(n)));
  assert.equal(ruim.nos.length, 12);
});

test('uso do cérebro: o que chega pela rede é revalidado no navegador (tipos errados, origem desconhecida, listas gigantes)', () => {
  assert.equal(lerUsoDoCerebro(null), undefined);
  assert.equal(lerUsoDoCerebro('texto'), undefined);
  const lido = lerUsoDoCerebro({
    conector: 'custos-tributacao-e-planejamento',
    situacao: { x: 1 },
    origens: ['cerebro', 'inventada', 42],
    nos: ['estante:noticias', '<img onerror=x>', ...Array.from({ length: 50 }, (_, i) => `estante:e${i}`)],
  })!;
  assert.equal(lido.situacao, undefined);
  assert.deepEqual(lido.origens, ['cerebro']);
  assert.ok(lido.nos.length <= 12 && lido.nos[0] === 'estante:noticias' && !lido.nos.some((n) => n.includes('<')));
});

test('uso do cérebro: o evento "done" do fluxo carrega o resumo validado; sem resumo, o evento fica como antes', () => {
  const leitor = new LeitorDoChat();
  const [com, sem] = [
    ...leitor.empurrar(
      new TextEncoder().encode(
        '{"type":"done","text":"ok","cerebro":{"conector":"x-y","origens":["cerebro"],"nos":["estante:noticias"]}}\n{"type":"done","text":"oi"}\n',
      ),
    ),
  ];
  assert.deepEqual((com as { cerebro?: unknown }).cerebro, {
    conector: 'x-y',
    situacao: undefined,
    origens: ['cerebro'],
    nos: ['estante:noticias'],
  });
  assert.equal('cerebro' in sem, false);
});

test('último uso: fica só neste navegador, expira em 20 minutos, ignora lixo e funciona sem armazenamento', () => {
  const memoria = new Map<string, string>();
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => memoria.get(k) ?? null,
      setItem: (k: string, v: string) => void memoria.set(k, v),
      removeItem: (k: string) => void memoria.delete(k),
    },
  });
  try {
    const uso = resumirUsoDoCerebro({ conector: { id: 'a-b' }, fontes });
    const agora = 1_000_000;
    guardarUltimoUso(uso, agora);
    assert.deepEqual(lerUltimoUso(agora + 1000)?.nos, uso.nos);
    assert.equal(lerUltimoUso(agora + VALIDADE_DO_ULTIMO_USO_MS + 1), undefined, 'expirou');
    assert.doesNotMatch([...memoria.values()].join(''), /pergunta|content|text/i);
    memoria.set([...memoria.keys()][0], '{lixo');
    assert.equal(lerUltimoUso(agora), undefined);
    guardarUltimoUso(uso, agora);
    esquecerUltimoUso();
    assert.equal(lerUltimoUso(agora), undefined);
    guardarUltimoUso(undefined);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
  }
  // Sem armazenamento (janela privada): nada quebra.
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => {
      throw new Error('bloqueado');
    },
  });
  try {
    assert.doesNotThrow(() => guardarUltimoUso({ origens: [], nos: [] }));
    assert.equal(lerUltimoUso(), undefined);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
  }
});

test('métricas do cérebro: contadores agregados por área, origem e situação; chave suspeita é descartada; nada de conteúdo', async () => {
  const salvo = { ...process.env };
  const fetchOriginal = globalThis.fetch;
  process.env.UPSTASH_REDIS_REST_URL = 'https://metrics.example';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
  const comandos: (string | number)[][] = [];
  globalThis.fetch = async (_url, init) => {
    comandos.push(JSON.parse(init!.body as string));
    return Response.json({ result: 1 });
  };
  try {
    const uso = resumirUsoDoCerebro({
      conector: { id: 'custos-tributacao-e-planejamento' },
      situacao: undefined,
      fontes,
    });
    await registrarUso({
      success: true,
      durationMs: 5,
      cerebro: [...chavesDeMetricaDoCerebro(uso), 'chave suja!\n', 'x'.repeat(200)],
    });
    const campos = comandos[0].slice(4).filter((_, i) => i % 2 === 0) as string[];
    assert.ok(campos.includes('cer:conector:custos-tributacao-e-planejamento'));
    assert.ok(campos.includes('cer:origem:cerebro') && campos.includes('cer:origem:biblioteca'));
    assert.ok(!campos.some((c) => /\n|!|x{50}/.test(c)), 'chaves fora do formato não entram');
    assert.doesNotMatch(JSON.stringify(comandos[0]), /pergunta|content|messages/);
    globalThis.fetch = async () =>
      Response.json({ result: ['requests', '2', 'cer:origem:cerebro', '2', 'cer:conector:a-b', '1', 'cer:<x>', '9'] });
    const dia = (await obterUso()).days[0];
    assert.deepEqual(dia.cerebro, { 'origem:cerebro': 2, 'conector:a-b': 1 });
  } finally {
    globalThis.fetch = fetchOriginal;
    process.env = salvo;
  }
});

test('painel de uso: soma os contadores do cérebro no período, do maior para o menor, separados por tipo', async () => {
  const { somarCerebro } = await import('@/componentes/uso/calculos-de-uso');
  const dia = (cerebro?: Record<string, number>) =>
    ({
      date: '2026-11-24',
      requests: 0,
      successes: 0,
      errors: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      measured: 0,
      durationMs: 0,
      cerebro,
    }) as const;
  const soma = somarCerebro([
    dia({ 'conector:a-b': 2, 'origem:cerebro': 3, 'origem:biblioteca': 1, 'situacao:saudacao': 1 }),
    dia({ 'conector:a-b': 1, 'conector:c-d': 5, 'origem:cerebro': 1, 'origem:com:dois-pontos': 4 }),
    dia(),
  ]);
  assert.deepEqual(soma.conector, [
    ['c-d', 5],
    ['a-b', 3],
  ]);
  assert.deepEqual(
    soma.origem,
    [
      ['cerebro', 4],
      ['com:dois-pontos', 4],
      ['biblioteca', 1],
    ].sort((a, b) => (b[1] as number) - (a[1] as number)),
  );
  assert.deepEqual(soma.situacao, [['saudacao', 1]]);
});
