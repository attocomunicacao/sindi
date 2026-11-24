import { contagem, esperaDoCabecalho, LlmError, NOME_DE_MODELO, tempoLimiteMs, type Nivel, type OpcoesDeGeracao, type Provedor, type Resultado } from '@/lib/ia/tipos';
import type { Mensagem } from '@/lib/base/tipos';
import { lerSse } from '@/lib/ia/sse';

/**
 * Um adaptador para todos os provedores que seguem a API de chat da OpenAI (`POST {base}/chat/completions`, SSE com `data: [DONE]`): Groq, OpenRouter,
 * Mistral, Cloudflare Workers AI e o Ollama local. Cada um muda só a configuração abaixo. Sem SDK: `fetch`, como o Gemini.
 */
type ConfigCompat = {
  id: string;
  /** Endereço base (sem `/chat/completions`). `undefined` = provedor não configurado. */
  base: () => string | undefined;
  /** Chave (Authorization: Bearer). Provedor local aceita sem chave. */
  chave: () => string | undefined;
  modelos: (nivel: Nivel) => string;
  local?: boolean;
  /** Tokens extras no teto de saída (modelos com raciocínio contam o "pensar" no teto). */
  folga?: number;
  /** Campos extras do corpo, específicos do provedor (ex.: `reasoning_effort`). */
  extras?: (modelo: string) => Record<string, unknown>;
  /** O provedor aceita `stream_options.include_usage` (tokens no último pedaço). */
  usoNoFluxo?: boolean;
  /** Tempo limite da chamada e de inatividade do fluxo, em ms. */
  tempoMs?: () => number;
  inatividadeMs?: () => number;
  /** Cabeçalhos extras (ex.: identificação do app no OpenRouter). */
  cabecalhos?: () => Record<string, string>;
};

type Pedaco = {
  choices?: { delta?: { content?: string | null }; message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string; code?: number | string };
};

function erroHttp(status: number, espera: number | undefined) {
  // 402: crédito/saldo do nível gratuito esgotado (OpenRouter); para a cascata é o mesmo que limite.
  if (status === 429 || status === 402) return new LlmError('Limite do provedor atingido.', 429, 'limite', espera);
  if (status === 401 || status === 403 || status === 404) return new LlmError('Provedor recusou a chave ou o modelo configurado.', 503, 'configuracao');
  if (status === 400 || status === 413 || status === 422) return new LlmError('Provedor recusou o formato do pedido.', 502, 'indisponivel');
  return new LlmError('Provedor indisponível.', 502, 'indisponivel');
}

async function gerarCompat(cfg: ConfigCompat, mensagens: Mensagem[], signal: AbortSignal, onDelta: ((t: string) => void) | undefined, opcoes: OpcoesDeGeracao, nivel: Nivel): Promise<Resultado> {
  const base = cfg.base(); const chave = cfg.chave();
  if (!base || (!cfg.local && !chave)) throw new LlmError('Provedor não configurado.', 503, 'configuracao');
  const modelo = cfg.modelos(nivel);
  if (!NOME_DE_MODELO.test(modelo)) throw new LlmError('Nome de modelo inválido.', 503, 'configuracao');
  const streaming = Boolean(onDelta);
  const corpo = {
    model: modelo,
    messages: mensagens.map(m => ({ role: m.role, content: m.content })),
    temperature: opcoes.temperature ?? 0.2, top_p: 0.9,
    ...(opcoes.maxTokens ? { max_tokens: opcoes.maxTokens + (cfg.folga ?? 0) } : {}),
    stream: streaming,
    ...(streaming && cfg.usoNoFluxo ? { stream_options: { include_usage: true } } : {}),
    ...cfg.extras?.(modelo),
  };
  const sinal = AbortSignal.any([signal, AbortSignal.timeout(cfg.tempoMs?.() ?? tempoLimiteMs())]);
  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST', cache: 'no-store', signal: sinal, body: JSON.stringify(corpo),
      headers: { 'Content-Type': 'application/json', ...(chave ? { Authorization: `Bearer ${chave}` } : {}), ...cfg.cabecalhos?.() },
    });
  } catch (falha) {
    if (signal.aborted) throw falha;
    // Rede fora, DNS, conexão recusada (Ollama desligado) ou tempo esgotado: o próximo provedor tenta.
    throw new LlmError('Provedor inacessível.', 502, 'indisponivel');
  }
  if (!response.ok) { await response.body?.cancel().catch(() => {}); throw erroHttp(response.status, esperaDoCabecalho(response.headers.get('retry-after'))); }

  let texto = ''; let fim: string | undefined; let uso: Pedaco['usage'];
  const absorver = (p: Pedaco) => {
    // Erro no meio do fluxo (OpenRouter manda um pedaço com `error` e finish_reason "error" depois do HTTP 200).
    if (p.error || p.choices?.[0]?.finish_reason === 'error') {
      const codigo = Number(p.error?.code);
      throw codigo === 429 || codigo === 402 ? new LlmError('Limite do provedor atingido.', 429, 'limite') : new LlmError('Provedor interrompeu a resposta.', 502, 'indisponivel');
    }
    const escolha = p.choices?.[0];
    const parte = streaming ? escolha?.delta?.content : escolha?.message?.content;
    if (typeof parte === 'string' && parte) { texto += parte; if (streaming) onDelta!(parte); }
    fim = escolha?.finish_reason ?? fim; uso = p.usage ?? uso;
  };
  if (streaming) {
    if (!response.body) throw new LlmError('Provedor devolveu resposta incompleta.', 502);
    await lerSse(response.body, dados => {
      if (dados === '[DONE]') return 'fim';
      let p: Pedaco; try { p = JSON.parse(dados); } catch { throw new LlmError('Provedor interrompeu a resposta.', 502); }
      absorver(p); return undefined;
    }, cfg.inatividadeMs?.());
  } else {
    let p: Pedaco; try { p = await response.json() as Pedaco; } catch { throw new LlmError('Provedor devolveu resposta inválida.', 502); }
    absorver(p);
  }
  if (fim === 'content_filter' && !texto.trim()) throw new LlmError('Não foi possível responder a esta pergunta. Tente reformulá-la.', 422, 'bloqueio');
  if (!texto.trim()) throw new LlmError('Provedor devolveu resposta vazia.', 502);
  const entrada = contagem(uso?.prompt_tokens); const saida = contagem(uso?.completion_tokens);
  return {
    text: texto.trim(), truncada: fim === 'length', modelo,
    usage: { inputTokens: entrada, outputTokens: saida, totalTokens: contagem(uso?.total_tokens) ?? (entrada !== undefined && saida !== undefined ? entrada + saida : undefined) },
  };
}

export const provedorCompat = (cfg: ConfigCompat): Provedor => ({
  id: cfg.id, local: cfg.local,
  configurado: () => Boolean(cfg.base()) && (Boolean(cfg.local) || Boolean(cfg.chave())),
  modelo: cfg.modelos,
  gerar: (mensagens, signal, onDelta, opcoes, nivel) => gerarCompat(cfg, mensagens, signal, onDelta, opcoes, nivel),
});
