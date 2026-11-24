import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { PAGINAS, registrarViolacoesDeCsp, simularChat, vigiarErros } from './ajuda';

// Integridade: carregar cada página como um visitante e não ver nenhum erro que ele não veria na tela.
for (const caminho of PAGINAS) {
  test(`integridade ${caminho}: carrega sem erro de console, exceção, requisição falha nem violação da CSP, com os cabeçalhos de segurança`, async ({
    page,
  }) => {
    const vigia = vigiarErros(page);
    await registrarViolacoesDeCsp(page);
    const resposta = await page.goto(caminho);
    expect(resposta!.status()).toBe(200);
    const cabecalhos = resposta!.headers();
    expect(cabecalhos['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(cabecalhos['content-security-policy']).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(cabecalhos['x-content-type-options']).toBe('nosniff');
    expect(cabecalhos['x-frame-options']).toBe('DENY');
    expect(cabecalhos['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(cabecalhos['x-powered-by']).toBeUndefined();
    await page.waitForLoadState('networkidle');
    expect(await vigia.violacoesDeCsp(), 'violações da CSP').toEqual([]);
    expect(vigia.erros, vigia.erros.join('\n')).toEqual([]);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
  });
}
test('integridade: página inexistente devolve 404 com a página própria, sem erro de console', async ({ page }) => {
  const vigia = vigiarErros(page);
  const resposta = await page.goto('/nao-existe');
  expect(resposta!.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  expect(
    vigia.erros.filter((e) => !/404/.test(e)),
    vigia.erros.join('\n'),
  ).toEqual([]);
});

// Acessibilidade (WCAG 2.1 A e AA) com o axe, em tema claro e escuro, no desktop e no celular. Só violações graves ou críticas reprovam; as demais aparecem no relatório.
const REGRAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
async function varrer(page: import('@playwright/test').Page, rotulo: string) {
  const resultado = await new AxeBuilder({ page }).withTags(REGRAS).analyze();
  const graves = resultado.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const descricao = graves
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n   ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join('\n   ')}`,
    )
    .join('\n');
  expect(graves, `${rotulo}\n${descricao}`).toEqual([]);
}
for (const caminho of PAGINAS)
  for (const esquema of ['light', 'dark'] as const) {
    test(`acessibilidade ${caminho} (${esquema}): sem violações graves do WCAG 2.1 AA`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: esquema });
      if (caminho === '/painel')
        await page.route('**/api/painel', (route) =>
          route.fulfill({
            json: {
              available: true,
              updatedAt: new Date().toISOString(),
              indicators: [],
              bills: [
                {
                  source: 'camara',
                  title: 'PL 1/2026',
                  summary: 'Sobre terceirização',
                  situacao: 'Em tramitação',
                  movedAt: new Date().toISOString(),
                  url: 'https://www.camara.leg.br/p',
                },
              ],
              news: [
                {
                  source: 'ibge',
                  title: 'IBGE divulga o IPCA',
                  publishedAt: new Date().toISOString(),
                  url: 'https://agenciadenoticias.ibge.gov.br/n',
                },
              ],
              series: {},
              sindicato: {
                noticias: [
                  {
                    source: 'sindeprestem',
                    title: 'Notícia do sindicato',
                    publishedAt: new Date().toISOString(),
                    url: 'https://www.sindeprestem.com.br/post/a',
                  },
                ],
                artigos: [],
              },
              sources: [
                {
                  source: 'ibge',
                  lastOk: new Date(Date.now() - 80 * 3_600_000).toISOString(),
                  status: 'error',
                  failures: 3,
                },
              ],
            },
          }),
        );
      await page.goto(caminho);
      await page.waitForLoadState('networkidle');
      if (caminho === '/orcamento') await expect(page.getByText('Posto 1')).toBeVisible();
      if (caminho === '/painel')
        await expect(page.getByRole('heading', { name: 'Notícias do SINDEPRESTEM' })).toBeVisible();
      await varrer(page, `${caminho} (${esquema})`);
    });
  }
test('acessibilidade: o chat com conversa, o alerta de erro e o orçamento com avisos também passam', async ({
  page,
}) => {
  await simularChat(page, [
    { type: 'delta', text: 'Veja [a convenção](https://www.sindeprestem.com.br/c.pdf).' },
    { type: 'done', text: 'Veja [a convenção](https://www.sindeprestem.com.br/c.pdf).', restantes: 3 },
  ]);
  await page.goto('/');
  await page.getByLabel('Mensagem para SINDI').fill('Onde está a convenção?');
  await page.getByLabel('Mensagem para SINDI').press('Enter');
  await expect(page.getByRole('link', { name: 'a convenção' })).toBeVisible();
  await varrer(page, 'chat com conversa');
  await page.goto('/orcamento');
  await expect(page.getByText('Posto 1')).toBeVisible();
  await page.getByLabel(/Periculosidade/).check();
  await page.getByLabel('Insalubridade').selectOption('0.2');
  await expect(page.getByText(/não se acumulam/)).toBeVisible();
  await page.getByRole('button', { name: /Adicionar posto/ }).click();
  await varrer(page, 'orçamento com avisos');
});
test('teclado: dá para percorrer o cabeçalho e chegar à caixa do chat só com Tab, e o foco é visível', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'a navegação por Tab vale para o desktop');
  await page.goto('/');
  const focados: string[] = [];
  // O menu cresce a cada página nova (Jornada 42, Diagnóstico…): o limite acompanha, para o teste medir o caminho até a caixa do chat e não o tamanho do menu.
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press('Tab');
    focados.push(
      await page.evaluate(() => {
        const e = document.activeElement as HTMLElement;
        return `${e.tagName}:${e.getAttribute('aria-label') ?? e.textContent?.trim().slice(0, 30) ?? ''}`;
      }),
    );
    if (focados.at(-1)?.startsWith('TEXTAREA')) break;
  }
  expect(focados.at(-1), `ordem do foco: ${focados.join(' | ')}`).toMatch(/^TEXTAREA/);
  expect(focados.filter((f) => f.startsWith('A:')).length).toBeGreaterThanOrEqual(5);
  const contorno = await page.evaluate(() => {
    const e = document.activeElement as HTMLElement;
    const s = getComputedStyle(e);
    return `${s.outlineStyle}|${s.outlineWidth}|${s.boxShadow}`;
  });
  expect(contorno).not.toMatch(/^none\|0px\|none$/);
});
