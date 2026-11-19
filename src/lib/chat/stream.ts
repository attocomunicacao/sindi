/**
 * Resposta em NDJSON: um evento por linha (`delta`, `reset`, `done` ou `error`). Quem lê pode cancelar (botão Parar): o cancelamento aborta a geração no servidor.
 * `gerar` recebe os callbacks de `delta` e `reset` e devolve a resposta JSON final (a mesma que o pedido sem streaming devolveria).
 */
export function respostaEmFluxo(gerar: (onDelta: (texto: string) => void, onReset: () => void) => Promise<Response>, controller: AbortController) {
  const encoder = new TextEncoder(); let cancelled = false;
  const stream = new ReadableStream({
    async start(streamController) {
      const send = (event: object) => { if (!cancelled) streamController.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); };
      const response = await gerar(text => send({ type: 'delta', text }), () => send({ type: 'reset' }));
      const data = await response.json();
      send(response.ok ? { type: 'done', ...data } : { type: 'error', error: data.error });
      if (!cancelled) streamController.close();
    },
    cancel() { cancelled = true; controller.abort(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
