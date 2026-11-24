import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUGESTOES, sortearSugestoes } from '../src/lib/sugestoes';
import { isPercent } from '../src/lib/dados/format';
import { moeda, seguro } from '../src/lib/orcamento/pdf-base';

test('sugestões: sorteia a quantidade pedida, sem repetir entre si nem as anteriores', () => {
  const anteriores = SUGESTOES.slice(0, 3);
  const sorteadas = sortearSugestoes(anteriores, 3, () => 0.5);
  assert.equal(sorteadas.length, 3);
  assert.equal(new Set(sorteadas).size, 3);
  for (const s of sorteadas) assert.ok(!(anteriores as readonly string[]).includes(s));
});

test('sugestões: se não há perguntas novas suficientes, ainda devolve a quantidade pedida', () => {
  const quase = SUGESTOES.slice(0, SUGESTOES.length - 1);
  assert.equal(sortearSugestoes(quase, 3, () => 0.1).length, 3);
});

test('sugestões: todas são perguntas ou pedidos não vazios e únicos', () => {
  assert.equal(new Set(SUGESTOES).size, SUGESTOES.length);
  for (const s of SUGESTOES) assert.ok(s.trim().length > 10);
});

test('format: só unidades que começam com % mostram duas casas', () => {
  assert.equal(isPercent('% ao ano'), true);
  assert.equal(isPercent('  % em 12 meses'), true);
  assert.equal(isPercent('vagas no mês'), false);
});

test('pdf-base: seguro troca o que a fonte padrão não desenha e mantém acentos', () => {
  assert.equal(seguro('açúcar − 5 → 6'), 'açúcar - 5 -> 6');
  assert.equal(seguro('a​b'), 'ab');
  assert.equal(seguro('emoji 😀'), 'emoji ?');
  assert.equal(seguro('linha1\r\nlinha2'), 'linha1\nlinha2');
});

test('pdf-base: moeda formata em reais e não mostra -0,00', () => {
  assert.match(moeda(1234.5), /1\.234,50/);
  assert.match(moeda(-0.001), /0,00/);
  assert.doesNotMatch(moeda(-0.001), /-/);
});
