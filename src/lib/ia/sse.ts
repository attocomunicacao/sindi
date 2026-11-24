import { inteiro, LlmError } from '@/lib/ia/tipos';

/**
 * Lê um corpo SSE (`data: ...` por linha) pedaço a pedaço, juntando linhas quebradas entre pedaços e caracteres UTF-8 partidos. Sem dado nenhum por
 * `inatividadeMs`, a conexão é considerada travada (504). Comum ao Gemini e aos provedores compatíveis com a API da OpenAI.
 */
export async function lerSse(corpo: ReadableStream<Uint8Array>, aoLer: (dados: string) => void | 'fim', inatividadeMs = inteiro(process.env.SINDI_INATIVIDADE_MS, 30000, 1000, 120000)) {
  const reader = corpo.getReader(); const decoder = new TextDecoder(); let buffer = ''; let terminou = false;
  const linha = (texto: string) => { if (!terminou && texto.startsWith('data:') && aoLer(texto.slice(5).trim()) === 'fim') terminou = true; };
  try {
    while (!terminou) {
      let relogio: ReturnType<typeof setTimeout> | undefined;
      const lido = await Promise.race([
        reader.read(),
        new Promise<never>((_, rejeitar) => { relogio = setTimeout(() => rejeitar(new LlmError('O serviço de IA demorou para responder. Tente novamente.', 504)), inatividadeMs); }),
      ]).finally(() => clearTimeout(relogio));
      buffer += lido.done ? decoder.decode() : decoder.decode(lido.value, { stream: true });
      const linhas = buffer.split('\n'); buffer = linhas.pop() || '';
      if (lido.done && buffer.trim()) { linhas.push(buffer); buffer = ''; }
      for (const l of linhas) linha(l.trim());
      if (lido.done) break;
    }
  } finally { reader.cancel().catch(() => {}); }
}
