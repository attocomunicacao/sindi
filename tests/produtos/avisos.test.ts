import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AVISOS, conteudoVencido, textoDeVigencia } from '@/lib/produtos/avisos';
import { sistema } from '@/lib/cerebro/instrucoes';

test('avisos: nenhum deixa de dizer que não é consultoria nem recomenda preço', () => {
  assert.match(AVISOS.naoEConsultoria, /sem caráter de consultoria/);
  assert.match(AVISOS.custoNaoPreco, /não recomenda preço/);
  assert.match(AVISOS.rodape, /não é consultoria/);
});

test('vigência: formata a data e vence só depois do último dia válido', () => {
  assert.equal(textoDeVigencia('2026-11-16'), 'Atualizado em 16/11/2026.');
  assert.equal(textoDeVigencia('2026-11-16', '2026-12-16'), 'Atualizado em 16/11/2026; válido até 16/12/2026.');
  assert.equal(conteudoVencido(undefined), false);
  assert.equal(conteudoVencido('2026-12-16', new Date('2026-12-16T12:00:00Z')), false);
  assert.equal(conteudoVencido('2026-12-16', new Date('2026-12-17T00:00:00Z')), true);
});

test('regras do cérebro: proíbem recomendar preço, margem ou lucro e mandam o caso concreto ao jurídico', () => {
  const regras = sistema().replace(/\s+/g, ' ');
  assert.match(regras, /Nunca recomende preço, margem ou lucro/);
  assert.match(regras, /Setor Jurídico/);
});
