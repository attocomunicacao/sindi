import '../apoio/setup-dom';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { KitJornada42 } from '@/componentes/jornada42/kit-jornada-42';

// O next/link usa `self` (o escopo global do navegador) ao observar o link; no Node ele não existe.
(globalThis as unknown as { self?: unknown }).self ??= globalThis;

afterEach(cleanup);
const normal = (v: string | null) => (v ?? '').replace(/ /g, ' ');

test('kit: o exemplo do Planalto aparece no cálculo e o resultado acompanha o salário', () => {
  render(<KitJornada42 />);
  const r = screen.getByRole('region', { name: 'Resultado do impacto' });
  for (const v of ['R$ 13,64', 'R$ 14,29', 'R$ 15,00', '4,76%', '10,00%'])
    assert.ok(normal(r.textContent).includes(v), v);
  fireEvent.change(screen.getByLabelText('Salário mensal (R$)'), { target: { value: '' } });
  assert.ok(screen.getAllByRole('status').some((e) => /Informe um salário/.test(e.textContent ?? '')));
});

test('kit: o roteiro cresce com as marcações e cada passo traz a referência', () => {
  render(<KitJornada42 />);
  const passos = () => within(screen.getByRole('list', { name: 'Passos do roteiro' })).getAllByRole('listitem');
  const antes = passos().length;
  fireEvent.click(screen.getByLabelText(/contratos administrativos vigentes/));
  assert.equal(passos().length, antes + 1);
  assert.ok(passos().every((p) => /Referência:/.test(p.textContent ?? '')));
  assert.ok(
    normal(
      passos()
        .map((p) => p.textContent)
        .join(' '),
    ).includes('art. 9º'),
  );
  fireEvent.change(screen.getByLabelText('Perfil da empresa'), { target: { value: 'temporario' } });
  assert.equal(passos().length, antes, 'trocar de perfil zera as marcações');
});

test('kit: o comunicado leva o nome da empresa, o aviso de revisão e copia para a área de transferência', async () => {
  let copiado = '';
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async (t: string) => (copiado = t) },
    configurable: true,
  });
  render(<KitJornada42 />);
  fireEvent.change(screen.getByLabelText('Nome da empresa'), { target: { value: 'Acme Serviços' } });
  const texto = screen.getByLabelText('Texto do comunicado') as HTMLTextAreaElement;
  assert.match(texto.value, /A Acme Serviços informa/);
  assert.match(texto.value, /revise com o jurídico/);
  fireEvent.click(screen.getByRole('button', { name: 'Copiar texto' }));
  await screen.findByText('Texto copiado.');
  assert.equal(copiado, texto.value);
});

test('kit: a aula só aparece com link http(s) válido e nenhum fetch é feito', () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error('o kit não deve chamar a rede');
  }) as typeof fetch;
  try {
    render(<KitJornada42 />);
    assert.equal(screen.queryByText('Aula gravada'), null);
    cleanup();
    render(<KitJornada42 aulaUrl="javascript:alert(1)" />);
    assert.equal(screen.queryByText('Aula gravada'), null);
    cleanup();
    render(<KitJornada42 aulaUrl="https://exemplo.org/aula" />);
    assert.equal(
      screen.getByRole('link', { name: /Assistir à aula/ }).getAttribute('href'),
      'https://exemplo.org/aula',
    );
  } finally {
    globalThis.fetch = original;
  }
});
