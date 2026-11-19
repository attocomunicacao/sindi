import { expect, test } from '@playwright/test';
import { alerta } from './ajuda';

const dinheiro = /R\$\s?[\d.]+,\d{2}/;

test('orçamento: valor calculado na hora, vigência da tabela em destaque e adicionais da função já na tela', async ({ page }) => {
  await page.goto('/orcamento');
  await expect(page.getByText('Posto 1')).toBeVisible();
  const resultado = page.getByLabel('Resultado do orçamento');
  await expect(resultado.getByText(dinheiro).first()).toBeVisible(); await expect(resultado.getByRole('note')).toContainText(/13\/10\/2026.*R\$\s?1\.212,00/);
  await page.getByLabel('Função').selectOption({ label: 'Auxiliar de limpeza (com periculosidade) — R$ 1.384,65' }); await expect(page.getByLabel(/Periculosidade/)).toBeChecked();
});

test('orçamento: periculosidade e insalubridade juntas avisam que só o maior entra, e o valor cai ao tirar um deles', async ({ page }) => {
  await page.goto('/orcamento'); await expect(page.getByText('Posto 1')).toBeVisible();
  // O valor mensal é o parágrafo logo depois do rótulo (a primeira ocorrência de "R$" no painel é a nota da tabela).
  const valor = () => page.getByText('Valor mensal estimado').locator('xpath=following-sibling::p[1]').innerText();
  const base = await valor();
  await page.getByLabel(/Periculosidade/).check(); const comPericulosidade = await valor(); expect(comPericulosidade).not.toBe(base);
  await page.getByLabel('Insalubridade').selectOption('0.2'); await expect(page.getByText(/não se acumulam/)).toContainText('entra só a periculosidade');
  expect(await valor()).toBe(comPericulosidade);   // a insalubridade (menor) não soma: o valor não muda
  await page.getByLabel('Insalubridade').selectOption('0.4'); await expect(page.getByText(/não se acumulam/)).toContainText('entra só a insalubridade'); expect(await valor()).not.toBe(comPericulosidade);
});

test('orçamento: o PDF baixa de verdade (arquivo com assinatura %PDF) e postos repetidos travam o botão', async ({ page }) => {
  await page.goto('/orcamento'); await expect(page.getByText('Posto 1')).toBeVisible();
  await page.getByLabel('Empresa').fill('Empresa de Teste Ltda');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Baixar orçamento/ }).click()]);
  expect(download.suggestedFilename()).toBe('orcamento-terceirizacao.pdf');
  const caminho = await download.path(); const { readFileSync } = await import('node:fs'); expect(readFileSync(caminho!).subarray(0, 5).toString()).toBe('%PDF-');
  await page.getByRole('button', { name: /Adicionar posto/ }).click(); await expect(page.getByText('Posto 2')).toBeVisible();
  await page.getByLabel('Função').nth(1).selectOption(await page.getByLabel('Função').first().inputValue());
  await page.getByLabel('Insalubridade').nth(1).selectOption(await page.getByLabel('Insalubridade').first().inputValue());
  await page.getByLabel('Turno').nth(1).selectOption(await page.getByLabel('Turno').first().inputValue());
  await expect(alerta(page)).toContainText('postos repetidos'); await expect(page.getByRole('button', { name: /Baixar orçamento/ })).toBeDisabled();
});

test('orçamento: o link que o chat monta (?postos=...&m2=...) abre o formulário já preenchido', async ({ page }) => {
  await page.goto('/orcamento?postos=zelador:3:diurno,porteiro:2:noturno&m2=800');
  await expect(page.getByLabel('Quantidade').first()).toHaveValue('3'); await expect(page.getByLabel('Quantidade').nth(1)).toHaveValue('2'); await expect(page.getByLabel('Área atendida (m²)')).toHaveValue('800');
});

test('painel: sem dados coletados mostra a orientação; com dados defasados mostra o aviso e as fontes', async ({ page }) => {
  await page.goto('/painel'); await expect(page.getByText(/ainda não tem dados/)).toBeVisible();
  const agora = Date.now(); const horas = (h: number) => new Date(agora - h * 3_600_000).toISOString();
  await page.route('**/api/painel', route => route.fulfill({ json: { available: true, updatedAt: horas(1), indicators: [], bills: [], news: [], series: {}, sindicato: { noticias: [], artigos: [] },
    sources: [{ source: 'ibge', lastOk: horas(2), status: 'ok' }, { source: 'camara', lastOk: horas(80), status: 'error', failures: 5 }] } }));
  await page.reload();
  await expect(page.getByText(/sem coleta bem-sucedida há mais de 24 horas/)).toContainText('Câmara'); await expect(page.getByText(/5 falhas seguidas/)).toBeVisible();
  await expect(page.getByText('Nenhuma notícia recente.')).toBeVisible();
});

test('painel: falha ao carregar mostra o erro e o botão recarrega sem recarregar a página', async ({ page }) => {
  let falhar = true;
  await page.route('**/api/painel', route => falhar ? route.abort('failed') : route.fulfill({ json: { available: true, updatedAt: new Date().toISOString(), indicators: [], bills: [], news: [], series: {}, sindicato: { noticias: [], artigos: [] }, sources: [] } }));
  await page.goto('/painel');
  await expect(alerta(page)).toContainText('Não foi possível carregar o painel agora');
  falhar = false; await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.getByRole('heading', { name: 'Notícias do SINDEPRESTEM' })).toBeVisible(); await expect(alerta(page)).toHaveCount(0);
});
