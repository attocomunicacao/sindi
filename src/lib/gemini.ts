/**
 * Geração de texto pela API do Gemini (nível gratuito), por `fetch`, sem SDK. Só no servidor: a chave (`GEMINI_API_KEY`) nunca vai ao navegador, a URL nem os logs.
 *
 * - `GEMINI_MODEL`: modelo das respostas com fatos.
 * - `GEMINI_MODEL_RAPIDO`: opcional, para saudação, recusa e encaminhamento (texto curto, que o servidor já decidiu). Vazio usa só o principal.
 * - O nível gratuito tem limites por minuto e por dia que só o AI Studio mostra; a cota de mensagens (cota.ts) existe para não estourá-los.
 */
type Message = { role: 'system' | 'user' | 'assistant'; content: string };
export const MODELO_PADRAO = 'gemini-3.5-flash-lite';
export const modeloPrincipal = () => process.env.GEMINI_MODEL || MODELO_PADRAO;
export const modeloRapido = () => process.env.GEMINI_MODEL_RAPIDO ?? '';
const API = 'https://generativelanguage.googleapis.com/v1beta';
const inteiro = (valor: string | undefined, padrao: number, minimo: number, maximo: number) => { const n = Number(valor); return valor && Number.isInteger(n) && n >= minimo && n <= maximo ? n : padrao; };
export class LlmError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
export const chaveConfigurada = () => Boolean(process.env.GEMINI_API_KEY);

/** Mensagem em português para o limite do provedor; lê o tempo de espera informado por ele (`retryDelay`), sem expor o corpo da resposta. */
export function mensagemDeLimite(corpo?: string) {
  const base = 'O limite gratuito do modelo foi atingido.';
  try {
    const detalhes = JSON.parse(corpo || '{}').error?.details;
    const atraso = Array.isArray(detalhes) ? detalhes.find(d => typeof d?.retryDelay === 'string')?.retryDelay : undefined;
    const segundos = typeof atraso === 'string' && /^\d+(\.\d+)?s$/.test(atraso) ? Math.ceil(Number(atraso.slice(0, -1))) : 0;
    if (!segundos) return `${base} Tente novamente em alguns minutos.`;
    const minutos = Math.ceil(segundos / 60);
    return `${base} Tente novamente em ${minutos >= 60 ? `${Math.floor(minutos / 60)} h ${minutos % 60} min` : `${Math.max(1, minutos)} min`}.`;
  } catch { return `${base} Tente novamente em alguns minutos.`; }
}

// Poucas gerações ao mesmo tempo (o nível gratuito limita requisições por minuto) e uma fila curta: acima disso o pedido é recusado em vez de esperar sem fim.
let ativos = 0; const fila: (() => void)[] = [];
const limiteSimultaneo = () => inteiro(process.env.SINDI_CONCORRENCIA, 4, 1, 16);
const limiteDaFila = () => inteiro(process.env.SINDI_FILA_MAX, 40, 1, 500);
async function entrarNaVez(signal: AbortSignal) {
  signal.throwIfAborted();
  if (ativos < limiteSimultaneo()) { ativos++; return; }
  if (fila.length >= limiteDaFila()) throw new LlmError('Há muitas conversas acontecendo agora. Tente novamente em instantes.', 503);
  await new Promise<void>((resolve, reject) => {
    const vez = () => { signal.removeEventListener('abort', desistir); ativos++; resolve(); };
    const desistir = () => { const i = fila.indexOf(vez); if (i >= 0) fila.splice(i, 1); reject(signal.reason); };
    fila.push(vez); signal.addEventListener('abort', desistir, { once: true });
  });
}
function sairDaVez() { ativos--; fila.shift()?.(); }

/** Papéis do Gemini: `system` vira `systemInstruction`; `assistant` vira `model`; turnos seguidos do mesmo papel são unidos. */
export function montarCorpo(messages: Message[], opcoes: { temperature?: number; maxTokens?: number } = {}) {
  const sistema = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  for (const m of messages.filter(m => m.role !== 'system')) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    if (contents.at(-1)?.role === role) contents.at(-1)!.parts.push({ text: m.content }); else contents.push({ role, parts: [{ text: m.content }] });
  }
  // Modelos com raciocínio contam o "pensar" no teto de saída: GEMINI_FOLGA_TOKENS dá espaço extra e GEMINI_PENSAMENTO limita o orçamento de raciocínio (0 desliga, nos modelos que permitem).
  const folga = inteiro(process.env.GEMINI_FOLGA_TOKENS, 0, 0, 4096);
  const pensamento = process.env.GEMINI_PENSAMENTO !== undefined && process.env.GEMINI_PENSAMENTO !== '' ? inteiro(process.env.GEMINI_PENSAMENTO, -1, 0, 24576) : -1;
  return {
    ...(sistema ? { systemInstruction: { parts: [{ text: sistema }] } } : {}),
    contents,
    generationConfig: {
      temperature: opcoes.temperature ?? 0.2, topP: 0.9,
      ...(opcoes.maxTokens ? { maxOutputTokens: opcoes.maxTokens + folga } : {}),
      ...(pensamento >= 0 ? { thinkingConfig: { thinkingBudget: pensamento } } : {}),
    },
  };
}

type Pedaco = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }; promptFeedback?: { blockReason?: string } };
const contagem = (valor: unknown) => typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0 ? valor : undefined;
const textoDoPedaco = (p: Pedaco) => (p.candidates?.[0]?.content?.parts ?? []).filter(parte => !parte.thought && typeof parte.text === 'string').map(parte => parte.text).join('');

function erroHttp(status: number, corpo: string) {
  if (status === 429) return new LlmError(mensagemDeLimite(corpo), 429);
  if (status === 400 || status === 401 || status === 403) return new LlmError('O serviço de IA recusou o pedido. Verifique a chave e o modelo configurados.', 503);
  if (status === 404) return new LlmError('O modelo configurado não foi encontrado. Verifique GEMINI_MODEL.', 404);
  return new LlmError('O serviço de IA não conseguiu gerar a resposta agora. Tente novamente.', 502);
}

export async function gerarTexto(messages: Message[], signal: AbortSignal, onDelta?: (text: string) => void, opcoes?: { temperature?: number; maxTokens?: number }, modelo?: string) {
  if (!chaveConfigurada()) throw new LlmError('O serviço de IA ainda não foi configurado (GEMINI_API_KEY).', 503);
  await entrarNaVez(signal);
  try {
    const nome = modelo || modeloPrincipal();
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(nome)) throw new LlmError('Nome de modelo inválido.', 503);
    const streaming = Boolean(onDelta);
    const url = `${API}/models/${nome}:${streaming ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
    // O tempo limite da chamada só começa a contar agora, quando a vez chegou: quem esperou na fila não perde tempo da própria geração.
    const sinalDaChamada = AbortSignal.any([signal, AbortSignal.timeout(inteiro(process.env.SINDI_TIMEOUT_MS, 45000, 1, 240000))]);
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! }, body: JSON.stringify(montarCorpo(messages, opcoes)), cache: 'no-store', signal: sinalDaChamada });
    if (!response.ok) throw erroHttp(response.status, await response.text().catch(() => ''));
    let content = ''; let finish: string | undefined; let usage: Pedaco['usageMetadata']; let bloqueio: string | undefined;
    const absorver = (pedaco: Pedaco) => {
      if (pedaco.promptFeedback?.blockReason) bloqueio = pedaco.promptFeedback.blockReason;
      const texto = textoDoPedaco(pedaco);
      if (texto) { content += texto; if (streaming) onDelta!(texto); }
      finish = pedaco.candidates?.[0]?.finishReason ?? finish; usage = pedaco.usageMetadata ?? usage;
    };
    if (streaming) {
      if (!response.body) throw new LlmError('O serviço de IA devolveu uma resposta incompleta.', 502);
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      const inatividade = inteiro(process.env.SINDI_INATIVIDADE_MS, 30000, 1000, 120000);
      const linha = (texto: string) => {
        if (!texto.startsWith('data:')) return;
        let pedaco: Pedaco; try { pedaco = JSON.parse(texto.slice(5)); } catch { throw new LlmError('O serviço de IA interrompeu a resposta.', 502); }
        absorver(pedaco);
      };
      try {
        while (true) {
          // Sem nenhum dado por muito tempo, a conexão é considerada travada.
          let relogio: ReturnType<typeof setTimeout> | undefined;
          const lido = await Promise.race([reader.read(), new Promise<never>((_, rejeitar) => { relogio = setTimeout(() => rejeitar(new LlmError('O serviço de IA demorou para responder. Tente novamente.', 504)), inatividade); })]).finally(() => clearTimeout(relogio));
          buffer += lido.done ? decoder.decode() : decoder.decode(lido.value, { stream: true });
          const linhas = buffer.split('\n'); buffer = linhas.pop() || '';
          if (lido.done && buffer.trim()) { linhas.push(buffer); buffer = ''; }
          for (const l of linhas) linha(l.trim());
          if (lido.done) break;
        }
      } finally { reader.cancel().catch(() => {}); }
    } else absorver(await response.json() as Pedaco);
    if (bloqueio && !content.trim()) throw new LlmError('Não foi possível responder a esta pergunta. Tente reformulá-la.', 422);
    if (!finish && !content.trim()) throw new LlmError('O serviço de IA devolveu uma resposta incompleta.', 502);
    const entrada = contagem(usage?.promptTokenCount); const saida = contagem(usage?.candidatesTokenCount);
    return { text: content.trim(), truncada: finish === 'MAX_TOKENS', usage: { inputTokens: entrada, outputTokens: saida, totalTokens: contagem(usage?.totalTokenCount) ?? (entrada !== undefined && saida !== undefined ? entrada + saida : undefined) } };
  } finally { sairDaVez(); }
}
