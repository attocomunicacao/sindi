import { definirAbaOculta } from './setup-dom';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PainelCompleto } from '@/componentes/painel/painel-completo';
import { painelVazio, type Painel } from '@/lib/dados/painel';

const original = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = original; definirAbaOculta(false); });
const horasAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const painel = (extra: Partial<Painel> = {}): Painel => ({
  ...painelVazio(), available: true, updatedAt: horasAtras(1),
  sindicato: { noticias: [{ source: 'sindeprestem', title: 'Notícia do sindicato', publishedAt: '2026-11-10T12:00:00Z', url: 'https://www.sindeprestem.com.br/post/a' }], artigos: [] },
  bills: [{ source: 'camara', title: 'PL 1/2026', summary: 'Sobre terceirização', situacao: 'Em tramitação', movedAt: '2026-11-01T12:00:00Z', url: 'https://www.camara.leg.br/p?idProposicao=1' }],
  news: [{ source: 'ibge', title: 'IBGE divulga o IPCA', publishedAt: '2026-11-09T12:00:00Z', url: 'https://agenciadenoticias.ibge.gov.br/n' }],
  sources: [{ source: 'ibge', lastOk: horasAtras(2), status: 'ok' }, { source: 'bcb', lastOk: horasAtras(3), status: 'ok' }], ...extra,
});
const responder = (corpo: Painel | (() => Painel), contador = { n: 0 }) => { globalThis.fetch = (async () => { contador.n++; return Response.json(typeof corpo === 'function' ? corpo() : corpo); }) as typeof fetch; return contador; };

test('painel: mostra "Carregando…" e depois o conteúdo, sem alerta de fonte defasada quando as coletas são recentes', async () => {
  responder(painel());
  render(<PainelCompleto />);
  assert.ok(screen.getByText('Carregando painel…'));
  await screen.findByText('Notícias do SINDEPRESTEM');
  assert.ok(screen.getByText('Notícia do sindicato')); assert.ok(screen.getByText(/PL 1\/2026/)); assert.ok(screen.getByText('IBGE divulga o IPCA'));
  assert.equal(screen.queryByText(/sem coleta bem-sucedida/), null);
});

test('painel: a primeira falha mostra o erro com "Tentar de novo", e o botão recarrega sem recarregar a página', async () => {
  const contador = { n: 0 };
  globalThis.fetch = (async () => { contador.n++; throw new Error('rede caiu'); }) as typeof fetch;
  render(<PainelCompleto />);
  const alerta = await screen.findByRole('alert'); assert.match(alerta.textContent ?? '', /Não foi possível carregar o painel agora/);
  assert.equal(screen.queryByText('Carregando painel…'), null, 'não fica carregando para sempre');
  responder(painel(), contador);
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  await screen.findByText('Notícias do SINDEPRESTEM'); assert.equal(screen.queryByRole('alert'), null);
});

test('painel: resposta com erro HTTP também é tratada como falha', async () => {
  globalThis.fetch = (async () => new Response('Bad gateway', { status: 502 })) as typeof fetch;
  render(<PainelCompleto />);
  assert.match((await screen.findByRole('alert')).textContent ?? '', /Não foi possível carregar/);
});

test('painel: fontes sem coleta há mais de 24 h são nomeadas no aviso; as recentes não', async () => {
  responder(painel({ sources: [{ source: 'ibge', lastOk: horasAtras(2), status: 'ok' }, { source: 'camara', lastOk: horasAtras(72), status: 'ok' }, { source: 'tst', lastOk: horasAtras(50), status: 'error', failures: 4 }, { source: 'mte', lastOk: null, status: 'error' }] }));
  render(<PainelCompleto />);
  const aviso = await screen.findByText(/sem coleta bem-sucedida há mais de 24 horas/);
  assert.match(aviso.textContent ?? '', /3 fontes estão/); assert.match(aviso.textContent ?? '', /Câmara/); assert.match(aviso.textContent ?? '', /TST/); assert.match(aviso.textContent ?? '', /Ministério do Trabalho/);
  assert.doesNotMatch(aviso.textContent ?? '', /IBGE/);
  assert.ok(screen.getByText(/4 falhas seguidas/), 'a lista de fontes mostra as falhas seguidas');
});

test('painel: listas vazias mostram uma mensagem em vez de uma caixa vazia', async () => {
  responder(painel({ news: [], bills: [], sindicato: { noticias: [], artigos: [] } }));
  render(<PainelCompleto />);
  await screen.findByText('Notícias do SINDEPRESTEM');
  assert.ok(screen.getByText('Nenhuma notícia recente.')); assert.ok(screen.getByText('Nenhum projeto em pauta no momento.')); assert.ok(screen.getByText('Nenhuma notícia recente das fontes.'));
});

test('painel: sem dados coletados mostra a orientação; uma falha depois de ter dados mantém a última leitura com um aviso', async () => {
  responder(painelVazio());
  render(<PainelCompleto />);
  assert.match((await screen.findByText(/ainda não tem dados/)).textContent ?? '', /dados:sync/);
  cleanup();
  let falhar = false; globalThis.fetch = (async () => { if (falhar) throw new Error('rede caiu'); return Response.json(painel()); }) as typeof fetch;
  render(<PainelCompleto />);
  await screen.findByText('Notícias do SINDEPRESTEM');
  falhar = true; definirAbaOculta(false); // a aba voltou a ficar visível: nova leitura
  const aviso = await screen.findByText(/Não foi possível atualizar agora/); assert.match(aviso.textContent ?? '', /última leitura/);
  assert.ok(screen.getByText('Notícia do sindicato'), 'os dados anteriores continuam na tela');
});

test('painel: com a aba oculta não busca; ao voltar a ficar visível, busca na hora', async () => {
  const contador = responder(painel());
  render(<PainelCompleto />);
  await screen.findByText('Notícias do SINDEPRESTEM'); assert.equal(contador.n, 1);
  definirAbaOculta(true); await new Promise(r => setTimeout(r, 30)); assert.equal(contador.n, 1, 'oculta: nenhuma leitura nova');
  definirAbaOculta(false); await waitFor(() => assert.equal(contador.n, 2));
});
