import type { Page } from '@playwright/test';

export type EventoDoChat = { type: 'delta'; text: string } | { type: 'reset' } | { type: 'done'; text: string; restantes?: number } | { type: 'error'; error: string };

/**
 * Simula o /api/chat no navegador (a chamada ao Gemini é do servidor e não entra nos testes): devolve os eventos em NDJSON, um a cada `atrasoMs`, como a resposta real em fluxo.
 * `status` diferente de 200 devolve um erro JSON. Deve ser chamado antes de `page.goto`.
 */
export async function simularChat(page: Page, eventos: EventoDoChat[], { atrasoMs = 40, status = 200, erro = '' }: { atrasoMs?: number; status?: number; erro?: string } = {}) {
  await page.addInitScript(({ eventos, atrasoMs, status, erro }) => {
    const original = window.fetch.bind(window);
    (window as unknown as { __pedidosAoChat: unknown[] }).__pedidosAoChat = [];
    window.fetch = (entrada: RequestInfo | URL, init?: RequestInit) => {
      if (!String(entrada).endsWith('/api/chat')) return original(entrada, init);
      (window as unknown as { __pedidosAoChat: unknown[] }).__pedidosAoChat.push(JSON.parse(String(init?.body ?? '{}')));
      if (status !== 200) return Promise.resolve(Response.json({ error: erro }, { status }));
      const codificador = new TextEncoder(); let cancelado = false;
      const corpo = new ReadableStream({
        async start(c) {
          // Como um fetch de verdade: se a página cancela a requisição (botão Parar), a leitura falha com AbortError.
          init?.signal?.addEventListener('abort', () => { cancelado = true; try { c.error(new DOMException('abortado', 'AbortError')); } catch { /* já encerrado */ } }, { once: true });
          for (const e of eventos) { await new Promise(r => setTimeout(r, atrasoMs)); if (cancelado) return; c.enqueue(codificador.encode(JSON.stringify(e) + '\n')); }
          if (!cancelado) c.close();
        },
        cancel() { cancelado = true; },
      });
      return Promise.resolve(new Response(corpo, { headers: { 'content-type': 'application/x-ndjson' } }));
    };
  }, { eventos, atrasoMs, status, erro });
}

/** Erros que um visitante provocaria sem ver: erros de console, exceções da página e violações da política de segurança (CSP). */
export function vigiarErros(page: Page) {
  const erros: string[] = [];
  page.on('console', m => { if (m.type() === 'error') erros.push(`console: ${m.text()}`); });
  page.on('pageerror', e => erros.push(`exceção: ${e.message}`));
  page.on('requestfailed', r => { if (!r.url().includes('/_next/static/') || !/aborted/i.test(r.failure()?.errorText ?? '')) erros.push(`requisição falhou: ${r.url()} (${r.failure()?.errorText})`); });
  return { erros, async violacoesDeCsp() { return page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []); } };
}
/** Registra as violações de CSP que o navegador detectar; chamar antes de `page.goto`. */
export async function registrarViolacoesDeCsp(page: Page) {
  await page.addInitScript(() => { (window as unknown as { __csp: string[] }).__csp = []; document.addEventListener('securitypolicyviolation', e => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective}: ${e.blockedURI}`)); });
}

export const PAGINAS = ['/', '/orcamento', '/painel', '/base', '/uso'] as const;

/** Alertas da página, sem o anunciador de rota do Next (`#__next-route-announcer__`, que também tem role=alert e fica sempre no documento). */
export const alerta = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
/** A conversa visível (a região "Mensagens da conversa"), sem a cópia do texto que existe só para leitores de tela. */
export const conversa = (page: Page) => page.getByRole('region', { name: 'Mensagens da conversa' });
