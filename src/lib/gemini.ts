/**
 * Provedor Gemini (nível gratuito), por `fetch`, sem SDK. Só no servidor: a chave (`GEMINI_API_KEY`) nunca vai ao navegador, a URL nem os logs.
 * É o primeiro degrau da cascata (src/lib/ia/cascata.ts); o chat chama a cascata, não este arquivo.
 *
 * - `GEMINI_MODEL`: modelo das respostas com fatos.
 * - `GEMINI_MODEL_RAPIDO`: opcional, para saudação, recusa e encaminhamento. Vazio usa só o principal.
 */
import { contagem, inteiro, LlmError, NOME_DE_MODELO, type Mensagem, type Nivel, type OpcoesDeGeracao, type Provedor, type Resultado } from './ia/tipos';
import { lerSse } from './ia/sse';
import { entrarNaVez, sairDaVez } from './ia/vez';

export { LlmError } from './ia/tipos';
type Message = Mensagem;
export const MODELO_PADRAO = 'gemini-3.5-flash-lite';
export const modeloPrincipal = () => process.env.GEMINI_MODEL || MODELO_PADRAO;
export const modeloRapido = () => process.env.GEMINI_MODEL_RAPIDO ?? '';
const API = 'https://generativelanguage.googleapis.com/v1beta';
export const chaveConfigurada = () => Boolean(process.env.GEMINI_API_KEY);

/** Segundos de espera informados pelo Gemini num 429 (`retryDelay`, ex.: "125s"), sem expor o corpo da resposta. */
export function esperaDoGemini(corpo?: string): number | undefined {
  try {
    const detalhes = JSON.parse(corpo || '{}').error?.details;
    const atraso = Array.isArray(detalhes) ? detalhes.find(d => typeof d?.retryDelay === 'string')?.retryDelay : undefined;
    return typeof atraso === 'string' && /^\d+(\.\d+)?s$/.test(atraso) ? Math.ceil(Number(atraso.slice(0, -1))) : undefined;
  } catch { return undefined; }
}
/**
 * Mensagem em português para o limite do provedor. Com a cascata ela não chega mais à tela (o próximo provedor responde); fica para os registros e para
 * quem chamar o Gemini direto.
 */
export function mensagemDeLimite(corpo?: string) {
  const base = 'O limite gratuito do modelo foi atingido.';
  const segundos = esperaDoGemini(corpo);
  if (!segundos) return `${base} Tente novamente em alguns minutos.`;
  const minutos = Math.ceil(segundos / 60);
  return `${base} Tente novamente em ${minutos >= 60 ? `${Math.floor(minutos / 60)} h ${minutos % 60} min` : `${Math.max(1, minutos)} min`}.`;
}

/** Papéis do Gemini: `system` vira `systemInstruction`; `assistant` vira `model`; turnos seguidos do mesmo papel são unidos. */
export function montarCorpo(messages: Message[], opcoes: OpcoesDeGeracao = {}) {
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
const textoDoPedaco = (p: Pedaco) => (p.candidates?.[0]?.content?.parts ?? []).filter(parte => !parte.thought && typeof parte.text === 'string').map(parte => parte.text).join('');

function erroHttp(status: number, corpo: string) {
  if (status === 429) return new LlmError(mensagemDeLimite(corpo), 429, 'limite', esperaDoGemini(corpo));
  if (status === 400 || status === 401 || status === 403) return new LlmError('O serviço de IA recusou o pedido. Verifique a chave e o modelo configurados.', 503, 'configuracao');
  if (status === 404) return new LlmError('O modelo configurado não foi encontrado. Verifique GEMINI_MODEL.', 404, 'configuracao');
  return new LlmError('O serviço de IA não conseguiu gerar a resposta agora. Tente novamente.', 502);
}

/** Uma chamada ao Gemini, sem fila (a fila é da cascata). O tempo limite conta a partir daqui. */
export async function gerarNoGemini(messages: Message[], signal: AbortSignal, onDelta?: (text: string) => void, opcoes?: OpcoesDeGeracao, modelo?: string): Promise<Resultado> {
  if (!chaveConfigurada()) throw new LlmError('O serviço de IA ainda não foi configurado (GEMINI_API_KEY).', 503, 'configuracao');
  const nome = modelo || modeloPrincipal();
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(nome) || !NOME_DE_MODELO.test(nome)) throw new LlmError('Nome de modelo inválido.', 503, 'configuracao');
  const streaming = Boolean(onDelta);
  const url = `${API}/models/${nome}:${streaming ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
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
    await lerSse(response.body, dados => {
      let pedaco: Pedaco; try { pedaco = JSON.parse(dados); } catch { throw new LlmError('O serviço de IA interrompeu a resposta.', 502); }
      absorver(pedaco);
    });
  } else absorver(await response.json() as Pedaco);
  if (bloqueio && !content.trim()) throw new LlmError('Não foi possível responder a esta pergunta. Tente reformulá-la.', 422, 'bloqueio');
  if (!finish && !content.trim()) throw new LlmError('O serviço de IA devolveu uma resposta incompleta.', 502);
  const entrada = contagem(usage?.promptTokenCount); const saida = contagem(usage?.candidatesTokenCount);
  return { text: content.trim(), truncada: finish === 'MAX_TOKENS', modelo: nome, usage: { inputTokens: entrada, outputTokens: saida, totalTokens: contagem(usage?.totalTokenCount) ?? (entrada !== undefined && saida !== undefined ? entrada + saida : undefined) } };
}

/** O Gemini como degrau da cascata. */
export const provedorGemini: Provedor = {
  id: 'gemini',
  configurado: chaveConfigurada,
  modelo: (nivel: Nivel) => (nivel === 'rapido' && modeloRapido()) || modeloPrincipal(),
  gerar: (mensagens, signal, onDelta, opcoes, nivel) => gerarNoGemini(mensagens, signal, onDelta, opcoes, provedorGemini.modelo(nivel)),
};

/** Chamada direta ao Gemini com fila (sem cascata). Mantida para scripts e testes do provedor; o chat usa `gerarTexto` de src/lib/ia/cascata.ts. */
export async function gerarTexto(messages: Message[], signal: AbortSignal, onDelta?: (text: string) => void, opcoes?: OpcoesDeGeracao, modelo?: string) {
  if (!chaveConfigurada()) throw new LlmError('O serviço de IA ainda não foi configurado (GEMINI_API_KEY).', 503, 'configuracao');
  await entrarNaVez(signal);
  try { return await gerarNoGemini(messages, signal, onDelta, opcoes, modelo); } finally { sairDaVez(); }
}
