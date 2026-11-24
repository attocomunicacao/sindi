import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bonusDeConfianca,
  exigeFonteOficial,
  fiscalizarFontes,
  nivelDaUrl,
  perguntaJuridica,
} from '@/lib/fontes/fiscalizador';
import type { Passagem } from '@/lib/base/tipos';

const passagem = (url: string): Passagem => ({ url, title: 't', content: 'c', fetchedAt: '2026-11-24' });

test('nível da fonte: governo, Congresso e tribunais são oficiais; o nome do host é conferido inteiro', () => {
  for (const u of [
    'https://www.planalto.gov.br/ccivil_03/leis/l6019.htm',
    'https://www.camara.leg.br/proposicoesWeb/x',
    'https://www.tst.jus.br/noticias',
    'https://www.gov.br/trabalho-e-emprego/pt-br',
  ])
    assert.equal(nivelDaUrl(u), 'oficial', u);
  for (const u of [
    'https://gov.br.falso.com/x',
    'https://meugov.br/x',
    'https://exemplo.com/?u=https://planalto.gov.br',
    'javascript:alert(1)',
    'nao-e-url',
  ])
    assert.equal(nivelDaUrl(u), 'terceiro', u);
  assert.equal(nivelDaUrl('https://www.sindeprestem.com.br/contato'), 'entidade');
  assert.equal(nivelDaUrl(undefined), 'interna');
});

test('peso: fonte oficial leva mais que a da entidade e que qualquer terceiro', () => {
  const oficial = bonusDeConfianca(passagem('https://www.planalto.gov.br/x'));
  const entidade = bonusDeConfianca(passagem('https://www.sindeprestem.com.br/x'));
  const terceiro = bonusDeConfianca(passagem('https://blog.exemplo.com/x'));
  assert.ok(oficial > entidade && entidade > terceiro && terceiro === 0);
});

test('pergunta jurídica: lei, artigo, jornada e obrigação contam; pergunta de contato não', () => {
  for (const q of [
    'Qual o prazo da Jornada 42?',
    'O que diz o art. 5º-A da Lei 6.019?',
    'A empresa é obrigada a fornecer EPI?',
    'Súmula 331 do TST',
  ])
    assert.equal(perguntaJuridica(q), true, q);
  for (const q of ['Qual o telefone do sindicato?', 'Quem é o presidente?'])
    assert.equal(perguntaJuridica(q), false, q);
});

test('fiscalização: pergunta jurídica sem fonte oficial (ou sem fonte nenhuma) é recusada; com fonte oficial, passa', () => {
  const q = 'O que a lei diz sobre responsabilidade subsidiária?';
  assert.equal(fiscalizarFontes(q, [passagem('https://www.sindeprestem.com.br/a')]).semOficial, true);
  assert.equal(fiscalizarFontes(q, []).semOficial, true);
  const com = fiscalizarFontes(q, [
    passagem('https://www.sindeprestem.com.br/a'),
    passagem('https://www.planalto.gov.br/b'),
  ]);
  assert.equal(com.semOficial, false);
  assert.equal(
    fiscalizarFontes('telefone do sindicato', [passagem('https://www.sindeprestem.com.br/a')]).semOficial,
    false,
  );
});

test('fiscalização: o que o sindicato faz, cláusula de convenção e cálculo de ferramenta não exigem fonte do governo', () => {
  const entidade = [passagem('https://www.sindeprestem.com.br/a')];
  assert.equal(exigeFonteOficial('O que o Sindeprestem está fazendo sobre a NR-1?'), false);
  assert.equal(exigeFonteOficial('Qual o piso do porteiro na convenção coletiva?'), false);
  assert.equal(exigeFonteOficial('Qual o e-mail do jurídico?'), false);
  assert.equal(exigeFonteOficial('Quais projetos de lei acompanhados pelo Sindeprestem afetam minha empresa?'), false);
  assert.equal(exigeFonteOficial('Qual a lei do trabalho temporário?'), true);
  const ferramenta = [
    { ...passagem('https://www.sindeprestem.com.br/orcamento'), ferramenta: { id: 'orcamento', orientacao: 'x' } },
  ];
  assert.equal(fiscalizarFontes('Quanto custa um posto de jornada 12x36?', ferramenta).semOficial, false);
  assert.equal(fiscalizarFontes('Qual o prazo da Jornada 42?', entidade).semOficial, true);
});
