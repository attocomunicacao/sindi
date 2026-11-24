/**
 * Contrato comum dos provedores de IA da SINDI. Todo provedor recebe as mesmas mensagens (regras, exemplos, histórico e o pedido com as fontes) e devolve
 * o mesmo formato; a cascata (cascata.ts) escolhe quem responde. Nada aqui chega ao navegador.
 */
import type { Mensagem } from '@/lib/base/tipos';

/** `principal`: respostas com fatos. `rapido`: saudação, recusa e encaminhamento (texto curto que o servidor já decidiu). */
export type Nivel = 'principal' | 'rapido';
export type OpcoesDeGeracao = { temperature?: number; maxTokens?: number };
export type Uso = { inputTokens?: number; outputTokens?: number; totalTokens?: number };
export type Resultado = { text: string; truncada: boolean; usage: Uso; provedor?: string; modelo?: string };

/**
 * Por que o provedor falhou, para a cascata decidir o que fazer:
 * - `limite`: cota/limite do provedor (429, crédito esgotado) — pula e espera o tempo informado;
 * - `configuracao`: chave ou modelo errado (401/403/404) — pula por muito tempo;
 * - `indisponivel`: erro do provedor, rede, resposta quebrada — pula por pouco tempo;
 * - `bloqueio`: o conteúdo foi recusado pela política do provedor — o provedor não fica de castigo (a recusa é do pedido, não dele); a cascata tenta o
 *   próximo, que tem outra política, e, se todos recusarem, pede para reformular a pergunta.
 */
type TipoDeFalha = 'limite' | 'configuracao' | 'indisponivel' | 'bloqueio';
export class LlmError extends Error {
  constructor(
    message: string,
    public status = 503,
    public tipo: TipoDeFalha = 'indisponivel',
    public esperaSegundos?: number,
  ) {
    super(message);
  }
}

export type Provedor = {
  id: string;
  /** Tem credencial/endereço configurado (sem isso, não entra na cascata). */
  configurado: () => boolean;
  /** Nome do modelo usado para o nível pedido (para métricas e para a chave de deduplicação). */
  modelo: (nivel: Nivel) => string;
  /** Local (Ollama): não gasta limite de terceiros; fica por último. */
  local?: boolean;
  gerar: (
    mensagens: Mensagem[],
    signal: AbortSignal,
    onDelta: ((texto: string) => void) | undefined,
    opcoes: OpcoesDeGeracao,
    nivel: Nivel,
  ) => Promise<Resultado>;
};

export const inteiro = (valor: string | undefined, padrao: number, minimo: number, maximo: number) => {
  const n = Number(valor);
  return valor && Number.isInteger(n) && n >= minimo && n <= maximo ? n : padrao;
};
/** Variável de ambiente sem espaços nas pontas; vazia vale como ausente. Lida a cada chamada, não na importação. */
export const env = (nome: string) => process.env[nome]?.trim() || undefined;
/** Tempo limite de uma chamada ao provedor (`SINDI_TIMEOUT_MS`, 45 s por padrão). */
export const tempoLimiteMs = () => inteiro(process.env.SINDI_TIMEOUT_MS, 45000, 1, 240000);
export const contagem = (valor: unknown) =>
  typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0 ? valor : undefined;
/** Nomes de modelo aceitos (letras, números, `.`, `_`, `-`, `/`, `:` e `@`, como `@cf/meta/llama-3.1-8b-instruct` ou `qwen2.5:3b`). */
export const NOME_DE_MODELO = /^[a-z0-9@][a-z0-9@._:/-]{0,120}$/i;
/** Lê o tempo de espera de um 429 (`Retry-After` em segundos ou data HTTP). */
export function esperaDoCabecalho(valor: string | null): number | undefined {
  if (!valor) return undefined;
  const n = Number(valor);
  if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
  const data = Date.parse(valor);
  return Number.isFinite(data) ? Math.max(0, Math.ceil((data - Date.now()) / 1000)) : undefined;
}
