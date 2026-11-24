import './setup-dom';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FormularioOrcamento } from '@/componentes/orcamento/formulario-orcamento';

afterEach(() => { cleanup(); window.history.pushState({}, '', '/orcamento'); });
const dinheiro = /R\$\s?[\d.]+,\d{2}/;
const aguardarFormulario = async () => { await screen.findByText('Posto 1'); };
const selectFuncao = (indice = 0) => screen.getAllByLabelText('Função')[indice] as HTMLSelectElement;
const opcaoDe = (select: HTMLSelectElement, trecho: string) => Array.from(select.options).find(o => o.text.includes(trecho))!;

test('orçamento: o formulário aparece depois da montagem, já com o resultado e a vigência da tabela em destaque', async () => {
  render(<FormularioOrcamento />);
  await aguardarFormulario();
  const resultado = screen.getByLabelText('Resultado do orçamento');
  assert.match(within(resultado).getByText('Valor mensal estimado').nextElementSibling!.textContent ?? '', dinheiro, 'o valor mensal já está calculado, sem ida à rede');
  const nota = within(resultado).getByRole('note');
  assert.match(nota.textContent ?? '', /13\/10\/2026/); assert.match(nota.textContent ?? '', /R\$\s?1\.212,00/); assert.match(nota.textContent ?? '', /Confira se os valores estão vigentes/);
});

test('orçamento: os postos do link do chat (?postos=...&m2=...) são lidos no navegador', async () => {
  window.history.pushState({}, '', '/orcamento?postos=zelador:3:diurno,porteiro:2:noturno&m2=800');
  render(<FormularioOrcamento />);
  await aguardarFormulario();
  assert.equal(screen.getAllByLabelText('Quantidade').map(i => (i as HTMLInputElement).value).join(','), '3,2');
  assert.equal((screen.getByLabelText('Área atendida (m²)') as HTMLInputElement).value, '800');
  assert.equal((screen.getAllByLabelText('Turno')[1] as HTMLSelectElement).value, 'noturno');
  assert.ok(selectFuncao(0).value === 'zelador' && selectFuncao(1).value === 'porteiro');
});

test('orçamento: um posto traz os adicionais da função, e o que está na tela é o que vai ao cálculo', async () => {
  render(<FormularioOrcamento />);
  await aguardarFormulario();
  const funcao = selectFuncao();
  // Função "com periculosidade": a caixa já vem marcada. Serviços gerais: insalubridade de 40% já vem escolhida.
  fireEvent.change(funcao, { target: { value: opcaoDe(funcao, 'com periculosidade').value } });
  assert.equal((screen.getByLabelText(/Periculosidade/) as HTMLInputElement).checked, true);
  fireEvent.change(funcao, { target: { value: opcaoDe(funcao, 'serviços gerais').value } });
  assert.equal((screen.getByLabelText(/Periculosidade/) as HTMLInputElement).checked, false);
  assert.equal((screen.getByLabelText('Insalubridade') as HTMLSelectElement).value, '0.4');
});

test('orçamento: com periculosidade e insalubridade marcadas, a tela avisa que só o maior entra e qual', async () => {
  render(<FormularioOrcamento />);
  await aguardarFormulario();
  assert.equal(screen.queryByText(/não se acumulam/), null);
  fireEvent.click(screen.getByLabelText(/Periculosidade/));
  fireEvent.change(screen.getByLabelText('Insalubridade'), { target: { value: '0.2' } });
  const aviso = await screen.findByText(/não se acumulam/);
  assert.match(aviso.textContent ?? '', /art\. 193/); assert.match(aviso.textContent ?? '', /entra só a periculosidade/, 'periculosidade (30% do salário) é maior que 20% do mínimo');
  fireEvent.change(screen.getByLabelText('Insalubridade'), { target: { value: '0.4' } });
  await waitFor(() => assert.match(screen.getByText(/não se acumulam/).textContent ?? '', /entra só a insalubridade/));
  fireEvent.change(screen.getByLabelText('Insalubridade'), { target: { value: '0' } });
  await waitFor(() => assert.equal(screen.queryByText(/não se acumulam/), null));
});

test('orçamento: adicionar posto escolhe uma função ainda não usada; postos idênticos geram alerta e travam os PDFs', async () => {
  render(<FormularioOrcamento />);
  await aguardarFormulario();
  fireEvent.click(screen.getByRole('button', { name: /Adicionar posto/ }));
  await screen.findByText('Posto 2');
  assert.notEqual(selectFuncao(0).value, selectFuncao(1).value, 'o posto novo não repete a função');
  assert.equal(screen.queryByText(/postos repetidos/), null);
  const pdf = screen.getByRole('button', { name: /Baixar orçamento/ }) as HTMLButtonElement; assert.equal(pdf.disabled, false);
  // Mesma função, turno e adicionais nos dois postos: o servidor recusaria; a tela avisa antes.
  fireEvent.change(selectFuncao(1), { target: { value: selectFuncao(0).value } });
  fireEvent.change(screen.getAllByLabelText('Insalubridade')[1], { target: { value: (screen.getAllByLabelText('Insalubridade')[0] as HTMLSelectElement).value } });
  fireEvent.change(screen.getAllByLabelText('Turno')[1], { target: { value: (screen.getAllByLabelText('Turno')[0] as HTMLSelectElement).value } });
  const alerta = await screen.findByText(/Há postos repetidos/); assert.match(alerta.textContent ?? '', /Some as quantidades/);
  assert.equal((screen.getByRole('button', { name: /Baixar orçamento/ }) as HTMLButtonElement).disabled, true);
  assert.equal((screen.getByRole('button', { name: /Relatório de custo/ }) as HTMLButtonElement).disabled, true);
});

test('orçamento: o PDF é pedido ao servidor com os valores explícitos da tela (adicional desmarcado vai como false e 0)', async () => {
  const original = globalThis.fetch; const chamadas: { url: string; corpo: { postos: Record<string, unknown>[]; cliente: Record<string, string> } }[] = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => { chamadas.push({ url: String(url), corpo: JSON.parse(String(init?.body)) }); return new Response(new Uint8Array([37, 80, 68, 70, 45]), { headers: { 'content-type': 'application/pdf' } }); }) as typeof fetch;
  try {
    render(<FormularioOrcamento />);
    await aguardarFormulario();
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'Acme Ltda' } });
    fireEvent.click(screen.getByRole('button', { name: /Baixar orçamento/ }));
    await waitFor(() => assert.equal(chamadas.length, 1));
    assert.equal(chamadas[0].url, '/api/orcamento/pdf?tipo=orcamento');
    const posto = chamadas[0].corpo.postos[0];
    assert.equal(posto.periculosidade, false); assert.equal(posto.insalubridade, 0); assert.equal(typeof posto.funcaoId, 'string');
    assert.equal(chamadas[0].corpo.cliente.empresa, 'Acme Ltda');
    fireEvent.click(screen.getByRole('button', { name: /Relatório de custo/ }));
    await waitFor(() => assert.equal(chamadas.length, 2)); assert.equal(chamadas[1].url, '/api/orcamento/pdf?tipo=custo');
  } finally { globalThis.fetch = original; }
});

test('orçamento: erro do servidor ao gerar o PDF aparece na tela, e o botão volta a funcionar', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ error: 'Revise os dados do orçamento: Posto repetido: some as quantidades.' }, { status: 400 })) as typeof fetch;
  try {
    render(<FormularioOrcamento />);
    await aguardarFormulario();
    fireEvent.click(screen.getByRole('button', { name: /Baixar orçamento/ }));
    const alerta = await screen.findByText(/Revise os dados do orçamento/);
    assert.equal(alerta.getAttribute('role'), 'alert');
    await waitFor(() => assert.equal((screen.getByRole('button', { name: /Baixar orçamento/ }) as HTMLButtonElement).disabled, false));
  } finally { globalThis.fetch = original; }
});
