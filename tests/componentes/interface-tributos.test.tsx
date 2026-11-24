import '../apoio/setup-dom';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FormularioOrcamento } from '@/componentes/orcamento/formulario-orcamento';
import { CalculadoraDeTributos } from '@/componentes/tributos/calculadora-de-tributos';

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/orcamento');
});
const normal = (v: string | null) => (v ?? '').replace(/ /g, ' ');

test('calculadora: o exemplo da Receita (2026, base 100.000) mostra CBS 900,00 e IBS 100,00 e a memória de cálculo', () => {
  render(<CalculadoraDeTributos />);
  const resultado = screen.getByLabelText('Resultado do regime regular');
  assert.match(normal(resultado.textContent), /R\$ 900,00/);
  assert.match(normal(resultado.textContent), /R\$ 100,00/);
  assert.ok(within(resultado).getByText('Memória de cálculo'));
  assert.equal(screen.queryByLabelText('CBS (%)'), null, '2026 usa o banco oficial: sem alíquotas editáveis');
  fireEvent.change(screen.getByLabelText('Ano'), { target: { value: '2029' } });
  assert.equal((screen.getByLabelText('CBS (%)') as HTMLInputElement).value, '8,5');
  assert.match(screen.getByLabelText('Resultado do regime regular').textContent ?? '', /simulado/i);
});

test('calculadora: abas do DAS e da CBS/IBS do Simples, com teclado e erro de entrada em português', () => {
  render(<CalculadoraDeTributos />);
  const abas = screen.getAllByRole('tab');
  assert.equal(abas.length, 3);
  assert.equal(abas[0].getAttribute('aria-selected'), 'true');
  fireEvent.keyDown(abas[0], { key: 'ArrowRight' });
  assert.equal(screen.getAllByRole('tab')[1].getAttribute('aria-selected'), 'true');
  const das = screen.getByLabelText('Resultado do DAS');
  assert.match(normal(das.textContent), /7,716/);
  fireEvent.change(screen.getByLabelText('RBT12 (R$)'), { target: { value: '' } });
  assert.match(screen.getByRole('status').textContent ?? '', /RBT12/);
  fireEvent.click(screen.getAllByRole('tab')[2]);
  assert.match(screen.getByRole('status').textContent ?? '', /CBS e o IBS efetivos/);
  fireEvent.change(screen.getByLabelText('CBS sem redistribuição (%)'), { target: { value: '0,5' } });
  fireEvent.change(screen.getByLabelText('IBS sem redistribuição (%)'), { target: { value: '0,25' } });
  assert.match(
    normal(screen.getByLabelText('Resultado do Simples Nacional: CBS e IBS').textContent),
    /R\$ 250,00/,
    'ISS retido (padrão) usa o par sem redistribuição',
  );
});

test('calculadora: aba do Simples oferece a conferência com a Receita só quando o serviço oficial sabe conferir (serviço, fração 1, ISS no Simples)', async () => {
  const fetchOriginal = globalThis.fetch;
  const chamadas: { url: string; corpo: unknown }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    chamadas.push({ url, corpo: JSON.parse(String(init?.body)) });
    return Response.json({
      local: { vCBS: 250, vIBS: 125 },
      oficial: { estado: 'CALCULADO', vCBS: 250, vIBS: 125 },
      iguais: true,
      motivo: null,
    });
  }) as typeof fetch;
  try {
    render(<CalculadoraDeTributos />);
    fireEvent.click(screen.getAllByRole('tab')[2]);
    const botao = () => screen.queryByRole('button', { name: /Conferir com a calculadora da Receita/ });
    assert.equal(botao(), null, 'sem as alíquotas do PGDAS-D não há o que conferir');
    fireEvent.change(screen.getByLabelText('CBS sem redistribuição (%)'), { target: { value: '0,5' } });
    fireEvent.change(screen.getByLabelText('IBS sem redistribuição (%)'), { target: { value: '0,25' } });
    fireEvent.click(botao()!);
    await screen.findByText(/Conferido: a calculadora oficial deu exatamente os mesmos valores/);
    assert.equal(chamadas[0].url, '/api/rtc/simples-nacional');
    assert.deepEqual(chamadas[0].corpo, {
      receita: 50000,
      anexo: 'IV',
      comRedistribuicao: { cbs: 0.5, ibs: 0.25 },
      semRedistribuicao: { cbs: 0.5, ibs: 0.25 },
      retido: true,
      semIss: false,
      isencao: false,
    });
    fireEvent.change(screen.getByLabelText('Fração tributada (0 a 1)'), { target: { value: '0,5' } });
    assert.equal(botao(), null, 'fração diferente de 1 não é conferida (o serviço a resolve pelo cClassTrib)');
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test('orçamento: escolher Reforma Tributária mostra a nota com CBS/IBS e a comparação; Simples sem RBT12 avisa e mantém as regras atuais', async () => {
  render(<FormularioOrcamento />);
  await screen.findByText('Posto 1');
  const antes = normal(screen.getByLabelText('Resultado do orçamento').textContent);
  fireEvent.change(screen.getByLabelText('Tributação'), { target: { value: 'reforma' } });
  fireEvent.change(screen.getByLabelText('Ano da prestação'), { target: { value: '2028' } });
  const grupo = await screen.findByRole('group', { name: 'Tributação escolhida' });
  assert.match(normal(grupo.textContent), /Total da nota/);
  assert.match(normal(grupo.textContent), /Regras atuais/);
  assert.ok(within(grupo).getByText('Memória de cálculo'));
  fireEvent.change(screen.getByLabelText('Tributação'), { target: { value: 'simples' } });
  assert.match(screen.getByRole('status', { name: '' }).textContent ?? '', /RBT12/);
  assert.equal(screen.queryByRole('group', { name: 'Tributação escolhida' }), null);
  fireEvent.change(screen.getByLabelText('RBT12 (R$)'), { target: { value: '500.000' } });
  assert.match(normal((await screen.findByRole('group', { name: 'Tributação escolhida' })).textContent), /7,7160%/);
  fireEvent.change(screen.getByLabelText('Tributação'), { target: { value: 'atual' } });
  assert.equal(
    normal(screen.getByLabelText('Resultado do orçamento').textContent),
    antes,
    'voltar às regras atuais restaura o resultado de antes',
  );
});
