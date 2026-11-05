import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { carregarArquivos, dividirEmTrechos, lerCabecalho, regrasDoCerebro, trechosDoCerebro } from '../src/lib/cerebro/carregar';
import { buscarNoCerebro, respostaDireta } from '../src/lib/cerebro/buscar';
import { arquivoDeCasos, carregarCasos, lerCasos } from '../src/lib/cerebro/avaliar';

const ARQUIVO = `---
titulo: Contribuições
fonte: https://www.sindeprestem.com.br/contribuicao-sindical
atualizado: 2026-10-13
tipo: curado
prioridade: 2
gatilhos: mensalidade, vencimento, boleto
---

# Contribuições

## Quando vence a contribuição associativa?
Vence todo dia 15.

## Como pago por boleto?
Gere o boleto na página de contribuições.
`;
const FAQ = `---
titulo: FAQ
tipo: curado
direta: sim
---

## Qual o endereço do SINDEPRESTEM?
Av. São Luís, 258.

## Qual o horário de atendimento do SINDEPRESTEM?
Segunda a sexta, das 08:30 às 17:30.
`;
function pastaTemporaria() {
  const pasta = mkdtempSync(path.join(tmpdir(), 'sindi-cerebro-')); for (const sub of ['auto', 'avaliacao', 'instrucoes', 'conectores']) mkdirSync(path.join(pasta, sub));
  writeFileSync(path.join(pasta, '01-contribuicoes.md'), ARQUIVO); writeFileSync(path.join(pasta, '10-faq.md'), FAQ);
  writeFileSync(path.join(pasta, 'README.md'), '# Não deve virar conhecimento\n## Seção\nsegredo-readme');
  writeFileSync(path.join(pasta, 'avaliacao', 'perguntas.md'), '## Pergunta\nespera: x');
  writeFileSync(path.join(pasta, 'auto', 'convencoes.md'), '---\ntitulo: Convenções\ntipo: autogerado\n---\n\n## Portaria\nPiso de R$ 1.912,07 na Portaria.\n');
  writeFileSync(path.join(pasta, 'instrucoes', 'identidade-e-regras.md'), '---\ntitulo: Regras\n---\n\n# Identidade\n\nResponda sempre com fontes.\n');
  writeFileSync(path.join(pasta, 'conectores', '01-rh.md'), '---\ntitulo: RH\ngatilhos: vaga*\n---\n\n## Como responder\nsegredo-conector\n');
  return pasta;
}
test('the header is parsed and sections become independent passages that carry their metadata', () => {
  const { cabecalho, corpo } = lerCabecalho(ARQUIVO);
  assert.equal(cabecalho.titulo, 'Contribuições'); assert.deepEqual(cabecalho.gatilhos, ['mensalidade', 'vencimento', 'boleto']); assert.equal(cabecalho.prioridade, 2);
  const trechos = dividirEmTrechos(corpo, '01-contribuicoes.md', cabecalho);
  assert.deepEqual(trechos.map(t => t.secao), ['Quando vence a contribuição associativa?', 'Como pago por boleto?']);
  assert.equal(trechos[0].fonte, 'https://www.sindeprestem.com.br/contribuicao-sindical'); assert.match(trechos[0].texto, /dia 15/);
});
test('long sections are split by paragraph and keep their section title', () => {
  const longo = `## Seção longa\n${Array.from({ length: 12 }, (_, i) => `Parágrafo ${i}. ${'palavra '.repeat(60)}`).join('\n\n')}`;
  const trechos = dividirEmTrechos(longo, 'x.md', { gatilhos: [], tipo: 'curado', prioridade: 1, direta: false, semantica: true });
  assert.ok(trechos.length > 1); assert.ok(trechos.every(t => t.secao === 'Seção longa' && t.texto.length <= 2600));
});
test('README and evaluation files are not knowledge; auto-generated files are marked as such', () => {
  const pasta = pastaTemporaria();
  try {
    const { arquivos, trechos } = carregarArquivos(pasta);
    // Regras (instrucoes/) e conectores orientam o modelo e a busca; não são conhecimento pesquisável.
    assert.deepEqual(arquivos, ['01-contribuicoes.md', '10-faq.md', 'auto/convencoes.md']);
    assert.ok(!trechos.some(t => /segredo-readme|segredo-conector|Responda sempre/.test(t.texto)));
    assert.equal(trechos.find(t => t.arquivo === 'auto/convencoes.md')?.tipo, 'autogerado');
    assert.equal(regrasDoCerebro(pasta), 'Responda sempre com fontes.');
    assert.ok(trechosDoCerebro(pasta).length >= 4);
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});
test('search finds the passage by section title, triggers and text, and ignores unrelated questions', () => {
  const pasta = pastaTemporaria();
  try {
    const trechos = carregarArquivos(pasta).trechos;
    assert.equal(buscarNoCerebro('quando vence a contribuição associativa', 2, trechos)[0].trecho.secao, 'Quando vence a contribuição associativa?');
    assert.match(buscarNoCerebro('qual o piso da portaria', 2, trechos)[0].trecho.texto, /1\.912,07/);
    assert.equal(buscarNoCerebro('receita de bolo de cenoura', 2, trechos).length, 0);
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});
test('curated FAQ answers are returned verbatim only for equivalent questions', () => {
  const pasta = pastaTemporaria();
  try {
    const trechos = carregarArquivos(pasta).trechos;
    assert.equal(respostaDireta('Qual o endereço do SINDEPRESTEM?', trechos)?.texto, 'Av. São Luís, 258.');
    assert.equal(respostaDireta('qual é o endereço do sindeprestem', trechos)?.texto, 'Av. São Luís, 258.');
    assert.match(respostaDireta('Qual o horário de atendimento?', trechos)?.texto ?? '', /08:30/);
    assert.equal(respostaDireta('Qual o endereço do restaurante favorito do presidente?', trechos), undefined);
    assert.equal(respostaDireta('boleto', trechos), undefined);
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});
test('golden questions are read with their expected and forbidden snippets', () => {
  const casos = lerCasos('## Qual o endereço?\nespera: Av. São Luís | 258\n\n## Posso demitir?\nespera: Setor Jurídico\nnao: 40%\n\n## Sem esperado\nnada');
  assert.deepEqual(casos, [{ pergunta: 'Qual o endereço?', espera: ['Av. São Luís', '258'], nao: [] }, { pergunta: 'Posso demitir?', espera: ['Setor Jurídico'], nao: ['40%'] }]);
});

test('golden questions keep categories, accept forbidden-only cases and ignore ### group titles', () => {
  const casos = lerCasos('### Grupo\n\n## Pode inventar CNPJ?\nnao: /0001-\ncategoria: sem-fonte\n\n## Qual o telefone?\nespera: 3215-8250\ncategoria: contatos');
  assert.deepEqual(casos, [{ pergunta: 'Pode inventar CNPJ?', espera: [], nao: ['/0001-'], categoria: 'sem-fonte' }, { pergunta: 'Qual o telefone?', espera: ['3215-8250'], nao: [], categoria: 'contatos' }]);
});
test('the extended evaluation files are well formed and their paraphrase targets still exist in the brain', () => {
  const norm = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').toLowerCase();
  const ouro = carregarCasos('perguntas-ouro-ampliado.md'); const adversarial = carregarCasos('adversariais.md');
  assert.ok(ouro.length >= 60 && ouro.every(c => c.espera.length && c.categoria), 'perguntas-ouro-ampliado.md');
  assert.ok(adversarial.length >= 20 && adversarial.every(c => c.categoria), 'adversariais.md');
  const secoes = carregarArquivos().trechos.map(t => norm(t.secao));
  const reserva = readFileSync(arquivoDeCasos('parafrases-reserva-2.md'), 'utf8').replace(/\r\n/g, '\n').split(/^## /m).slice(1);
  assert.ok(reserva.length >= 60);
  for (const bloco of reserva) {
    const alvos = (bloco.match(/^secao:\s*(.+)$/m)?.[1] ?? '').split('|').map(a => norm(a.trim())).filter(Boolean);
    assert.ok(alvos.length, `sem secao: ${bloco.split('\n')[0]}`);
    assert.ok(alvos.some(a => secoes.some(s => s.includes(a))), `alvo inexistente no cérebro: ${bloco.split('\n')[0]} -> ${alvos.join(' | ')}`);
  }
});
test('personal data and secrets are detected and removed, without flagging legitimate questions', async () => {
  const { contemDadosSensiveis, redigirDadosSensiveis } = await import('../src/lib/knowledge/grounded');
  for (const texto of ['Meu CPF é 123.456.789-09, guarde isso', 'meu cpf 12345678909', 'Minha senha do banco é 4455, pode anotar?', 'my password is abc123', 'token: ghp9981xyz', 'cartão 4111 1111 1111 1111 validade 12/30', 'o cvv é 123'])
    assert.equal(contemDadosSensiveis(texto), true, texto);
  for (const texto of ['Qual o telefone (11) 3215-8250?', 'Ligue 11 99205-3371', 'Qual o piso de R$ 1.912,07 da Lei 6.019/74?', 'capital social de R$ 4.000.000,01 até R$ 6.000.000,00', 'A senha de acesso é obrigatória para a área restrita?', 'Qual o teto de 1.600 colaboradores?', 'Av. São Luís, 258, CEP 01046-001'])
    assert.equal(contemDadosSensiveis(texto), false, texto);
  assert.equal(redigirDadosSensiveis('Meu CPF é 123.456.789-09 e quero saber o endereço'), 'Meu CPF é [dado sensível removido] e quero saber o endereço');
  assert.doesNotMatch(redigirDadosSensiveis('Minha senha do banco é 4455'), /4455/);
  // Nenhuma pergunta legítima dos conjuntos de avaliação pode ser tratada como dado sensível.
  for (const arquivo of ['perguntas-ouro.md', 'perguntas-ouro-ampliado.md', 'parafrases.md', 'parafrases-reserva.md', 'parafrases-reserva-2.md'])
    for (const bloco of readFileSync(arquivoDeCasos(arquivo), 'utf8').replace(/\r\n/g, '\n').split(/^## /m).slice(1)) { const pergunta = bloco.split('\n')[0]; assert.equal(contemDadosSensiveis(pergunta), false, pergunta); }
});

test('the scope gate lets every evaluation question through and refuses unrelated ones, even when a weak search hit exists', async () => {
  const { foraDoEscopo, lacunaConhecida } = await import('../src/lib/knowledge/grounded');
  const recusadas: string[] = [];
  for (const arquivo of ['perguntas-ouro.md', 'perguntas-ouro-ampliado.md', 'parafrases.md', 'parafrases-reserva.md', 'parafrases-reserva-2.md'])
    for (const bloco of readFileSync(arquivoDeCasos(arquivo), 'utf8').replace(/\r\n/g, '\n').split(/^## /m).slice(1)) { const pergunta = bloco.split('\n')[0].trim(); if (foraDoEscopo(pergunta)) recusadas.push(pergunta); }
  assert.deepEqual(recusadas, []);
  for (const q of ['Qual a previsão do tempo para amanhã em São Paulo?', 'Quem ganhou o campeonato paulista?', 'Me dê uma receita de bolo de cenoura.', 'Qual a cotação do dólar hoje?', 'Quem é o prefeito de São Paulo?', 'Qual o melhor restaurante de São Paulo?'])
    assert.equal(foraDoEscopo(q), true, q);
  // Perguntas de continuação herdam o assunto das mensagens anteriores (a rota concatena as perguntas do usuário).
  assert.equal(foraDoEscopo('e o da noite?'), true, 'sozinha, a continuação não tem assunto');
  assert.equal(foraDoEscopo('Qual o piso da portaria? e o da noite?'), false);
  // Lacunas conhecidas: sem o dado nas evidências, o modelo recebe a situação "sem fonte"; com o dado, responde normalmente.
  assert.equal(lacunaConhecida('Qual o CNPJ do SINDEPRESTEM?', 'limitada a 1.600 colaboradores por CNPJ'), true);
  assert.equal(lacunaConhecida('Qual o CNPJ do SINDEPRESTEM?', 'CNPJ 12.345.678/0001-95'), false);
  assert.equal(lacunaConhecida('Qual o salário do presidente do sindicato?', 'Vander Morales é o presidente'), true);
  assert.equal(lacunaConhecida('Qual o piso do porteiro?', 'Porteiro R$ 1.912,07'), false);
});
test('individual legal cases are recognized, but not budget cost questions', async () => {
  const { casoJuridicoIndividual, notaDaSituacao, trechoDeContato } = await import('../src/lib/knowledge/grounded');
  assert.equal(casoJuridicoIndividual('Qual a multa por descumprir a convenção da Portaria?'), true);
  assert.equal(casoJuridicoIndividual('Quanto é a multa do FGTS nos encargos do orçamento?'), false);
  assert.equal(casoJuridicoIndividual('Fui processado em uma ação trabalhista, o que devo fazer?'), true);
  // Nenhuma situação vira texto fixo: o servidor entrega uma nota ao modelo e o contato como fonte.
  assert.match(notaDaSituacao('caso-juridico'), /Setor Jurídico/); assert.match(notaDaSituacao('dados-sensiveis'), /não envie|não guarda nem usa/i);
  assert.match(trechoDeContato().content, /3215-8250/); assert.match(trechoDeContato().url, /contato/);
});

test('FAQ sections accept paraphrases through "Variações:" and the variation line is not part of the answer', () => {
  const faq = `---\ntitulo: FAQ\ntipo: curado\ndireta: sim\n---\n\n## Como o SINDEPRESTEM pode ajudar minha empresa? Quais os benefícios?\nVariações: Como o sindicato pode ajudar uma empresa filiada? | O que o sindicato oferece?\nAssessoria jurídica ilimitada e cursos.\n`;
  const { cabecalho, corpo } = lerCabecalho(faq); const trechos = dividirEmTrechos(corpo, 'faq.md', cabecalho);
  assert.equal(respostaDireta('Como o sindicato pode ajudar uma empresa filiada?', trechos)?.texto, 'Assessoria jurídica ilimitada e cursos.');
  assert.equal(respostaDireta('Olá, o que o sindicato oferece?', trechos)?.texto, 'Assessoria jurídica ilimitada e cursos.');
  assert.equal(respostaDireta('Como o sindicato pode ajudar a abrir uma padaria?', trechos), undefined);
});
test('questions unrelated to the sector are flagged out of scope, while sector, writing and translation questions pass through', async () => {
  const { foraDoEscopo } = await import('../src/lib/knowledge/grounded');
  assert.equal(foraDoEscopo('Qual o preço de um carro zero?'), true);
  assert.equal(foraDoEscopo('What is the best pizza in town?'), true);
  for (const q of ['Quanto é o piso da portaria?', 'Posso contratar um temporário?', 'Redija um e-mail sobre feriados', 'Traduza este texto para inglês', 'Qual a Selic?', 'ok', 'Como organizar uma apresentação para a diretoria?', 'Me ajude com um e-mail']) assert.equal(foraDoEscopo(q), false, q);
});
test('position questions list the president\'s articles and news on the topic, in the entity\'s own words', async () => {
  const { openDb, upsertDocument } = await import('../src/lib/dados/db');
  const { posicionamentoPassages } = await import('../src/lib/dados/painel');
  const diretorio = mkdtempSync(path.join(tmpdir(), 'sindi-cerebro-pos-')); const arquivo = path.join(diretorio, 'dados.sqlite');
  try {
    const db = openDb(arquivo); const SITE = 'https://www.sindeprestem.com.br';
    upsertDocument(db, { source: 'sindeprestem', url: `${SITE}/post/escala`, title: 'Artigo - Fim da escala 6x1', content: 'Ninguém é contra trabalhar menos, mas o método importa. Por Vander Morales', publishedAt: '2026-06-01T12:00:00.000Z', meta: { section: 'artigo' } });
    upsertDocument(db, { source: 'sindeprestem', url: `${SITE}/post/curso`, title: 'Curso sobre jornada', content: 'Curso presencial sobre jornada e controle de ponto.', publishedAt: '2026-05-01T12:00:00.000Z', meta: { section: 'noticia' } });
    db.close();
    const passagens = posicionamentoPassages('Qual o posicionamento do sindicato sobre a escala 6x1?', 'pt', arquivo).passages;
    const resposta = passagens.map(p => `${p.title} ${p.content}`).join(' ');
    assert.match(resposta, /Fim da escala 6x1/); assert.match(resposta, /Ninguém é contra trabalhar menos/); assert.doesNotMatch(resposta, /Curso sobre jornada/); assert.doesNotMatch(resposta, /Por Vander Morales/);
    assert.match(passagens[0].url, /post\/escala/);
    assert.match(posicionamentoPassages('Qual a opinião do sindicato sobre criptomoedas?', 'pt', arquivo).semResposta ?? '', /Não encontrei artigos ou notícias/);
    assert.deepEqual(posicionamentoPassages('Qual o telefone do sindicato?', 'pt', arquivo), { passages: [] });
  } finally { rmSync(diretorio, { recursive: true, force: true }); }
});

test('auto-generated files are published only when valid and are rolled back when the evaluation gets worse', async () => {
  const { publicarCerebro, MINIMOS } = await import('../src/lib/cerebro/publicar');
  const { readFileSync, existsSync } = await import('node:fs');
  const pasta = mkdtempSync(path.join(tmpdir(), 'sindi-cerebro-pub-')); const anteriorEnv = process.env.SINDI_CEREBRO_DIR; process.env.SINDI_CEREBRO_DIR = pasta;
  mkdirSync(path.join(pasta, 'auto'));
  const arquivosValidos = (marca: string) => Object.fromEntries(Object.entries(MINIMOS).map(([nome, minimo]) => [nome, `---\natualizado: 2026-10-13\n---\n${marca} `.padEnd(minimo + 50, 'x')]));
  const caso = (pergunta: string, ok: boolean) => ({ pergunta, ok, origem: 'direta', faltam: [], proibidos: [], evidencia: '' });
  const db = {} as never; const logs: string[] = [];
  try {
    for (const [nome, texto] of Object.entries(arquivosValidos('antigo'))) writeFileSync(path.join(pasta, 'auto', nome), texto);
    // 1) arquivo pequeno demais: nada muda
    const pequeno = await publicarCerebro(db, m => logs.push(m), { gerar: () => ({ ...arquivosValidos('novo'), 'convencoes.md': 'vazio' }), avaliar: async () => [caso('a', true)] });
    assert.equal(pequeno.publicado, false); assert.match(readFileSync(path.join(pasta, 'auto', 'convencoes.md'), 'utf8'), /antigo/);
    // 2) sem mudanças (só a data muda): não reavalia
    let avaliacoes = 0;
    const igual = await publicarCerebro(db, () => {}, { gerar: () => Object.fromEntries(Object.entries(arquivosValidos('antigo')).map(([n, t]) => [n, t.replace('2026-10-13', '2026-10-14')])), avaliar: async () => { avaliacoes++; return []; } });
    assert.equal(igual.motivo, 'sem mudanças'); assert.equal(avaliacoes, 0);
    // 3) piora uma pergunta que passava: restaura
    let chamada = 0;
    const regressao = await publicarCerebro(db, m => logs.push(m), { gerar: () => arquivosValidos('novo'), avaliar: async () => (++chamada === 1 ? [caso('a', true), caso('b', true)] : [caso('a', true), caso('b', false)]) });
    assert.equal(regressao.publicado, false); assert.match(readFileSync(path.join(pasta, 'auto', 'convencoes.md'), 'utf8'), /antigo/); assert.ok(logs.some(l => /piorou 1 pergunta/.test(l)));
    // 4) melhora ou mantém: publica
    chamada = 0;
    const bom = await publicarCerebro(db, m => logs.push(m), { gerar: () => arquivosValidos('novo'), avaliar: async () => (++chamada === 1 ? [caso('a', true), caso('b', false)] : [caso('a', true), caso('b', true)]) });
    assert.equal(bom.publicado, true); assert.match(readFileSync(path.join(pasta, 'auto', 'convencoes.md'), 'utf8'), /novo/); assert.ok(existsSync(path.join(pasta, 'auto.anterior')));
  } finally { if (anteriorEnv === undefined) delete process.env.SINDI_CEREBRO_DIR; else process.env.SINDI_CEREBRO_DIR = anteriorEnv; rmSync(pasta, { recursive: true, force: true }); }
});

test('hybrid search finds a passage by meaning when the words do not match, and falls back to words without embeddings', async () => {
  const { buscarHibrido } = await import('../src/lib/cerebro/buscar');
  const { cosseno, indexarCerebro, idDoTrecho } = await import('../src/lib/cerebro/embeddings');
  const pasta = mkdtempSync(path.join(tmpdir(), 'sindi-cerebro-emb-')); const antes = { dados: process.env.SINDI_DATA_DIR, fetch: globalThis.fetch };
  process.env.SINDI_DATA_DIR = pasta;
  const trechos = dividirEmTrechos(`## Telefone e horário de atendimento\nLigue para (11) 3215-8250 de segunda a sexta.\n\n## Contribuição associativa\nVence todo dia 15 conforme o capital social.`, 'faq.md', { gatilhos: [], tipo: 'curado', prioridade: 1, direta: false, semantica: true });
  // Embeddings de mentira: um eixo para "contato" e outro para "dinheiro".
  const eixo = (texto: string) => { const t = texto.toLowerCase(); return [/telefone|ligue|falar|contato|atend/.test(t) ? 1 : 0, /contribui|capital|pagam|mensal|pagar/.test(t) ? 1 : 0, 0.05]; };
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => { const { input } = JSON.parse(String(init?.body)) as { input: string[] }; return Response.json({ embeddings: input.map(eixo) }); }) as typeof fetch;
  try {
    assert.ok(Math.abs(cosseno([1, 0], [1, 0]) - 1) < 1e-9); assert.equal(cosseno([1, 0], [0, 1]), 0); assert.equal(idDoTrecho(trechos[0]), idDoTrecho(trechos[0]));
    assert.equal((await indexarCerebro(trechos)).novos, 2); assert.equal((await indexarCerebro(trechos)).novos, 0);
    // "Como faço para falar com vocês?" não compartilha palavras úteis com o texto, mas tem o mesmo significado de contato.
    const achado = await buscarHibrido('Como faço para falar com vocês?', 1, trechos, 0.5);
    assert.equal(achado[0]?.trecho.secao, 'Telefone e horário de atendimento');
    globalThis.fetch = (async () => { throw new Error('Ollama fora do ar'); }) as typeof fetch;
    assert.equal((await buscarHibrido('contribuição associativa vence quando', 1, trechos, 0.5))[0]?.trecho.secao, 'Contribuição associativa');
  } finally { globalThis.fetch = antes.fetch; if (antes.dados === undefined) delete process.env.SINDI_DATA_DIR; else process.env.SINDI_DATA_DIR = antes.dados; rmSync(pasta, { recursive: true, force: true }); }
});

test('the fact checker blocks e-mails, sites, phones, amounts and laws that are not in the sources', async () => {
  const { verificarFatos } = await import('../src/lib/knowledge/grounded');
  const fontes = 'Piso de Porteiro R$ 1.912,07. Setor Jurídico: juridico@sindeprestem.com.br. A Lei nº 6.019/1974 regula o trabalho temporário. Telefone (11) 3215-8250.';
  assert.deepEqual(verificarFatos('O piso é R$ 1.912,07 (Lei 6.019). Escreva para juridico@sindeprestem.com.br ou ligue (11) 3215-8250. Veja www.sindeprestem.com.br/contato e www.tst.jus.br.', fontes), { ok: true, inventados: [] });
  assert.equal(verificarFatos('Sem fatos específicos, apenas orientações gerais.', fontes).ok, true);
  for (const [resposta, inventado] of [['Escreva para sindicatosp@gmail.com.', 'sindicatosp@gmail.com'], ['Acesse www.sindipredestsp.com.br.', 'www.sindipredestsp.com.br'], ['Ligue (11) 4002-8922.', '(11) 4002-8922'],
    ['O piso é R$ 2.500,00.', 'R$ 2.500,00'], ['Conforme a Lei nº 1.234/2020.', '1.234']]) {
    const v = verificarFatos(resposta, fontes); assert.equal(v.ok, false, resposta); assert.ok(v.inventados.includes(inventado), `${resposta} -> ${v.inventados}`);
  }
});

test('contribution questions with a capital or head count get only the matching table row, with the due dates', async () => {
  const { capitalDaPergunta, colaboradoresDaPergunta, faixasDeContribuicao } = await import('../src/lib/cerebro/faixas');
  assert.equal(capitalDaPergunta('Quanto pago com capital social de R$ 800 mil?'), 800000);
  assert.equal(capitalDaPergunta('empresa com capital social de R$ 1,5 milhão'), 1500000);
  assert.equal(capitalDaPergunta('capital social de R$ 4.000.000,01'), 4000000.01);
  assert.equal(capitalDaPergunta('Qual a mensalidade?'), undefined);
  assert.equal(colaboradoresDaPergunta('empresa com 200 colaboradores'), 200);
  const faixas = faixasDeContribuicao('Qual a contribuição de uma empresa com capital social de R$ 800 mil e 200 colaboradores?').map(p => p.content).join('\n');
  assert.match(faixas, /634,00/); assert.match(faixas, /1\.122,00/); assert.match(faixas, /R\$ 250,00 por mês/); assert.match(faixas, /dia 15/);
  assert.doesNotMatch(faixas, /431,00|2\.589,00|6\.710,00/, 'as outras faixas ficam de fora');
  assert.match(faixasDeContribuicao('Quanto paga uma empresa sem colaboradores?').map(p => p.content).join(' '), /147,00/);
  assert.deepEqual(faixasDeContribuicao('Quando vence a contribuição?'), []);
  assert.deepEqual(faixasDeContribuicao('Qual o piso da portaria com capital social de R$ 800 mil?'), []);
});
