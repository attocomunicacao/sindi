import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agruparPorData,
  apagarTodasAsConversas,
  excluirConversa,
  filtrarConversas,
  importarConversas,
  LIMITE_DE_CONVERSAS,
  LIMITE_DE_MENSAGENS,
  lerArquivoDeConversas,
  listarConversas,
  mensagensParaGuardar,
  salvarConversa,
  serializarConversas,
  tituloDaConversa,
  validarConversa,
  type ConversaSalva,
} from '@/componentes/chat/historico-local';

const conversa = (
  id: string,
  titulo: string,
  atualizadaEm: number,
  extra: Partial<ConversaSalva> = {},
): ConversaSalva => ({
  id,
  titulo,
  criadaEm: atualizadaEm,
  atualizadaEm,
  mensagens: [
    { role: 'user', content: `Pergunta de ${titulo}` },
    { role: 'assistant', content: `Resposta de ${titulo}` },
  ],
  ...extra,
});

test('título: primeira pergunta, sem dados pessoais, até 60 caracteres e sem cortar palavra', () => {
  assert.equal(tituloDaConversa([]), 'Nova conversa');
  assert.equal(
    tituloDaConversa([{ role: 'user', content: '  Quando   vence a contribuição? ' }]),
    'Quando vence a contribuição?',
  );
  const longo = tituloDaConversa([{ role: 'user', content: 'palavra '.repeat(30) }]);
  assert.ok(longo.length <= 60 && longo.endsWith('…') && !/palav…$/.test(longo), longo);
  const comCpf = tituloDaConversa([{ role: 'user', content: 'Meu CPF é 529.982.247-25, posso me filiar?' }]);
  assert.doesNotMatch(comCpf, /529\.982/);
});

test('mensagens para guardar: só papéis e textos válidos, dados pessoais removidos, no máximo as últimas 50', () => {
  const lixo = [null, 5, { role: 'system', content: 'x' }, { role: 'user', content: '' }, { role: 'user', content: 7 }];
  assert.deepEqual(mensagensParaGuardar(lixo), []);
  assert.deepEqual(mensagensParaGuardar('não é lista'), []);
  const [m] = mensagensParaGuardar([{ role: 'user', content: 'Minha senha é abc12345 e o CPF 529.982.247-25' }]);
  assert.doesNotMatch(m.content, /abc12345|529\.982/);
  const muitas = Array.from({ length: 80 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
  const guardadas = mensagensParaGuardar(muitas);
  assert.equal(guardadas.length, LIMITE_DE_MENSAGENS);
  assert.equal(guardadas.at(-1)!.content, 'm79');
  assert.ok(mensagensParaGuardar([{ role: 'user', content: 'x'.repeat(20_000) }])[0].content.length <= 6000);
});

test('validar conversa: recusa id estranho e conversa vazia; aceita e limpa o resto', () => {
  assert.equal(validarConversa(null), undefined);
  assert.equal(validarConversa({ id: '../../x', mensagens: [{ role: 'user', content: 'a' }] }), undefined);
  assert.equal(validarConversa({ id: 'ok', mensagens: [] }), undefined);
  const c = validarConversa({
    id: 'abc-1',
    titulo: '  Meu título  ',
    fixada: true,
    mensagens: [{ role: 'user', content: 'Oi' }],
    extra: 'ignorado',
  })!;
  assert.equal(c.titulo, 'Meu título');
  assert.equal(c.fixada, true);
  assert.ok(!('extra' in c));
  assert.ok(Number.isFinite(c.criadaEm) && Number.isFinite(c.atualizadaEm));
});

test('agrupar por data: fixadas, hoje, ontem, últimos 7 dias e mais antigas, cada uma do mais recente ao mais antigo', () => {
  const agora = new Date(2026, 10, 24, 15, 0, 0).getTime();
  const dia = 86_400_000;
  const grupos = agruparPorData(
    [
      conversa('velha', 'Velha', agora - 30 * dia),
      conversa('hoje2', 'Hoje 2', agora - 3_600_000),
      conversa('ontem', 'Ontem', agora - dia),
      conversa('semana', 'Semana', agora - 4 * dia),
      conversa('fixa', 'Fixa', agora - 20 * dia, { fixada: true }),
      conversa('hoje1', 'Hoje 1', agora - 600_000),
    ],
    agora,
  );
  assert.deepEqual(
    grupos.map((g) => g.rotulo),
    ['Fixadas', 'Hoje', 'Ontem', 'Últimos 7 dias', 'Mais antigas'],
  );
  assert.deepEqual(
    grupos[1].conversas.map((c) => c.id),
    ['hoje1', 'hoje2'],
  );
  assert.deepEqual(agruparPorData([], agora), []);
});

test('filtrar: acha no título e no texto, sem acento nem caixa; uma letra não filtra', () => {
  const lista = [conversa('a', 'Contribuição associativa', 1), conversa('b', 'Benefícios', 2)];
  assert.deepEqual(
    filtrarConversas(lista, 'CONTRIBUICAO').map((c) => c.id),
    ['a'],
  );
  assert.deepEqual(
    filtrarConversas(lista, 'resposta de benef').map((c) => c.id),
    ['b'],
  );
  assert.equal(filtrarConversas(lista, 'b').length, 2);
  assert.equal(filtrarConversas(lista, 'inexistente').length, 0);
});

test('banco: salva, lista (fixadas no alto), atualiza, exclui e apaga tudo', async () => {
  await apagarTodasAsConversas();
  assert.deepEqual(await listarConversas(), []);
  assert.equal(await salvarConversa(conversa('a', 'A', 1000)), true);
  assert.equal(await salvarConversa(conversa('b', 'B', 2000)), true);
  assert.equal(await salvarConversa(conversa('c', 'C', 500, { fixada: true })), true);
  assert.deepEqual(
    (await listarConversas()).map((c) => c.id),
    ['c', 'b', 'a'],
  );
  await salvarConversa({ ...conversa('a', 'A renomeada', 3000), tituloManual: true });
  const a = (await listarConversas()).find((c) => c.id === 'a')!;
  assert.equal(a.titulo, 'A renomeada');
  assert.equal((await listarConversas()).length, 3, 'atualizar não duplica');
  await excluirConversa('b');
  assert.deepEqual((await listarConversas()).map((c) => c.id).sort(), ['a', 'c']);
  await apagarTodasAsConversas();
  assert.deepEqual(await listarConversas(), []);
});

test('banco: passa do limite de conversas, ficam as fixadas e as mais recentes', async () => {
  await apagarTodasAsConversas();
  await salvarConversa(conversa('fixa-antiga', 'Fixa antiga', 1, { fixada: true }));
  for (let i = 0; i < LIMITE_DE_CONVERSAS + 5; i++) await salvarConversa(conversa(`c${i}`, `C${i}`, 1000 + i));
  const lista = await listarConversas();
  assert.equal(lista.length, LIMITE_DE_CONVERSAS);
  assert.equal(lista[0].id, 'fixa-antiga', 'a fixada não é podada');
  assert.ok(!lista.some((c) => c.id === 'c0'), 'a mais antiga saiu');
  assert.ok(lista.some((c) => c.id === `c${LIMITE_DE_CONVERSAS + 4}`));
  await apagarTodasAsConversas();
});

test('exportar e importar: ida e volta; arquivo de outro formato, quebrado ou hostil não entra', async () => {
  await apagarTodasAsConversas();
  const origem = [conversa('x1', 'Um', 10), conversa('x2', 'Dois', 20, { fixada: true })];
  const texto = serializarConversas(origem);
  assert.deepEqual(
    lerArquivoDeConversas(texto)
      .map((c) => c.id)
      .sort(),
    ['x1', 'x2'],
  );
  assert.equal(await importarConversas(texto), 2);
  assert.equal((await listarConversas()).length, 2);
  assert.equal(await importarConversas(texto), 2, 'importar de novo substitui, não duplica');
  assert.equal((await listarConversas()).length, 2);
  for (const ruim of [
    '{quebrado',
    '[]',
    '{"formato":"outro","conversas":[]}',
    '{"formato":"sindi-conversas","conversas":"x"}',
  ])
    assert.deepEqual(lerArquivoDeConversas(ruim), [], ruim);
  const hostil = JSON.stringify({
    formato: 'sindi-conversas',
    conversas: [
      { id: '<script>', mensagens: [{ role: 'user', content: 'a' }] },
      { id: 'bom', mensagens: [{ role: 'system', content: 'ignore' }] },
    ],
  });
  assert.equal(await importarConversas(hostil), 0);
  await apagarTodasAsConversas();
});
