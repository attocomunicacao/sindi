import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SITE } from '@/lib/base/constantes';
import { buscarNoEspelho, fatiarTexto } from '@/lib/recuperacao/legado/espelho';
import { evidenciaSuficiente } from '@/lib/recuperacao/contexto';
import type { DocumentoDoEspelho } from '@/lib/base/tipos';
test('missing facts fail the evidence gate even when generic institutional words match', () => {
  const passages = [
    {
      url: `${SITE}/contato`,
      title: 'Contato',
      content: 'Sindicato com sede em São Paulo. Trabalho temporário e serviços jurídicos.',
      fetchedAt: '2026-10-10',
    },
  ];
  assert.equal(evidenciaSuficiente(passages, 'Qual é o nome do robô que limpa a sede do SINDEPRESTEM?'), false);
  assert.equal(evidenciaSuficiente(passages, 'Quero entender o trabalho temporário'), true);
  assert.equal(evidenciaSuficiente(passages, 'Como o SINDEPRESTEM pode ajudar minha empresa?'), true);
  assert.equal(evidenciaSuficiente([], 'trabalho temporário'), false);
});
import { urlDoSite, urlDoPdf, extrairHtml } from '@/lib/recuperacao/legado/extract';
import { limparTrecho, escolherFontes, referenciasDasFontes, trechoDeContato } from '@/lib/recuperacao/fontes';
import { CONTATOS_OFICIAIS } from '@/lib/seguranca/verificar-fatos';
test('references remain separate from prose and noisy PDF indexes are excluded', () => {
  assert.equal(limparTrecho('ÍNDICE\n42\n40\n38\nconceito\nlegislação\ntrabalho temporário'), '');
  assert.equal(
    limparTrecho('interfe-\nrência da Justiça do Trabalho.\n34 | SINDEPRESTEM'),
    'interferência da Justiça do Trabalho.',
  );
  const source = {
    url: `${SITE}/cartilha.pdf`,
    title: 'abc.pdf',
    content: 'O trabalho temporário atende necessidades transitórias das empresas.',
    fetchedAt: '2026-10-10',
  };
  assert.equal(escolherFontes([source], 'trabalho temporário').length, 1);
  const references = referenciasDasFontes([source, source]);
  assert.match(references, /Publicação do SINDEPRESTEM/);
  assert.equal((references.match(/cartilha.pdf/g) || []).length, 1);
  assert.doesNotMatch(references, /necessidades transitórias|> /);
});

test('collector restricts domains, protocols, tracking URLs and external documents', () => {
  assert.equal(urlDoSite('/noticias?utm_source=x#top'), `${SITE}/noticias`);
  for (const url of [
    'http://127.0.0.1/a',
    'https://evil.example/a',
    'https://www.sindeprestem.com.br.evil.example',
    'https://u:p@www.sindeprestem.com.br/a',
  ])
    assert.equal(urlDoSite(url), null);
  assert.equal(urlDoPdf('https://docs.wixstatic.com/ugd/file.pdf'), 'https://docs.wixstatic.com/ugd/file.pdf');
  assert.equal(urlDoPdf('https://evil.example/document.pdf'), null);
});
test('extracts visible content, source links, dates and contact footer without scripts/forms', () => {
  const html =
    '<html><head><title>Contato</title><script type="application/ld+json">{"datePublished":"2026-10-01"}</script></head><body><nav>Menu</nav><main><h1>Contato</h1><p>Texto público.</p><script>segredo</script><form>não coletar</form><a href="/juridico">Jurídico</a></main><footer>Av. São Luís, 258 - 18º Andar - Centro Histórico de São Paulo, São Paulo - SP</footer></body></html>';
  const result = extrairHtml(html, `${SITE}/contato`);
  assert.match(result.content, /Texto público/);
  assert.doesNotMatch(result.content, /segredo|não coletar|Menu/);
  assert.deepEqual(result.links, [`${SITE}/juridico`]);
  assert.equal(result.publishedAt, '2026-10-01T00:00:00.000Z');
});
test('retrieval excludes removed sources, handles English contact queries and tracks changed text', () => {
  const document: DocumentoDoEspelho = {
    url: `${SITE}/contato`,
    title: 'Contato',
    content: 'Endereço oficial. Av. São Luís, 258 - São Paulo - SP',
    hash: 'a',
    fetchedAt: '2026-10-10',
    checkedAt: '2026-10-10',
    kind: 'html',
    status: 'active',
    links: [],
  };
  const snapshot = {
    updatedAt: '2026-10-10',
    documents: [
      document,
      { ...document, url: `${SITE}/old`, content: 'Av. Paulista, 2010', status: 'removed' as const },
    ],
  };
  const results = buscarNoEspelho(snapshot, 'What is the address?');
  assert.equal(results[0].url, `${SITE}/contato`);
  assert.equal(results.length, 1);
  const split = fatiarTexto('a'.repeat(2700));
  assert.equal(split.length, 3);
  assert.equal(split[0].length, 1200);
  document.content = 'Endereço atualizado: Rua Nova, 10 - São Paulo - SP';
  assert.match(buscarNoEspelho(snapshot, 'endereço')[0].content, /Rua Nova/);
});

import { contatoDaFonte } from '@/lib/cerebro/contato-do-site';
import { calculoDoOrcamento } from '@/lib/orcamento/ferramenta';
import { executarFerramentas } from '@/lib/ferramentas/registro';
import { casoJuridicoIndividual } from '@/lib/chat/escopo';
test('the contact file of the brain is generated from the official page text', () => {
  const contact =
    'Setor Administrativo\n\n(11) 3215-8250\n\nsindeprestem@x.br\n\nLigarE-mail\n\nRodapé institucional: Segunda a Sexta das 08:30 Às 17:30';
  const text = contatoDaFonte(contact) || '';
  assert.match(text, /\(11\) 3215-8250/);
  assert.doesNotMatch(text, /LigarE-mail/);
  assert.match(text, /08:30/);
});
test('the budget calculation is evidence for the model, marked with the tool and its orientation, and no other question produces a ready-made text', async () => {
  const orcamento = await executarFerramentas(
    'Preciso de um orçamento para 3 auxiliares de limpeza diurno e 3 noturno',
    {},
  );
  assert.equal(orcamento.length, 1);
  assert.match(orcamento[0].content, /R\$\s30\.756,86/);
  assert.match(orcamento[0].url, /^\/orcamento\?postos=/);
  assert.doesNotMatch(orcamento[0].content, /\]\(/);
  assert.equal(orcamento[0].ferramenta?.id, 'orcamento');
  assert.match(orcamento[0].ferramenta?.orientacao ?? '', /números exatos da fonte/);
  assert.equal(orcamento[0].pinned, true);
  assert.deepEqual(calculoDoOrcamento('Qual o telefone do sindicato?'), undefined);
  for (const pergunta of [
    'Qual o telefone do sindicato?',
    'Qual o valor da mensalidade?',
    'Quem é o presidente do SINDEPRESTEM?',
    'Qual a taxa Selic?',
    'O que é a NR-1?',
  ])
    assert.deepEqual(await executarFerramentas(pergunta, {}), []);
});
test('individual legal questions are recognized so the model refers them to the legal sector', () => {
  assert.equal(casoJuridicoIndividual('Posso demitir sem justa causa? Qual a multa?'), true);
  assert.equal(casoJuridicoIndividual('Redija um aviso sobre multa de atraso'), false);
  assert.equal(casoJuridicoIndividual('O que é terceirização?'), false);
});
test('o trecho de contato entregue ao modelo contém cada contato oficial que a verificação de fatos aceita', () => {
  const conteudo = trechoDeContato().content;
  for (const contato of CONTATOS_OFICIAIS)
    assert.ok(conteudo.includes(contato), `falta no trecho de contato: ${contato}`);
});
