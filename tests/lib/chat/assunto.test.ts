import assert from 'node:assert/strict';
import test from 'node:test';
import { assuntoDaConversa, consultaDaConversa, ehContinuacao, temAssuntoProprio } from '@/lib/chat/assunto';
import { encurtarPorFrase, historicoParaOModelo, semReferencias } from '@/lib/chat/historico';
import { escolherConector } from '@/lib/cerebro/conectores';

test('continuação: pergunta que depende do que veio antes herda o assunto; pergunta nova, mesmo curta, não', () => {
  for (const q of ['e para empresa filiada?', 'e o prazo?', 'e para temporário?'])
    assert.equal(ehContinuacao(q), true, q);
  for (const q of [
    'Qual o horário de atendimento?',
    'Como funciona a contribuição associativa?',
    'Quais cartilhas existem sobre ESG?',
  ])
    assert.equal(ehContinuacao(q), false, q);
  assert.equal(ehContinuacao('x '.repeat(13)), false, 'pergunta longa nunca é continuação');
  assert.equal(temAssuntoProprio('Como funciona a contribuição associativa?'), true);
});

test('consulta da conversa: continuação leva o assunto original, mesmo depois de outra continuação', () => {
  const anteriores = ['Como funciona a contribuição associativa do sindicato?', 'e para empresa filiada?'];
  const consulta = consultaDaConversa('e para temporário?', anteriores);
  assert.match(consulta, /contribuição associativa/);
  assert.match(consulta, /e para temporário\?$/);
  assert.equal(assuntoDaConversa(anteriores), anteriores[0]);
  // Assunto novo e curto: a consulta é só a pergunta (não polui a busca com o assunto antigo).
  assert.equal(consultaDaConversa('Qual o horário de atendimento?', anteriores), 'Qual o horário de atendimento?');
  // Sem perguntas anteriores, nada a herdar.
  assert.equal(consultaDaConversa('e o prazo?', []), 'e o prazo?');
  assert.equal(assuntoDaConversa([]), undefined);
  // Só continuações: vale a última.
  assert.equal(assuntoDaConversa(['e hoje?', 'e amanhã?']), 'e amanhã?');
  assert.ok(assuntoDaConversa(['a'.repeat(900)])!.length <= 300);
});

test('conector: a área vem da pergunta anterior mais recente que a tem (continuação de continuação)', () => {
  const area = escolherConector('e para 200 pessoas?', [
    'Como organizar um processo seletivo para vagas?',
    'e para temporários?',
  ]);
  assert.equal(area?.id, 'rh-recrutamento-e-qualificacao');
});

test('histórico para o modelo: corta por frase, sem links, sem meio de palavra', () => {
  const resposta =
    'A contribuição associativa vence no dia 10 de cada mês. O valor depende do capital social da empresa e da faixa em que ela se enquadra. ' +
    'Empresas filiadas não pagam essa contribuição, mas pagam a negocial, conforme a convenção coletiva em vigor para a categoria.';
  const curto = encurtarPorFrase(resposta, 100);
  assert.ok(curto.length <= 100 && curto.endsWith('.'), curto);
  assert.equal(curto, 'A contribuição associativa vence no dia 10 de cada mês.');
  const semFrase = encurtarPorFrase('palavra '.repeat(100), 60);
  assert.ok(semFrase.length <= 60 && semFrase.endsWith('…') && !/palav…$/.test(semFrase), semFrase);
  assert.equal(encurtarPorFrase('Veja [a cartilha](https://x.test/a) e **pronto**.', 100), 'Veja a cartilha e pronto.');
  const h = historicoParaOModelo(
    [
      { role: 'user', content: 'Pergunta?' },
      { role: 'assistant', content: `${resposta}\n\nReferências: [Contato](https://www.sindeprestem.com.br/contato)` },
    ],
    2,
    400,
  );
  assert.ok(h[1].content.length <= 400 && !h[1].content.includes('http') && !h[1].content.includes('Referências'));
  assert.equal(semReferencias('Texto.\n\nReferências: [a](b)'), 'Texto.');
});
