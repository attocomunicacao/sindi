import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { conectores, escolherConector, lerConector, pedeRelatorio, reiniciarCacheDosConectores } from '../src/lib/cerebro/conectores';
import { exemplos, lerExemplos, mensagemDoPedido, reiniciarCacheDasInstrucoes, sistema, textoDasFontes } from '../src/lib/cerebro/instrucoes';
import { cobertura, coberturaLocal, materialDoRelatorio, pesquisarNaBiblioteca, radical, termosDaPesquisa } from '../src/lib/biblioteca/pesquisa';
import { chaveDaResposta, guardarResposta, limparRespostasGuardadas, respostaGuardada } from '../src/lib/cache-respostas';
import { verificarFatos } from '../src/lib/knowledge/grounded';
import { openDb, setIndicator, upsertDocument } from '../src/lib/dados/db';

const CONECTOR = `---
titulo: RH, recrutamento e qualificação
gatilhos: rh, vaga*, processo seletivo, currículo*
estantes: cartilhas, noticias
relatorio: resumo executivo
modo: orientacao
palavras: 130
---

# RH

## Quando usar
Texto para a equipe, que não vai ao modelo.

## Como responder
Entregue um passo a passo numerado.

## Limites
Também não vai ao modelo.
`;
test('a connector file gives the area, the shelves to search and only the "Como responder" text for the model', () => {
  const conector = lerConector('05-rh-recrutamento.md', CONECTOR)!;
  assert.equal(conector.id, 'rh-recrutamento'); assert.deepEqual(conector.estantes, ['cartilhas', 'noticias']);
  assert.equal(conector.instrucao, 'Entregue um passo a passo numerado.'); assert.equal(conector.modo, 'orientacao'); assert.equal(conector.palavras, 130);
  assert.deepEqual(conector.gatilhos, ['rh', 'vaga*', 'processo seletivo', 'curriculo*']);
  assert.equal(pedeRelatorio(conector, 'Prepare um RESUMO EXECUTIVO das vagas'), true); assert.equal(pedeRelatorio(conector, 'Como divulgar uma vaga?'), false);
  // Sem gatilhos ou sem instrução o arquivo não vira conector; estantes vazias não engolem a linha seguinte.
  assert.equal(lerConector('x.md', '---\ntitulo: X\n---\n## Como responder\nTexto'), undefined);
  assert.deepEqual(lerConector('x.md', '---\ntitulo: X\ngatilhos: sindi\nestantes:\nmodo: fontes\n---\n## Como responder\nTexto')?.estantes, []);
});

test('the connector is chosen by trigger words, whole words and prefixes, and follow-up questions inherit the area', () => {
  const rh = lerConector('05-rh.md', CONECTOR)!;
  const custos = lerConector('06-custos.md', '---\ntitulo: Custos\ngatilhos: custo*, tribut*, reforma tributária\n---\n## Como responder\nListe os itens.')!;
  const todos = [rh, custos];
  assert.equal(escolherConector('Como organizar um processo seletivo para 80 vagas?', [], todos), rh);
  assert.equal(escolherConector('Quais os impactos da Reforma Tributária nos custos?', [], todos), custos);
  // "rh" só casa como palavra inteira: "trabalho" e "sindeprestem" não disparam o conector.
  assert.equal(escolherConector('O que é trabalho temporário?', [], todos), undefined);
  assert.equal(escolherConector('E para 200 pessoas?', ['Como organizar um processo seletivo?'], todos), rh);
  assert.equal(escolherConector('Explique em detalhes como funciona a contribuição associativa do sindicato para empresas filiadas', ['Como organizar um processo seletivo?'], todos), undefined);
});

test('the project connectors cover the six areas and route the training questions to the right one', () => {
  reiniciarCacheDosConectores();
  const todos = conectores(); const area = (pergunta: string) => escolherConector(pergunta, [], todos)?.id;
  assert.equal(todos.length, 7); assert.ok(todos.every(c => c.instrucao.length >= 80 && c.instrucao.length <= 420), 'a instrução de cada conector é curta');
  for (const [pergunta, esperado] of [
    ['O que mudou na estabilidade gestante e quais cuidados minha empresa deve adotar?', 'legislacao-e-seguranca-juridica'],
    ['Como a redução da jornada de trabalho pode afetar empresas de terceirização?', 'legislacao-e-seguranca-juridica'],
    ['Elabore um relatório mensal sobre o mercado de trabalho no setor de serviços.', 'inteligencia-setorial-e-relatorios'],
    ['Como a escassez de mão de obra afeta as empresas de prestação de serviços?', 'inteligencia-setorial-e-relatorios'],
    ['Preciso apresentar uma proposta de terceirização para 20 postos de trabalho. Quais informações devo levantar?', 'comercial-contratos-e-propostas'],
    ['Como organizar um processo seletivo para contratar 80 trabalhadores temporários em 15 dias?', 'rh-recrutamento-e-qualificacao'],
    ['Quais custos e tributos preciso considerar ao revisar o preço de um contrato de prestação de serviços?', 'custos-tributacao-e-planejamento'],
    ['Quais cursos, eventos e iniciativas estão disponíveis aos associados?', 'relacionamento-com-o-sindeprestem'],
    ['Você consegue acessar documentos confidenciais de outras empresas associadas?', 'sobre-a-sindi-e-limites'],
    ['Quais informações pessoais não devo inserir em uma consulta à SINDI?', 'sobre-a-sindi-e-limites'],
  ] as const) assert.equal(area(pergunta), esperado, pergunta);
  const setorial = todos.find(c => c.id === 'inteligencia-setorial-e-relatorios')!;
  assert.equal(pedeRelatorio(setorial, 'Prepare um resumo executivo com os principais acontecimentos do setor neste trimestre.'), true);
  assert.equal(pedeRelatorio(setorial, 'Como a escassez de mão de obra afeta as empresas?'), false);
});

test('rules and examples come first and never change between questions; the request carries orientation, sources and the question last', () => {
  reiniciarCacheDasInstrucoes();
  assert.match(sistema(), /SINDI/); assert.ok(sistema().length <= 2100, 'regras curtas: o modelo pequeno segue melhor poucas regras');
  assert.doesNotMatch(sistema(), /<!--|^---/m);
  const mensagens = exemplos();
  assert.ok(mensagens.length >= 4 && mensagens.length <= 8 && mensagens.length % 2 === 0);
  assert.ok(mensagens.every((m, i) => m.role === (i % 2 ? 'assistant' : 'user')));
  assert.ok(mensagens.filter(m => m.role === 'user').every(m => /^ORIENTAÇÃO: [\s\S]*\n\nFONTES:[\s\S]*\n\nPERGUNTA: /.test(m.content)));
  assert.ok(mensagens.some(m => m.role === 'assistant' && /Não consegui confirmar/.test(m.content)), 'há um exemplo de recusa');
  const lidos = lerExemplos('intro\n## A\norientacao: Explique.\npalavras: 40\nfontes:\n[1] Título\nTexto da fonte.\npergunta: O quê?\nresposta: Isto.\n\n## Sem resposta\npergunta: X?\n');
  assert.deepEqual(lidos, [{ orientacao: 'Explique.', palavras: 40, fontes: '[1] Título\nTexto da fonte.', pergunta: 'O quê?', resposta: 'Isto.' }]);
  const fontes = [{ url: 'u', title: 'Primeira', content: 'a'.repeat(3000), fetchedAt: '' }, { url: 'u2', title: 'Segunda', content: 'b'.repeat(3000), fetchedAt: '' }];
  assert.ok(textoDasFontes(fontes, 1900).length < 2000, 'as fontes respeitam o orçamento de leitura');
  const pedido = mensagemDoPedido({ orientacao: 'Explique.', palavras: 70, nota: '\nSITUAÇÃO: teste\n', fontes: [], pergunta: 'Qual o prazo?' });
  assert.equal(pedido, 'ORIENTAÇÃO: Explique. Responda em até 70 palavras.\n\nSITUAÇÃO: teste\n\nFONTES: nenhuma.\n\nPERGUNTA: Qual o prazo?');
});

test('the library search reads the shelves of the connector, prefers recent texts and returns nothing for absent subjects', () => {
  const pasta = mkdtempSync(path.join(tmpdir(), 'sindi-pesquisa-')); const arquivo = path.join(pasta, 'dados.sqlite');
  try {
    const db = openDb(arquivo);
    const noticia = (slug: string, title: string, content: string, publishedAt: string, section = 'noticia') => upsertDocument(db, { source: 'sindeprestem', url: `https://www.sindeprestem.com.br/post/${slug}`, title, content, publishedAt, meta: { section } });
    noticia('gestante-2021', 'Judiciário obriga INSS a pagar salário a gestantes', 'Decisão de 2021 sobre gestantes afastadas na pandemia. A estabilidade não foi tratada.', '2021-07-16T12:00:00.000Z');
    noticia('gestante-2026', 'Artigo - Estabilidade da gestante no trabalho temporário', 'Por Vander Morales\nO artigo trata da estabilidade da gestante no trabalho temporário e da insegurança jurídica para as empresas.', '2026-05-29T12:00:00.000Z', 'artigo');
    noticia('nr1-stf', 'Fenaserhtt participa de audiência no STF sobre regras da NR-1', 'A federação participou de audiência pública no STF sobre a NR-1 e os riscos psicossociais.', '2026-09-16T12:00:00.000Z');
    noticia('nr10', 'Curso de NR-10 para eletricistas', 'Treinamento de NR-10.', '2026-09-10T12:00:00.000Z');
    upsertDocument(db, { source: 'sindeprestem', url: 'https://www.sindeprestem.com.br/noticias/page/3', title: 'Notícias | Sindeprestem | Página 3', content: 'estabilidade gestante trabalho temporário listagem', meta: { section: 'noticia', listing: true } });
    setIndicator(db, { id: 'bcb.selic-meta', source: 'bcb', group: 'juros', label: 'Meta Selic', value: 15, unit: '% a.a.', period: '2026-10', previous: 15, url: 'https://www.bcb.gov.br' });
    db.close();
    const achados = pesquisarNaBiblioteca('O que mudou na estabilidade gestante e quais cuidados minha empresa deve adotar?', ['artigos', 'noticias'], { arquivo, agora: new Date('2026-10-13') });
    assert.equal(achados[0].title, 'Estabilidade da gestante no trabalho temporário'); assert.match(achados[0].content, /^Artigo do presidente do SINDEPRESTEM em 29\/05\/2026\. /);
    assert.doesNotMatch(achados.map(a => a.content).join(' '), /Por Vander Morales|listagem/);
    // A NR citada é obrigatória: NR-10 não responde a uma pergunta sobre a NR-1.
    const nr = pesquisarNaBiblioteca('O que o Sindeprestem está fazendo em relação à NR-1?', ['noticias'], { arquivo });
    assert.deepEqual(nr.map(a => a.title), ['Fenaserhtt participa de audiência no STF sobre regras da NR-1']);
    assert.deepEqual(pesquisarNaBiblioteca('Qual a previsão do tempo em Marte?', ['noticias', 'artigos'], { arquivo }), []);
    // Texto com mais de três anos só entra quando não há nada recente, e nunca quando quem chama o dispensa.
    assert.equal(pesquisarNaBiblioteca('Judiciário obriga INSS a pagar salário a gestantes', ['noticias'], { arquivo, agora: new Date('2026-10-13') }).length, 1);
    assert.deepEqual(pesquisarNaBiblioteca('Judiciário obriga INSS a pagar salário a gestantes', ['noticias'], { arquivo, agora: new Date('2026-10-13'), antigos: false }), []);
    assert.deepEqual(pesquisarNaBiblioteca('estabilidade gestante', ['estante-inexistente'], { arquivo }), []);
    const relatorio = materialDoRelatorio('Elabore um relatório mensal', arquivo);
    // O sentido do número já vem escrito na fonte (igual, subiu, caiu, abriu, fechou): o modelo pequeno copia a frase em vez de interpretar o sinal.
    assert.match(relatorio[0].content, /Meta Selic: 15,00 % a\.a\. \(2026-10\); igual ao valor anterior \(15,00\)\. Fonte: Banco Central\./); assert.ok(relatorio.some(b => /Publicações recentes/.test(b.title)));
  } finally { rmSync(pasta, { recursive: true, force: true }); }
  assert.deepEqual(termosDaPesquisa('Quais são os principais impactos da Reforma Tributária para o setor de serviços?'), ['reforma', 'tributaria', 'setor', 'servicos']);
  assert.equal(radical('tributaria'), 'tributar'); assert.equal(radical('custos'), 'custo'); assert.equal(radical('iss'), 'iss');
  assert.equal(cobertura(['reforma', 'tributaria'], 'A reforma dos tributos e o regime tributário'), 1); assert.equal(cobertura(['reforma', 'jornada'], 'reforma'), 0.5);
  // Num documento longo, termos espalhados não bastam: precisam aparecer perto uns dos outros.
  const cartilha = `organizar ${'x '.repeat(2000)} apresentação ${'y '.repeat(2000)} equipe`;
  assert.equal(cobertura(['organizar', 'apresentacao', 'equipe'], cartilha), 1); assert.ok(coberturaLocal(['organizar', 'apresentacao', 'equipe'], 'Cartilha', cartilha) < 0.5);
  assert.equal(cobertura(['gestante', 'equipe'], 'a equipe econômica', [5, 1]), 1 / 6);
});

test('numbers the model writes must come from the sources or from the question', () => {
  const fontes = 'A jornada é de 8 horas diárias e 44 semanais. O custo pode subir até 27,5%, segundo nota de 19/02/2026. Saldo de 1.234 vagas.';
  assert.equal(verificarFatos('A jornada é de 44 horas semanais; o custo pode subir 27,5% (nota de 19/02/2026), com saldo de 1.234 vagas.', fontes).ok, true);
  assert.deepEqual(verificarFatos('O custo pode subir 35,5%.', fontes).inventados, ['35,5%']);
  assert.deepEqual(verificarFatos('Foram criadas 250 mil vagas em 2019.', fontes).inventados, ['250', '2019']);
  // Listas numeradas, números pequenos e os números da própria pergunta não são invenção.
  assert.equal(verificarFatos('1. Defina o perfil.\n2. Divulgue.\n10. Integre as 80 pessoas em 15 dias, em 3 turmas.', '', 'Como contratar 80 temporários em 15 dias?').ok, true);
  assert.equal(verificarFatos('Para 120 postos, levante as funções.', '', 'Proposta para 120 postos').ok, true);
});

test('an answer already written for the same rules, sources and question is reused from memory only', () => {
  limparRespostasGuardadas();
  const chave = chaveDaResposta('sindi', 'regras', 'pedido'); assert.match(chave, /^[0-9a-f]{64}$/);
  assert.notEqual(chave, chaveDaResposta('sindi', 'regras', 'pedido com outra fonte')); assert.notEqual(chave, chaveDaResposta('outro-modelo', 'regras', 'pedido'));
  assert.equal(respostaGuardada(chave), undefined);
  guardarResposta(chave, 'Resposta escrita pelo modelo.', 1000);
  assert.equal(respostaGuardada(chave, 2000), 'Resposta escrita pelo modelo.');
  assert.equal(respostaGuardada(chave, 1000 + 23 * 60 * 60 * 1000), 'Resposta escrita pelo modelo.');
  assert.equal(respostaGuardada(chave, 1000 + 25 * 60 * 60 * 1000), undefined, 'expira em 24 horas');
});
