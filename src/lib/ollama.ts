import { availableParallelism } from 'node:os';
type Message = { role: 'system' | 'user' | 'assistant'; content: string };
let queue: Promise<unknown> = Promise.resolve();
/**
 * Dois modelos, criados por `npm run modelo:criar` com os parâmetros desta máquina:
 * - `sindi` (qwen2.5:3b): escreve as respostas com fatos. É o menor que, medido em 13/10/2026, não troca nem inventa o que está nas fontes.
 * - `sindi-rapido` (qwen2.5:1.5b): duas vezes mais rápido e com metade da memória, só para o que é curto e roteirizado (saudação, recusa, encaminhamento).
 *   `SINDI_MODELO_RAPIDO=` (vazio) desliga o rápido; `OLLAMA_MODEL=sindi-rapido` usa só ele, com perda de fidelidade.
 */
export const MODELO_PADRAO = 'sindi';
export const modeloPrincipal = () => process.env.OLLAMA_MODEL || MODELO_PADRAO;
export const modeloRapido = () => process.env.SINDI_MODELO_RAPIDO ?? 'sindi-rapido';
const inteiro = (valor: string | undefined, padrao: number, minimo: number, maximo: number) => { const n = Number(valor); return valor && Number.isInteger(n) && n >= minimo && n <= maximo ? n : padrao; };
/**
 * Parâmetros de geração pensados para CPU. Temperatura baixa reduz invenções em modelos pequenos. A janela de contexto de 4.096 tokens cabe as regras, os exemplos,
 * as fontes e duas trocas de histórico, e usa cerca de metade da memória da janela anterior (8.192). As threads deixam núcleos livres para o resto do computador:
 * medido nesta máquina (12 núcleos lógicos), 8 threads leem 7% mais devagar que todas e mantêm o computador utilizável. Tudo é ajustável por variável de ambiente.
 */
export function geracao() {
  const temperatura = Number(process.env.SINDI_TEMPERATURA);
  return { temperature: process.env.SINDI_TEMPERATURA && temperatura >= 0 && temperatura <= 1 ? temperatura : 0.2, top_p: 0.9, repeat_penalty: 1.1, num_ctx: inteiro(process.env.SINDI_NUM_CTX, 4096, 1024, 32768),
    num_thread: inteiro(process.env.SINDI_NUM_THREAD, Math.max(2, availableParallelism() - 4), 1, 64) };
}
export class OllamaError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
export async function ollamaChat(messages: Message[], signal: AbortSignal, onDelta?: (text: string) => void, structured?: { format?: object; options: { temperature?: number; num_predict?: number } }, modelo?: string) {
  const operation = queue.then(async () => {
    signal.throwIfAborted();
    const base = new URL(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434');
    const model = modelo || modeloPrincipal();
    // Old Qwen3 templates may mix reasoning into content; buffer those responses.
    const streaming = Boolean(onDelta) && !model.startsWith('qwen3');
    // Qwen's soft switch also supports templates that ignore the API think flag.
    const prompt = messages.map((message, index) => model.startsWith('qwen3') && index === messages.length - 1 && message.role === 'user'
      ? { ...message, content: `${message.content}\n/no_think` } : message);
    // Public deployments need a separately secured connection to the local computer.
    if (!['http:', 'https:'].includes(base.protocol) || (process.env.VERCEL && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) {
      throw new OllamaError('Esta hospedagem precisa de uma conexão segura com o computador que executa o Ollama.');
    }
    const response = await fetch(new URL('/api/chat', base), {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.OLLAMA_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.OLLAMA_ACCESS_TOKEN}` } : {}) },
      body: JSON.stringify({ model, messages: prompt, stream: streaming, think: false, keep_alive: process.env.SINDI_KEEP_ALIVE || '20m', ...structured, options: { ...geracao(), ...structured?.options } }),
      cache: 'no-store', signal,
    });
    if (response.status === 404) throw new OllamaError('O modelo local não foi encontrado. Crie o modelo da SINDI com o comando npm run modelo:criar (ou defina OLLAMA_MODEL com um modelo instalado no Ollama).', 404);
    if (!response.ok) throw new OllamaError('O Ollama não conseguiu gerar a resposta. Verifique se o modelo está disponível.');
    let result;
    if (streaming) {
      if (!response.body) throw new OllamaError('O Ollama devolveu uma resposta incompleta.', 502);
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let content = '';
      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
          const lines = buffer.split('\n'); buffer = lines.pop() || '';
          if (done && buffer.trim()) { lines.push(buffer); buffer = ''; }
          for (const line of lines.filter(line => line.trim())) {
            const chunk = JSON.parse(line);
            if (chunk.error) throw new OllamaError('O Ollama interrompeu a resposta.', 502);
            const delta = chunk.message?.content;
            if (typeof delta === 'string' && delta) { content += delta; onDelta?.(delta); }
            if (chunk.done) result = { ...chunk, message: { content } };
          }
          if (done) break;
        }
      } finally { reader.releaseLock(); }
    } else result = await response.json();
    if (result?.done !== true || typeof result.message?.content !== 'string') throw new OllamaError('O Ollama devolveu uma resposta incompleta.', 502);
    const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
    const inputTokens = count(result.prompt_eval_count);
    const outputTokens = count(result.eval_count);
    const content = result.message.content as string;
    // Older templates can put reasoning in content, even without an opening tag.
    const closing = content.lastIndexOf('</think>');
    const text = (closing >= 0 ? content.slice(closing + '</think>'.length) : content.replace(/<think>[\s\S]*$/i, '')).trim();
    if (onDelta && !streaming && text) onDelta(text);
    // `length`: o teto de tokens cortou a resposta no meio.
    return { text, truncada: result.done_reason === 'length', usage: { inputTokens, outputTokens, totalTokens: inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined } };
  });
  // One generation at a time in this server process; failed requests do not stop the queue.
  queue = operation.catch(() => {});
  return operation;
}
