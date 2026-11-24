import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularImpacto } from '@/lib/jornada42/impacto';
import { PERFIS, roteiroDoPerfil } from '@/lib/jornada42/roteiro';
import { nomeDaEmpresa, textoDoComunicado } from '@/lib/jornada42/comunicados';
import { impactoDaJornada, pedeImpactoDaJornada } from '@/lib/jornada42/ferramenta';
import { executarFerramentas } from '@/lib/ferramentas/registro';

test('impacto: o exemplo do Planalto (R$ 3.000) dá 13,64, 14,29 e 15,00, com variação de 4,76% e 10,00%', () => {
  const [a, b, c] = calcularImpacto({ salario: 3000 })!.cenarios;
  assert.deepEqual([a.salarioHora, b.salarioHora, c.salarioHora], [13.64, 14.29, 15]);
  assert.deepEqual([a.variacaoPercentual, b.variacaoPercentual, c.variacaoPercentual], [0, 4.76, 10]);
  assert.deepEqual([a.divisor, b.divisor, c.divisor], [220, 210, 200]);
});

test('impacto: extras e noturno saem do valor exato e fecham em centavos', () => {
  const [, b] = calcularImpacto({ salario: 3000, horasExtras50: 10, horasExtras100: 2, horasNoturnas: 20 })!.cenarios;
  assert.equal(b.horaExtra50, 21.43);
  assert.equal(b.totalExtras50, 214.29);
  assert.equal(b.totalExtras100, 57.14);
  assert.equal(b.totalNoturno, 57.14);
  assert.equal(b.totalVariaveis, 328.57);
});

test('impacto: entrada inválida devolve undefined', () => {
  for (const salario of [0, -1, NaN, Infinity, 2_000_000]) assert.equal(calcularImpacto({ salario }), undefined);
  assert.equal(calcularImpacto({ salario: 1000, horasExtras50: -1 }), undefined);
  assert.equal(calcularImpacto({ salario: 1000, horasNoturnas: 745 }), undefined);
});

test('roteiro: passos-base e divisor sempre presentes, perguntas marcadas na ordem, cada passo com referência', () => {
  const sem = roteiroDoPerfil('contratos-publicos', []);
  assert.deepEqual(
    sem.map((p) => p.id),
    ['datas', 'salario', 'divisor'],
  );
  const com = roteiroDoPerfil('contratos-publicos', ['pequena', 'aditivo']);
  assert.deepEqual(
    com.map((p) => p.id),
    ['datas', 'salario', 'aditivo', 'pequena', 'divisor'],
  );
  for (const perfil of PERFIS)
    for (const p of roteiroDoPerfil(
      perfil.id,
      perfil.perguntas.map((q) => q.id),
    )) {
      assert.ok(p.referencia.length > 0, `${perfil.id}/${p.id} sem referência`);
      assert.match(p.referencia, /EC 141|Planalto/);
    }
  assert.ok(
    !roteiroDoPerfil('temporario', ['aditivo']).some((p) => p.id === 'aditivo'),
    'pergunta de outro perfil é ignorada',
  );
});

test('roteiro: perfis de terceirização e temporário dizem que a emenda não os menciona', () => {
  for (const id of ['contratos-publicos', 'contratos-privados', 'temporario'] as const)
    assert.match(PERFIS.find((p) => p.id === id)!.nota, /não menciona/);
});

test('comunicados: nome parametrizado e saneado, aviso de revisão e vigência', () => {
  const t = textoDoComunicado('tomador', '  Acme\n\tServiços  ');
  assert.match(t, /A Acme Serviços informa/);
  assert.match(t, /16\/12\/2026/);
  assert.match(t, /Modelo geral, revise com o jurídico/);
  assert.match(t, /válido até 31\/12\/2026/);
  assert.match(textoDoComunicado('empregados', ''), /\[nome da empresa\]/);
  assert.equal(nomeDaEmpresa('x'.repeat(500)).length, 120);
  assert.doesNotMatch(nomeDaEmpresa('a\u0000b'), /\u0000/);
});

test('chat: reconhece o pedido de impacto da Jornada 42 e ignora o resto', async () => {
  assert.ok(pedeImpactoDaJornada('Qual o impacto da jornada 42 no posto?'));
  assert.ok(!pedeImpactoDaJornada('Qual o telefone do sindicato?'));
  assert.ok(!pedeImpactoDaJornada('Quanto custa um posto de limpeza?'));
  const r = await executarFerramentas('Qual o impacto da jornada 42 no posto?', {});
  assert.equal(r[0]?.ferramenta?.id, 'jornada-42');
  assert.equal(r[0].url, '/jornada-42');
  assert.match(r[0].content, /R\$ 13,64/);
  assert.match(r[0].content, /R\$ 14,29/);
  assert.match(r[0].content, /R\$ 15,00/);
  assert.match(r[0].content, /4,76%/);
  assert.match(r[0].content, /exemplo do Planalto/);
  assert.match(r[0].content, /não menciona a terceirização/);
  assert.match(r[0].content, /custo, não preço/);
});

test('chat: usa o salário da pergunta quando há um', () => {
  const p = impactoDaJornada('impacto da jornada 42 no posto com salário de R$ 2.100,00')!;
  assert.match(p.content, /Salário mensal informado: R\$ 2\.100,00/);
  assert.match(p.content, /R\$ 9,55/);
  assert.match(p.content, /R\$ 10,50/);
});

test('chat: o salário informado pelo usuário nunca é chamado de exemplo do Planalto (a orientação só deixa isso para a fonte dizer)', async () => {
  const informado = await executarFerramentas(
    'Qual o impacto da jornada 42 no posto de um salário de R$ 2.100,00?',
    {},
  );
  assert.match(informado[0].content, /Salário mensal informado: R\$ 2\.100,00/);
  assert.doesNotMatch(informado[0].content, /exemplo do Planalto/);
  assert.match(informado[0].ferramenta!.orientacao, /só chame o salário de exemplo do Planalto se a fonte disser/i);
  const semSalario = await executarFerramentas('Qual o impacto da jornada 42 no posto?', {});
  assert.match(semSalario[0].content, /vale o exemplo do Planalto/);
});
