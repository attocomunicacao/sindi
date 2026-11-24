import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { registrarViolacoesDeCsp, simularChat, vigiarErros, type EventoDoChat } from './ajuda';

// Conversas anteriores: ficam só no navegador (IndexedDB). No desktop a barra é uma coluna; no celular, uma gaveta aberta pelo botão do cabeçalho.
const resposta = (texto: string): EventoDoChat[] => [
  { type: 'delta', text: texto },
  { type: 'done', text: texto, restantes: 10 },
];
const caixa = (page: Page) => page.getByLabel('Mensagem para SINDI');
const mensagens = (page: Page) => page.getByRole('region', { name: 'Mensagens da conversa' });

/** A barra de conversas: coluna no desktop; no celular, abre a gaveta pelo botão do cabeçalho. */
async function barra(page: Page, celular: boolean) {
  if (!celular) return page.getByRole('complementary', { name: 'Conversas anteriores' });
  const gaveta = page.getByRole('dialog', { name: 'Conversas anteriores' });
  if (!(await gaveta.isVisible())) await page.getByRole('button', { name: 'Conversas anteriores' }).click();
  return gaveta;
}
async function perguntar(page: Page, texto: string, esperado: string) {
  await caixa(page).fill(texto);
  await caixa(page).press('Enter');
  await expect(mensagens(page).getByText(esperado)).toBeVisible();
  await expect(caixa(page)).toBeEnabled();
}

test('histórico: a conversa é guardada, aparece na barra, sobrevive a recarregar e reabre com as mensagens', async ({
  page,
  isMobile,
}) => {
  const vigia = vigiarErros(page);
  await registrarViolacoesDeCsp(page);
  await simularChat(page, resposta('Resposta de teste um.'));
  await page.goto('/');
  await perguntar(page, 'Como funciona a contribuição associativa?', 'Resposta de teste um.');
  let lateral = await barra(page, Boolean(isMobile));
  await expect(lateral.getByRole('button', { name: 'Como funciona a contribuição associativa?' })).toBeVisible();
  await page.waitForLoadState('networkidle'); // recarregar no meio de uma pré-busca do Next gera um "requisição abortada" que não é do histórico
  await page.reload();
  lateral = await barra(page, Boolean(isMobile));
  await expect(mensagens(page)).toHaveCount(0); // a tela inicial volta vazia
  await lateral.getByRole('button', { name: 'Como funciona a contribuição associativa?' }).click();
  await expect(mensagens(page).getByText('Como funciona a contribuição associativa?')).toBeVisible();
  await expect(mensagens(page).getByText('Resposta de teste um.')).toBeVisible();
  expect(await vigia.violacoesDeCsp(), 'violações da CSP').toEqual([]);
  expect(vigia.erros, vigia.erros.join('\n')).toEqual([]);
});

test('histórico: nova conversa, busca, fixar, renomear e excluir', async ({ page, isMobile }) => {
  await simularChat(page, resposta('Resposta de teste.'));
  await page.goto('/');
  await perguntar(page, 'Primeira pergunta sobre contribuição', 'Resposta de teste.');
  let lateral = await barra(page, Boolean(isMobile));
  await lateral.getByRole('button', { name: 'Novo chat' }).click();
  await expect(mensagens(page)).toHaveCount(0);
  await perguntar(page, 'Segunda pergunta sobre benefícios', 'Resposta de teste.');
  lateral = await barra(page, Boolean(isMobile));
  await expect(lateral.getByRole('button', { name: /pergunta sobre/ })).toHaveCount(2);
  // Busca (sem acento nem caixa).
  await lateral.getByLabel('Buscar nas conversas').fill('BENEFICIOS');
  await expect(lateral.getByRole('button', { name: /pergunta sobre/ })).toHaveCount(1);
  await lateral.getByLabel('Buscar nas conversas').fill('');
  // Renomear.
  await lateral.getByRole('button', { name: 'Renomear conversa' }).first().click({ force: true });
  await lateral.getByLabel('Novo título da conversa').fill('Meu título');
  await lateral.getByLabel('Novo título da conversa').press('Enter');
  await expect(lateral.getByRole('button', { name: 'Meu título' })).toBeVisible();
  // Fixar: ganha o grupo "Fixadas".
  await lateral.getByRole('button', { name: 'Fixar conversa' }).first().click({ force: true });
  await expect(lateral.getByRole('heading', { name: 'Fixadas' })).toBeVisible();
  // Excluir (pede confirmação).
  await lateral.getByRole('button', { name: 'Excluir conversa' }).first().click({ force: true });
  await lateral.getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(lateral.getByRole('button', { name: /pergunta sobre|Meu título/ })).toHaveCount(1);
});

test('histórico: dados pessoais não são guardados, e pausar impede de guardar', async ({ page, isMobile }) => {
  await simularChat(page, resposta('Resposta de teste.'));
  await page.goto('/');
  await perguntar(page, 'Meu CPF é 529.982.247-25, posso me filiar agora?', 'Resposta de teste.');
  let lateral = await barra(page, Boolean(isMobile));
  await expect(lateral.getByRole('button', { name: /posso me filiar agora/ })).toBeVisible();
  await expect(lateral).not.toContainText('529.982');
  await lateral.getByRole('button', { name: 'Pausar histórico' }).click();
  await expect(lateral.getByRole('button', { name: 'Retomar histórico' })).toHaveAttribute('aria-pressed', 'true');
  if (!isMobile) await lateral.getByRole('button', { name: 'Novo chat' }).click();
  else await page.reload();
  await perguntar(page, 'Pergunta durante a pausa', 'Resposta de teste.');
  lateral = await barra(page, Boolean(isMobile));
  await expect(lateral.getByRole('button', { name: 'Pergunta durante a pausa' })).toHaveCount(0);
  // Apagar tudo.
  await lateral.getByRole('button', { name: 'Apagar todas as conversas' }).click();
  await lateral.getByRole('button', { name: 'Apagar tudo' }).click();
  await expect(lateral.getByRole('button', { name: /posso me filiar agora/ })).toHaveCount(0);
});

test('histórico: no celular a gaveta é um diálogo (foco dentro, Esc fecha e o foco volta ao botão)', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'a gaveta só existe no celular e no tablet');
  await simularChat(page, resposta('Resposta de teste.'));
  await page.goto('/');
  const botao = page.getByRole('button', { name: 'Conversas anteriores' });
  await botao.click();
  const gaveta = page.getByRole('dialog', { name: 'Conversas anteriores' });
  await expect(gaveta).toBeVisible();
  await expect(gaveta.getByRole('button', { name: 'Fechar conversas' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(gaveta).toHaveCount(0);
  await expect(botao).toBeFocused();
});

for (const tema of ['light', 'dark'] as const) {
  test(`histórico: acessibilidade da página com conversas guardadas (${tema})`, async ({ page, isMobile }) => {
    await page.emulateMedia({ colorScheme: tema });
    await page.addInitScript((t) => localStorage.setItem('sindi-theme', t), tema);
    await simularChat(page, resposta('Resposta de teste.'));
    await page.goto('/');
    await perguntar(page, 'Pergunta para a varredura de acessibilidade', 'Resposta de teste.');
    await barra(page, Boolean(isMobile));
    const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const graves = resultado.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(graves.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
}
