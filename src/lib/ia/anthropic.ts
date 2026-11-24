import Anthropic from '@anthropic-ai/sdk';
import type { Mensagem } from '@/lib/base/tipos';
import { contagem, env, LlmError, type Nivel, type OpcoesDeGeracao, type Provedor, type Resultado } from '@/lib/ia/tipos';

/**
 * Claude (Anthropic), pela SDK oficial. **Pago e desligado por padrão**: só entra na cascata com `ANTHROPIC_API_KEY` no servidor, o que só deve acontecer
 * com autorização expressa (AGENTS.md: nada de plano pago sem autorização). Existe para a versão vendida ao sindicato; a página /custos estima o gasto.
 *
 * - `ANTHROPIC_MODEL` (padrão `claude-haiku-5-5`) e `ANTHROPIC_MODEL_RAPIDO` (padrão: o mesmo).
 * - Sem raciocínio estendido (chatbot curto: menos latência e custo) e sem novas tentativas da SDK (quem tenta de novo é a cascata, com outro provedor).
 */
const MODELO_ANTHROPIC_PADRAO = 'claude-haiku-5-5';
const modelo = (nivel: Nivel) => (nivel === 'rapido' && env('ANTHROPIC_MODEL_RAPIDO')) || env('ANTHROPIC_MODEL') || MODELO_ANTHROPIC_PADRAO;

let cliente: { chave: string; sdk: Anthropic } | undefined;
function sdk() {
  const chave = env('ANTHROPIC_API_KEY'); if (!chave) throw new LlmError('Provedor não configurado.', 503, 'configuracao');
  if (cliente?.chave !== chave) cliente = { chave, sdk: new Anthropic({ apiKey: chave, maxRetries: 0, timeout: 45_000 }) };
  return cliente.sdk;
}

function traduzir(falha: unknown): unknown {
  if (falha instanceof Anthropic.APIUserAbortError) return falha;
  if (falha instanceof Anthropic.RateLimitError) {
    const espera = Number(falha.headers?.get('retry-after'));
    return new LlmError('Limite do provedor atingido.', 429, 'limite', Number.isFinite(espera) ? espera : undefined);
  }
  if (falha instanceof Anthropic.AuthenticationError || falha instanceof Anthropic.PermissionDeniedError || falha instanceof Anthropic.NotFoundError) return new LlmError('Provedor recusou a chave ou o modelo configurado.', 503, 'configuracao');
  if (falha instanceof Anthropic.APIError) return new LlmError('Provedor indisponível.', 502, 'indisponivel');
  return falha;
}

async function gerarNaAnthropic(mensagens: Mensagem[], signal: AbortSignal, onDelta: ((t: string) => void) | undefined, opcoes: OpcoesDeGeracao, nivel: Nivel): Promise<Resultado> {
  const sistema = mensagens.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const conversa = mensagens.filter((m): m is Mensagem & { role: 'user' | 'assistant' } => m.role !== 'system');
  // Regras e exemplos vêm sempre iguais e primeiro: o ponto de cache fica no fim do último exemplo fixo (a mensagem antes da conversa real).
  const ultimoFixo = conversa.length - 1 - [...conversa].reverse().findIndex(m => m.role === 'assistant');
  const messages: Anthropic.MessageParam[] = conversa.map((m, i) => ({
    role: m.role,
    content: i === ultimoFixo && i < conversa.length - 1 ? [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] : m.content,
  }));
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: modelo(nivel), max_tokens: (opcoes.maxTokens ?? 400) + 64, messages,
    ...(sistema ? { system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }] } : {}),
    thinking: { type: 'disabled' },
  };
  try {
    const final = onDelta
      ? await (() => { const fluxo = sdk().messages.stream(params, { signal }); fluxo.on('text', delta => { if (delta) onDelta(delta); }); return fluxo.finalMessage(); })()
      : await sdk().messages.create(params, { signal });
    if (final.stop_reason === 'refusal') throw new LlmError('Não foi possível responder a esta pergunta. Tente reformulá-la.', 422, 'bloqueio');
    const texto = final.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();
    if (!texto) throw new LlmError('Provedor devolveu resposta vazia.', 502);
    const u = final.usage; const entrada = (contagem(u.input_tokens) ?? 0) + (contagem(u.cache_read_input_tokens) ?? 0) + (contagem(u.cache_creation_input_tokens) ?? 0);
    const saida = contagem(u.output_tokens);
    return { text: texto, truncada: final.stop_reason === 'max_tokens', modelo: params.model, usage: { inputTokens: entrada, outputTokens: saida, totalTokens: saida !== undefined ? entrada + saida : undefined } };
  } catch (falha) { throw traduzir(falha); }
}

export const provedorAnthropic: Provedor = {
  id: 'anthropic',
  configurado: () => Boolean(env('ANTHROPIC_API_KEY')),
  modelo,
  gerar: gerarNaAnthropic,
};
