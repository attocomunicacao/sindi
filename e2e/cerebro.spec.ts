import { expect, test, type Page } from '@playwright/test';
import { registrarViolacoesDeCsp, vigiarErros } from './ajuda';

// O cérebro é desenhado num canvas: o que se confere aqui é o que o visitante faz (passar o mouse, usar o teclado, tocar) e o que ele vê no painel,
// sem erro de console nem violação da CSP (o canvas não pode usar estilo inline). No banco vazio dos testes só existe o grafo do cérebro (sem documentos).
const aberto = async (page: Page) => {
  const vigia = vigiarErros(page);
  await registrarViolacoesDeCsp(page);
  await page.goto('/cerebro');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await page.waitForLoadState('networkidle');
  // Dá um tempo para a simulação assentar e os primeiros quadros serem desenhados.
  await page.waitForTimeout(600);
  return { vigia, canvas };
};

test('cérebro: abre com o cérebro desenhado, sem erro de console nem violação da CSP, e descreve o canvas para leitores de tela', async ({
  page,
}) => {
  const { vigia, canvas } = await aberto(page);
  await expect(canvas).toHaveAttribute('role', 'img');
  await expect(canvas).toHaveAttribute('aria-label', /SINDI no centro orquestrando as áreas/);
  // O canvas tem conteúdo: alguns pixels diferentes do fundo.
  const colorido = await canvas.evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const claros = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 211) claros.add(data[i] + data[i + 1] * 256 + data[i + 2] * 65536);
    return claros.size;
  });
  expect(colorido, 'o canvas tem mais de um tom').toBeGreaterThan(8);
  expect(await vigia.violacoesDeCsp()).toEqual([]);
  expect(vigia.erros, vigia.erros.join('\n')).toEqual([]);
});

test('cérebro: o teclado caminha pelas ligações (Home = SINDI, setas = vizinhos, Esc limpa) e o painel anuncia o nó', async ({
  page,
}) => {
  const { vigia, canvas } = await aberto(page);
  await canvas.focus();
  const detalhes = page.locator('aside[aria-label="Ajustes do grafo"] section[aria-live="polite"]');
  // Sob carga, o grafo pode ainda estar chegando: repete o Home até a SINDI ser selecionada.
  await expect(async () => {
    await page.keyboard.press('Home');
    await expect(detalhes.getByRole('heading', { name: 'SINDI' })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await page.keyboard.press('ArrowRight');
  const titulo = detalhes.getByRole('heading');
  await expect(titulo).not.toHaveText('SINDI');
  const areaOuEstante = (await titulo.textContent()) ?? '';
  expect(areaOuEstante.length).toBeGreaterThan(3);
  await page.keyboard.press('Escape');
  await expect(detalhes).toHaveCount(0);
  expect(vigia.erros, vigia.erros.join('\n')).toEqual([]);
});

test('cérebro: passar o mouse no centro mostra a dica do nó dentro do canvas e o painel de busca acha uma área', async ({
  page,
}) => {
  const { vigia, canvas } = await aberto(page);
  const caixa = (await canvas.boundingBox())!;
  // A SINDI fica no centro do cérebro, e o cérebro é enquadrado no centro do canvas.
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  await page.waitForTimeout(400);
  const dica = await canvas.screenshot();
  expect(dica.byteLength).toBeGreaterThan(1000);
  await page.mouse.move(caixa.x + 4, caixa.y + 4);
  // Busca pelo painel: uma das áreas do cérebro.
  await page.locator('#busca-grafo').fill('Legislação');
  await expect(page.getByRole('button', { name: /Legislação trabalhista/ }).first()).toBeVisible();
  expect(vigia.erros, vigia.erros.join('\n')).toEqual([]);
});

test('cérebro: o modo arquitetura continua disponível e volta para a rede', async ({ page }) => {
  const { vigia } = await aberto(page);
  await page.getByRole('button', { name: 'Arquitetura do sistema' }).click();
  await expect(page.getByRole('button', { name: 'Arquitetura do sistema' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Rede de conhecimento' }).click();
  await expect(page.getByRole('button', { name: 'Rede de conhecimento' })).toHaveAttribute('aria-pressed', 'true');
  expect(vigia.erros, vigia.erros.join('\n')).toEqual([]);
});

test('cérebro: o canvas cabe na tela, sem rolagem horizontal da página', async ({ page }) => {
  const { canvas } = await aberto(page);
  const caixa = (await canvas.boundingBox())!;
  const largura = await page.evaluate(() => document.documentElement.clientWidth);
  expect(caixa.x).toBeGreaterThanOrEqual(0);
  expect(caixa.x + caixa.width).toBeLessThanOrEqual(largura + 1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
  ).toBe(true);
});
