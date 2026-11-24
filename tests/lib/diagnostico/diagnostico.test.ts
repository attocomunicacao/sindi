import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ATUALIZADO_EM, PERGUNTAS, TEMAS, VALIDO_ATE } from '@/lib/diagnostico/perguntas';
import {
  LIMIARES,
  OPCOES,
  PONTOS,
  diagnosticar,
  faltam,
  semaforoDe,
  type Resposta,
  type Respostas,
} from '@/lib/diagnostico/pontuacao';
import { nivelDaUrl } from '@/lib/fontes/fiscalizador';
import { conteudoVencido, textoDeVigencia } from '@/lib/produtos/avisos';

const todas = (r: Resposta): Respostas => Object.fromEntries(PERGUNTAS.map((p) => [p.id, r]));

test('perguntas: são 15, com ids únicos, 3 por tema e todas ligadas a um tema existente', () => {
  assert.equal(PERGUNTAS.length, 15);
  assert.equal(new Set(PERGUNTAS.map((p) => p.id)).size, 15);
  for (const t of TEMAS) assert.equal(PERGUNTAS.filter((p) => p.tema === t.id).length, 3, t.id);
  for (const p of PERGUNTAS)
    assert.ok(
      TEMAS.some((t) => t.id === p.tema),
      p.id,
    );
});

test('fontes: toda pergunta cita ao menos uma fonte https de domínio oficial, com artigo ou item no rótulo', () => {
  for (const p of PERGUNTAS) {
    assert.ok(p.fontes.length >= 1, `${p.id} sem fonte`);
    for (const f of p.fontes) {
      assert.ok(f.url.startsWith('https://'), `${p.id}: ${f.url}`);
      assert.equal(nivelDaUrl(f.url), 'oficial', `${p.id}: ${f.url}`);
      assert.match(f.rotulo, /art\.|item|itens|Portaria/, `${p.id}: rótulo sem artigo ou item`);
    }
    assert.ok(p.texto.endsWith('?') && p.fato.length > 40 && p.acao.length > 40, p.id);
  }
});

test('texto: nada de preço ou margem nem de garantia de conformidade', () => {
  const todo = PERGUNTAS.map((p) => `${p.texto} ${p.fato} ${p.acao}`).join(' ');
  assert.doesNotMatch(todo, /\b(margem|bdi|preço de venda|recomendamos cobrar)\b/i);
  assert.doesNotMatch(todo, /\b(est[áa] em conformidade|garante a conformidade)\b/i);
});

test('vigência: atualizado em 2026-11-24, válido até 2026-12-31, e o aviso de validade funciona', () => {
  assert.equal(ATUALIZADO_EM, '2026-11-24');
  assert.equal(VALIDO_ATE, '2026-12-31');
  assert.equal(textoDeVigencia(ATUALIZADO_EM, VALIDO_ATE), 'Atualizado em 24/11/2026; válido até 31/12/2026.');
  assert.equal(conteudoVencido(VALIDO_ATE, new Date('2026-12-31T12:00:00Z')), false);
  assert.equal(conteudoVencido(VALIDO_ATE, new Date('2027-01-01T12:00:00Z')), true);
});

test('pontuação: sim = 0, em parte = 1, não = 2, não sei = 2, não se aplica = 0', () => {
  assert.deepEqual(PONTOS, { sim: 0, parcial: 1, nao: 2, 'nao-sei': 2, 'nao-se-aplica': 0 });
  assert.deepEqual(
    OPCOES.map((o) => o.valor),
    Object.keys(PONTOS),
  );
});

test('limiares: fronteiras exatas por tema e no geral', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 6].map((n) => semaforoDe(n, LIMIARES.tema)),
    ['verde', 'verde', 'amarelo', 'amarelo', 'vermelho', 'vermelho'],
  );
  assert.deepEqual(
    [0, 5, 6, 15, 16, 30].map((n) => semaforoDe(n, LIMIARES.geral)),
    ['verde', 'verde', 'amarelo', 'amarelo', 'vermelho', 'vermelho'],
  );
});

test('diagnóstico: sem todas as respostas não há resultado; com tudo "sim" fica verde e sem plano', () => {
  assert.equal(diagnosticar({}), undefined);
  assert.equal(faltam({ salario: 'sim' }), 14);
  assert.equal(faltam({ salario: 'valor-invalido' as Resposta }), 15);
  const d = diagnosticar(todas('sim'))!;
  assert.equal(d.geral.semaforo, 'verde');
  assert.equal(d.geral.pontos, 0);
  assert.equal(d.geral.maximo, 30);
  assert.deepEqual(d.plano, []);
  assert.ok(d.temas.every((t) => t.semaforo === 'verde' && t.maximo === 6));
});

test('diagnóstico: tudo "não" fica vermelho com as 15 ações; "não se aplica" não gera ação', () => {
  const d = diagnosticar(todas('nao'))!;
  assert.equal(d.geral.pontos, 30);
  assert.equal(d.geral.semaforo, 'vermelho');
  assert.equal(d.plano.length, 15);
  assert.ok(d.temas.every((t) => t.semaforo === 'vermelho'));
  const na = diagnosticar(todas('nao-se-aplica'))!;
  assert.equal(na.geral.pontos, 0);
  assert.equal(na.plano.length, 0);
});

test('diagnóstico: semáforo por tema; o plano ordena não e não sei antes de "em parte" e marca "não sei"', () => {
  const d = diagnosticar({ ...todas('sim'), salario: 'parcial', convencao: 'nao-sei', pgr: 'nao' })!;
  const por = Object.fromEntries(d.temas.map((t) => [t.id, t]));
  assert.equal(por.jornada.semaforo, 'verde'); // 1 ponto
  assert.equal(por.coletivas.semaforo, 'amarelo'); // 2 pontos
  assert.equal(por.seguranca.semaforo, 'amarelo'); // 2 pontos
  assert.equal(por.contratos.semaforo, 'verde');
  assert.deepEqual(
    d.plano.map((i) => i.perguntaId),
    ['convencao', 'pgr', 'salario'],
  );
  assert.equal(d.plano[0].porDesconhecimento, true);
  assert.equal(d.plano[1].porDesconhecimento, false);
  assert.equal(d.geral.pontos, 5);
  assert.equal(d.geral.semaforo, 'verde');
});

test('diagnóstico: dois "não" no mesmo tema o levam ao vermelho', () => {
  const d = diagnosticar({ ...todas('sim'), pgr: 'nao', psicossociais: 'nao' })!;
  assert.equal(d.temas.find((t) => t.id === 'seguranca')!.semaforo, 'vermelho');
});

test('módulos do navegador: nada de node:*, zod, sqlite, rede ou armazenamento', () => {
  for (const f of [
    'src/lib/diagnostico/perguntas.ts',
    'src/lib/diagnostico/pontuacao.ts',
    'src/componentes/diagnostico/diagnostico-de-exposicao.tsx',
  ]) {
    const codigo = readFileSync(f, 'utf8');
    assert.doesNotMatch(codigo, /from ['"](node:|zod|better-sqlite3)/, f);
    assert.doesNotMatch(codigo, /\bfetch\(|localStorage|sessionStorage|indexedDB|sendBeacon|XMLHttpRequest/, f);
  }
});
