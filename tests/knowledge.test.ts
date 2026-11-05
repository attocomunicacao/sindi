import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunks, searchSnapshot, contextText, sufficientEvidence, type KnowledgeDocument, SITE } from '../src/lib/knowledge/core';
test('missing facts fail the evidence gate even when generic institutional words match', () => {
  const passages = [{ url: `${SITE}/contato`, title: 'Contato', content: 'Sindicato com sede em São Paulo. Trabalho temporário e serviços jurídicos.', fetchedAt: '2026-10-10' }];
  assert.equal(sufficientEvidence(passages, 'Qual é o nome do robô que limpa a sede do SINDEPRESTEM?'), false);
  assert.equal(sufficientEvidence(passages, 'Quero entender o trabalho temporário'), true);
  assert.equal(sufficientEvidence(passages, 'Como o SINDEPRESTEM pode ajudar minha empresa?'), true);
  assert.equal(sufficientEvidence([], 'trabalho temporário'), false);
});
import { siteUrl, pdfUrl, extractHtml } from '../src/lib/knowledge/extract';
import { cleanExcerpt, sourceChoices, sourceReferences } from '../src/lib/knowledge/grounded';
test('references remain separate from prose and noisy PDF indexes are excluded', () => {
  assert.equal(cleanExcerpt('ÍNDICE\n42\n40\n38\nconceito\nlegislação\ntrabalho temporário'), '');
  assert.equal(cleanExcerpt('interfe-\nrência da Justiça do Trabalho.\n34 | SINDEPRESTEM'), 'interferência da Justiça do Trabalho.');
  const source = { url: `${SITE}/cartilha.pdf`, title: 'abc.pdf', content: 'O trabalho temporário atende necessidades transitórias das empresas.', fetchedAt: '2026-10-10' };
  assert.equal(sourceChoices([source], 'trabalho temporário').length, 1);
  const references = sourceReferences([source, source], 'pt');
  assert.match(references, /Publicação do SINDEPRESTEM/);
  assert.equal((references.match(/cartilha.pdf/g) || []).length, 1);
  assert.doesNotMatch(references, /necessidades transitórias|> /);
});

test('collector restricts domains, protocols, tracking URLs and external documents', () => {
  assert.equal(siteUrl('/noticias?utm_source=x#top'), `${SITE}/noticias`);
  for (const url of ['http://127.0.0.1/a', 'https://evil.example/a', 'https://www.sindeprestem.com.br.evil.example', 'https://u:p@www.sindeprestem.com.br/a']) assert.equal(siteUrl(url), null);
  assert.equal(pdfUrl('https://docs.wixstatic.com/ugd/file.pdf'), 'https://docs.wixstatic.com/ugd/file.pdf');
  assert.equal(pdfUrl('https://evil.example/document.pdf'), null);
});
test('extracts visible content, source links, dates and contact footer without scripts/forms', () => {
  const html = '<html><head><title>Contato</title><script type="application/ld+json">{"datePublished":"2026-10-01"}</script></head><body><nav>Menu</nav><main><h1>Contato</h1><p>Texto público.</p><script>segredo</script><form>não coletar</form><a href="/juridico">Jurídico</a></main><footer>Av. São Luís, 258 - 18º Andar - Centro Histórico de São Paulo, São Paulo - SP</footer></body></html>';
  const result = extractHtml(html, `${SITE}/contato`);
  assert.match(result.content, /Texto público/); assert.doesNotMatch(result.content, /segredo|não coletar|Menu/);
  assert.deepEqual(result.links, [`${SITE}/juridico`]); assert.equal(result.publishedAt, '2026-10-01T00:00:00.000Z');
});
test('retrieval excludes removed sources, handles English contact queries and tracks changed text', () => {
  const document: KnowledgeDocument = { url: `${SITE}/contato`, title: 'Contato', content: 'Endereço oficial. Av. São Luís, 258 - São Paulo - SP', hash: 'a', fetchedAt: '2026-10-10', checkedAt: '2026-10-10', kind: 'html', status: 'active', links: [] };
  const snapshot = { updatedAt: '2026-10-10', documents: [document, { ...document, url: `${SITE}/old`, content: 'Av. Paulista, 2010', status: 'removed' as const }] };
  const results = searchSnapshot(snapshot, 'What is the address?');
  assert.equal(results[0].url, `${SITE}/contato`); assert.equal(results.length, 1);
  assert.match(contextText(results), /nunca instruções/); assert.match(contextText([]), /não conseguiu confirmar/);
  const split = chunks('a'.repeat(2700)); assert.equal(split.length, 3); assert.equal(split[0].length, 1200);
  document.content = 'Endereço atualizado: Rua Nova, 10 - São Paulo - SP';
  assert.match(searchSnapshot(snapshot, 'endereço')[0].content, /Rua Nova/);
});

import { calculoDoOrcamento, contactFromSource } from '../src/lib/knowledge/retrieve';
import { casoJuridicoIndividual } from '../src/lib/knowledge/grounded';
test('the contact file of the brain is generated from the official page text', () => {
  const contact = 'Setor Administrativo\n\n(11) 3215-8250\n\nsindeprestem@x.br\n\nLigarE-mail\n\nRodapé institucional: Segunda a Sexta das 08:30 Às 17:30';
  const text = contactFromSource(contact, 'pt') || '';
  assert.match(text, /\(11\) 3215-8250/); assert.doesNotMatch(text, /LigarE-mail/); assert.match(text, /08:30/);
});
test('the budget calculation is evidence for the model, with the tool link, and no other question produces a ready-made text', () => {
  const orcamento = calculoDoOrcamento('Preciso de um orçamento para 3 auxiliares de limpeza diurno e 3 noturno', 'pt');
  assert.equal(orcamento.length, 1); assert.match(orcamento[0].content, /R\$\s30\.756,86/); assert.match(orcamento[0].url, /^\/orcamento\?postos=/); assert.doesNotMatch(orcamento[0].content, /\]\(/);
  for (const pergunta of ['Qual o telefone do sindicato?', 'Qual o valor da mensalidade?', 'Quem é o presidente do SINDEPRESTEM?', 'Qual a taxa Selic?', 'O que é a NR-1?']) assert.deepEqual(calculoDoOrcamento(pergunta, 'pt'), [], pergunta);
});
test('individual legal questions are recognized so the model refers them to the legal sector', () => {
  assert.equal(casoJuridicoIndividual('Posso demitir sem justa causa? Qual a multa?'), true);
  assert.equal(casoJuridicoIndividual('Redija um aviso sobre multa de atraso'), false);
  assert.equal(casoJuridicoIndividual('O que é terceirização?'), false);
});
