import '../apoio/setup-dom';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DiagnosticoDeExposicao } from '@/componentes/diagnostico/diagnostico-de-exposicao';
import { PERGUNTAS } from '@/lib/diagnostico/perguntas';

afterEach(cleanup);

/** Marca a opção de rótulo `rotulo` na pergunta `id` (cada grupo tem o nome `dx-<id>`). */
function responder(id: string, rotulo: string) {
  const grupo = document.querySelector(`input[name="dx-${id}"]`)!.closest('fieldset') as HTMLElement;
  fireEvent.click(within(grupo).getByLabelText(rotulo));
}

test('diagnóstico: mostra as 15 perguntas, cada uma com a fonte oficial como link', () => {
  render(<DiagnosticoDeExposicao />);
  assert.equal(document.querySelectorAll('fieldset').length, 15);
  for (const p of PERGUNTAS)
    for (const f of p.fontes)
      assert.ok(
        screen.getAllByRole('link', { name: f.rotulo }).some((a) => a.getAttribute('href') === f.url),
        f.rotulo,
      );
  assert.ok(screen.getByText(/Faltam 15 de 15 perguntas/));
  assert.equal(screen.queryByRole('region', { name: 'Resultado do diagnóstico' }), null);
});

test('diagnóstico: o resultado só aparece com tudo respondido e traz semáforo em texto, plano e fonte', () => {
  render(<DiagnosticoDeExposicao />);
  for (const p of PERGUNTAS) responder(p.id, 'Sim');
  const verde = screen.getByRole('region', { name: 'Resultado do diagnóstico' });
  assert.match(verde.textContent ?? '', /Verde/);
  assert.match(verde.textContent ?? '', /não garante a conformidade/);
  assert.equal(within(verde).queryByRole('list', { name: 'Itens do plano de ação' }), null);

  responder('pgr', 'Não');
  responder('salario', 'Não sei');
  const r = screen.getByRole('region', { name: 'Resultado do diagnóstico' });
  const itens = Array.from(within(r).getByRole('list', { name: 'Itens do plano de ação' }).children) as HTMLElement[];
  assert.equal(itens.length, 2);
  // Mesmo peso (2 pontos): vale a ordem das perguntas, então o salário (não sei) vem antes do PGR (não).
  assert.match(itens[0].textContent ?? '', /não sei/);
  assert.match(itens[1].textContent ?? '', /Programa de Gerenciamento de Riscos/);
  assert.ok(within(itens[0]).getAllByRole('link').length >= 1);
  assert.match(r.textContent ?? '', /Amarelo/);
  assert.match(r.textContent ?? '', /Informação geral, sem caráter de consultoria/);
  assert.ok(screen.getByRole('button', { name: /Imprimir ou salvar em PDF/ }));
});

test('diagnóstico: limpar respostas esconde o resultado de novo', () => {
  render(<DiagnosticoDeExposicao />);
  for (const p of PERGUNTAS) responder(p.id, 'Não se aplica');
  assert.ok(screen.getByRole('region', { name: 'Resultado do diagnóstico' }));
  fireEvent.click(screen.getByRole('button', { name: 'Limpar respostas' }));
  assert.equal(screen.queryByRole('region', { name: 'Resultado do diagnóstico' }), null);
  assert.ok(screen.getByText(/Faltam 15 de 15/));
});

test('privacidade: responder e ver o resultado não faz requisição nem grava no navegador', () => {
  const original = globalThis.fetch;
  const armazenamento = Object.getPrototypeOf(window.localStorage) as Storage;
  const setItem = armazenamento.setItem;
  const gravacoes: string[] = [];
  let chamadas = 0;
  armazenamento.setItem = function (chave: string) {
    gravacoes.push(chave);
  };
  globalThis.fetch = (() => {
    chamadas += 1;
    throw new Error('o diagnóstico não deve chamar a rede');
  }) as typeof fetch;
  try {
    render(<DiagnosticoDeExposicao />);
    for (const p of PERGUNTAS) responder(p.id, 'Não');
    assert.ok(screen.getByRole('region', { name: 'Resultado do diagnóstico' }));
    assert.equal(chamadas, 0, 'nenhuma requisição');
    assert.deepEqual(gravacoes, [], 'nenhuma gravação em localStorage ou sessionStorage');
  } finally {
    globalThis.fetch = original;
    armazenamento.setItem = setItem;
  }
});
