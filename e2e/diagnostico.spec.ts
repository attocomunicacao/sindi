import { expect, test } from '@playwright/test';

// Privacidade do Diagnóstico de Exposição: as respostas existem só no navegador. Nenhuma requisição pode sair ao responder e nada pode ser guardado.
test('diagnóstico: responder as 15 perguntas não faz requisição à API nem grava no navegador, e o resultado aparece', async ({
  page,
}) => {
  const pedidos: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith('/api/') || r.method() !== 'GET') pedidos.push(`${r.method()} ${url.pathname}`);
  });
  await page.goto('/diagnostico');
  await page.waitForLoadState('networkidle');
  pedidos.length = 0;

  const grupos = page.locator('fieldset');
  await expect(grupos).toHaveCount(15);
  for (let i = 0; i < 15; i++) await grupos.nth(i).getByLabel('Não', { exact: true }).check();

  const resultado = page.getByRole('region', { name: 'Resultado do diagnóstico' });
  await expect(resultado).toBeVisible();
  await expect(resultado).toContainText('Vermelho');
  expect(pedidos, 'requisições feitas ao responder').toEqual([]);

  const guardado = await page.evaluate(() => ({
    local: window.localStorage.length,
    sessao: window.sessionStorage.length,
  }));
  expect(guardado).toEqual({ local: 0, sessao: 0 });

  await page.reload();
  await expect(page.getByText('Faltam 15 de 15 perguntas')).toBeVisible();
});
