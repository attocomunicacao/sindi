import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LeitorDoChat, lerLinhaDoChat, textoParaLeitor } from '../src/lib/chat-stream';

const bytes = (texto: string) => new TextEncoder().encode(texto);

test('leitor do fluxo: junta linhas partidas, caracteres UTF-8 partidos e a última linha sem quebra', () => {
  const leitor = new LeitorDoChat();
  const tudo = bytes('{"type":"delta","text":"Olá, açaí"}\n{"type":"reset"}\n{"type":"done","text":"Pronto","restantes":3,"metricsRecorded":false}');
  const meioDoC = tudo.indexOf(0xc3) + 1; // no meio de "á" (2 bytes)
  const eventos = [...leitor.empurrar(tudo.slice(0, 12)), ...leitor.empurrar(tudo.slice(12, meioDoC)), ...leitor.empurrar(tudo.slice(meioDoC, 70)), ...leitor.empurrar(tudo.slice(70)), ...leitor.empurrar(undefined, true)];
  assert.deepEqual(eventos, [{ type: 'delta', text: 'Olá, açaí' }, { type: 'reset' }, { type: 'done', text: 'Pronto', restantes: 3, metricsRecorded: false }]);
  assert.equal(leitor.invalidas, 0);
});

test('leitor do fluxo: linha inválida é contada, não derruba a leitura, e tipos desconhecidos são ignorados como inválidos', () => {
  const leitor = new LeitorDoChat();
  const eventos = leitor.empurrar(bytes('{isto não é json\n{"type":"delta","text":"ok"}\n{"type":"outro"}\n\n{"type":"delta"}\n'));
  assert.deepEqual(eventos, [{ type: 'delta', text: 'ok' }]);
  assert.equal(leitor.invalidas, 3);
  assert.equal(lerLinhaDoChat('   '), undefined); assert.deepEqual(lerLinhaDoChat('{"type":"error"}'), { type: 'error', error: undefined });
  assert.deepEqual(lerLinhaDoChat('{"type":"error","error":"Limite"}'), { type: 'error', error: 'Limite' });
});

test('texto para leitor de tela: links viram o rótulo e o realce de markdown some', () => {
  assert.equal(textoParaLeitor('**Olá!** Veja a [convenção](https://exemplo.com/x).\n\n- item um\n- item dois'), 'Olá! Veja a convenção. - item um - item dois');
});
