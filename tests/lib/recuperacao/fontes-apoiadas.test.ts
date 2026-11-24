import assert from 'node:assert/strict';
import test from 'node:test';
import type { Passagem } from '@/lib/base/tipos';
import { fontesApoiadas } from '@/lib/recuperacao/fontes';

const fonte = (title: string, content: string): Passagem => ({
  url: `https://exemplo.test/${encodeURIComponent(title)}`,
  title,
  content,
  fetchedAt: '2026-11-24',
  pinned: true,
});

const contribuicao = fonte(
  'Contribuição associativa',
  'A contribuição associativa é paga pelas empresas associadas e vence no dia 10 de cada mês, com valor de R$ 120,00.',
);
const noticia = fonte(
  'TRT anula decisão sobre terceirização',
  'O tribunal regional validou a terceirização de atividade-fim em decisão publicada esta semana.',
);

test('fontes apoiadas: fica só a fonte em que a resposta se baseia, não todas as que foram ao modelo', () => {
  const resposta = 'A contribuição associativa das empresas associadas vence no dia 10 de cada mês.';
  assert.deepEqual(fontesApoiadas(resposta, [noticia, contribuicao]), [contribuicao]);
});

test('fontes apoiadas: resposta que se apoia nas duas mantém as duas', () => {
  const resposta =
    'A contribuição associativa vence no dia 10, e o tribunal regional validou a terceirização de atividade-fim.';
  assert.equal(fontesApoiadas(resposta, [noticia, contribuicao]).length, 2);
});

test('fontes apoiadas: flexões do mesmo radical e números contam como aderência', () => {
  const resposta = 'As empresas associadas pagam contribuições no dia 10.';
  assert.deepEqual(fontesApoiadas(resposta, [noticia, contribuicao]), [contribuicao]);
});

test('fontes apoiadas: na dúvida a referência não some (uma fonte só, resposta curta demais ou sem nenhuma aderência)', () => {
  assert.deepEqual(fontesApoiadas('Sim.', [noticia, contribuicao]), [noticia, contribuicao]);
  assert.deepEqual(fontesApoiadas('Resposta qualquer sem relação.', [noticia, contribuicao]), [noticia, contribuicao]);
  assert.deepEqual(fontesApoiadas('A contribuição vence no dia 10.', [contribuicao]), [contribuicao]);
  assert.deepEqual(fontesApoiadas('texto', []), []);
});

test('fontes apoiadas: a ordem original das fontes é mantida', () => {
  const resposta = 'A contribuição associativa vence no dia 10 e o tribunal validou a terceirização de atividade-fim.';
  assert.deepEqual(fontesApoiadas(resposta, [contribuicao, noticia]), [contribuicao, noticia]);
});
