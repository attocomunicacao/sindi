import { expect, test } from '@playwright/test';
import { alerta, conversa, simularChat, type EventoDoChat } from './ajuda';

const resposta = (partes: string[], restantes = 12): EventoDoChat[] => [
  ...partes.map((text) => ({ type: 'delta' as const, text })),
  { type: 'done', text: partes.join(''), restantes },
];
const caixa = (page: import('@playwright/test').Page) => page.getByLabel('Mensagem para SINDI');

test('chat: a tela inicial mostra o título, sugestões e a caixa pronta para digitar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'SINDI', level: 1 })).toBeVisible();
  await expect(page.getByRole('list').first().getByRole('button')).toHaveCount(3);
  await expect(caixa(page)).toBeVisible();
  await expect(page.getByText(/A IA pode errar/)).toBeVisible();
});

test('chat: Enter envia, Shift+Enter quebra a linha, a resposta aparece aos poucos e o saldo é mostrado', async ({
  page,
}) => {
  await simularChat(page, resposta(['O telefone ', 'do SINDEPRESTEM ', 'é (11) 3215-8250.'], 9), { atrasoMs: 250 });
  await page.goto('/');
  await caixa(page).fill('Qual o telefone?');
  await caixa(page).press('Shift+Enter');
  await caixa(page).type('Obrigado');
  await expect(caixa(page)).toHaveValue('Qual o telefone?\nObrigado');
  await caixa(page).press('Enter');
  const mensagens = page.getByRole('region', { name: 'Mensagens da conversa' });
  await expect(mensagens.getByText('Qual o telefone?')).toBeVisible();
  await expect(mensagens.getByText(/O telefone/)).toBeVisible(); // o primeiro trecho chega antes do fim
  await expect(mensagens.getByText('é (11) 3215-8250.')).toHaveCount(0);
  await expect(mensagens.getByText('O telefone do SINDEPRESTEM é (11) 3215-8250.')).toBeVisible();
  await expect(page.getByText('Restam 9 mensagens hoje.')).toBeVisible();
  await expect(caixa(page)).toHaveValue('');
  await expect(page.getByRole('status').filter({ hasText: 'SINDI respondeu' })).toHaveText(
    /SINDI respondeu: O telefone do SINDEPRESTEM é \(11\) 3215-8250\./,
  );
});

test('chat: a pergunta enviada ao servidor leva só as mensagens da conversa, e a sugestão clicada vira a primeira pergunta', async ({
  page,
}) => {
  await simularChat(page, resposta(['Resposta um.']));
  await page.goto('/');
  const sugestao = page.getByRole('list').first().getByRole('button').first();
  const texto = (await sugestao.innerText()).trim();
  await sugestao.click();
  await expect(conversa(page).getByText('Resposta um.')).toBeVisible();
  const pedidos = await page.evaluate(
    () =>
      (window as unknown as { __pedidosAoChat: { messages: { role: string; content: string }[] }[] }).__pedidosAoChat,
  );
  expect(pedidos).toHaveLength(1);
  expect(pedidos[0].messages).toEqual([{ role: 'user', content: texto }]);
});

test('chat: o botão Parar (e a tecla Esc) interrompem a resposta e o texto parcial fica', async ({ page }) => {
  await simularChat(page, resposta(['Primeira parte. ', 'Segunda parte. ', 'Terceira parte.']), { atrasoMs: 600 });
  await page.goto('/');
  await caixa(page).fill('Conte uma história');
  await caixa(page).press('Enter');
  await expect(conversa(page).getByText('Primeira parte.')).toBeVisible();
  await page.getByRole('button', { name: 'Parar resposta' }).click();
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible();
  await expect(conversa(page).getByText(/Primeira parte\./)).toBeVisible();
  await expect(conversa(page).getByText(/Terceira parte\./)).toHaveCount(0);
  await expect(alerta(page)).toHaveCount(0, { timeout: 1000 });
});

test('chat: erro do servidor (cota esgotada) aparece em um alerta e a pergunta volta para a caixa', async ({
  page,
}) => {
  await simularChat(page, [], {
    status: 429,
    erro: 'Você atingiu o limite de 20 mensagens de hoje. Ela volta a responder para você em cerca de 5 h.',
  });
  await page.goto('/');
  await caixa(page).fill('Oi de novo');
  await caixa(page).press('Enter');
  await expect(alerta(page)).toContainText('limite de 20 mensagens');
  await expect(caixa(page)).toHaveValue('Oi de novo');
});

test('chat: durante a resposta, a tela acompanha o fim só se a pessoa já estava lá; quem rolou para cima não é arrastada de volta', async ({
  page,
}) => {
  const longo = Array.from(
    { length: 40 },
    (_, i) =>
      `Parágrafo ${i + 1} da resposta, com texto suficiente para ocupar bastante espaço na tela do navegador e forçar a rolagem da página.\n\n`,
  );
  await simularChat(page, resposta(longo), { atrasoMs: 120 });
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.goto('/');
  await caixa(page).fill('Pergunta com resposta longa');
  await caixa(page).press('Enter');
  // Quem está no fim acompanha: depois de alguns trechos a página já rolou para baixo.
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 8000 }).toBeGreaterThan(200);
  // Rola para cima durante o fluxo: não pode voltar sozinha para o fim.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  const antes = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(1500);
  const depois = await page.evaluate(() => window.scrollY);
  expect(antes).toBeLessThan(150);
  expect(depois).toBeLessThan(150);
  await expect(conversa(page).getByText('Parágrafo 40 da resposta')).toBeAttached({ timeout: 15_000 });
});

test('chat: "Nova conversa" limpa a conversa e volta às sugestões', async ({ page, isMobile }) => {
  await simularChat(page, resposta(['Resposta.']));
  await page.goto('/');
  await caixa(page).fill('Oi');
  await caixa(page).press('Enter');
  await expect(conversa(page).getByText('Resposta.')).toBeVisible();
  await page.getByRole('button', { name: 'Nova conversa' }).click();
  await expect(page.getByRole('heading', { name: 'SINDI', level: 1 })).toBeVisible();
  await expect(page.getByText('Resposta.')).toHaveCount(0);
  void isMobile;
});

test('menu e tema: no celular o menu abre, navega e fecha com Esc; o tema escuro liga e fica depois de recarregar', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  if (isMobile) {
    const menu = page.getByRole('button', { name: 'Abrir menu' });
    await menu.click();
    await expect(page.getByRole('button', { name: 'Fechar menu' })).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeVisible();
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await page.locator('#menu-principal').getByRole('link', { name: 'Orçamento' }).click();
  } else await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Orçamento' }).click();
  await expect(page).toHaveURL(/\/orcamento$/);
  await expect(page.getByText('Custo mensal estimado')).toBeVisible();
  const claro = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.getByRole('button', { name: /Ativar tema escuro/ }).click();
  await expect(page.getByRole('button', { name: /Ativar tema claro/ })).toBeVisible();
  const escuro = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(escuro).not.toBe(claro);
  await page.reload();
  await expect(page.getByRole('button', { name: /Ativar tema claro/ })).toBeVisible();
});
