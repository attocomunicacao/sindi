import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUGESTOES, sortearSugestoes } from '../src/lib/sugestoes';

test('o conjunto de sugestões não repete perguntas e inclui as três originais', () => {
  assert.equal(new Set(SUGESTOES).size, SUGESTOES.length);
  assert.ok(SUGESTOES.length >= 12);
  for (const original of ['Como o SINDEPRESTEM pode ajudar minha empresa?', 'Onde encontro as convenções coletivas?', 'O que é trabalho temporário?']) assert.ok(SUGESTOES.includes(original as typeof SUGESTOES[number]));
});
test('cada sorteio traz três perguntas diferentes entre si e diferentes das mostradas antes', () => {
  let anteriores: string[] = [];
  for (let i = 0; i < 200; i++) {
    const atuais = sortearSugestoes(anteriores);
    assert.equal(atuais.length, 3); assert.equal(new Set(atuais).size, 3);
    assert.ok(atuais.every(s => (SUGESTOES as readonly string[]).includes(s)));
    assert.ok(atuais.every(s => !anteriores.includes(s)), 'não repete a sugestão anterior');
    anteriores = atuais;
  }
});
test('o sorteio varia: depois de muitos sorteios aparecem muitas perguntas distintas', () => {
  const vistas = new Set<string>(); let anteriores: string[] = [];
  for (let i = 0; i < 60; i++) { anteriores = sortearSugestoes(anteriores); anteriores.forEach(s => vistas.add(s)); }
  assert.ok(vistas.size >= SUGESTOES.length - 2, `${vistas.size} de ${SUGESTOES.length}`);
});
test('com gerador fixo o resultado é previsível (sem depender de Math.random)', () => {
  assert.deepEqual(sortearSugestoes([], 3, () => 0), sortearSugestoes([], 3, () => 0));
});
