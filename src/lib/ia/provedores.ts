import { provedorGemini } from '@/lib/ia/gemini';
import { provedorCompat } from '@/lib/ia/openai-compat';
import { env, inteiro, type Nivel, type Provedor } from '@/lib/ia/tipos';

/**
 * Os degraus da cascata. Cada provedor só entra se a credencial estiver no ambiente do servidor (nunca `NEXT_PUBLIC_`). Padrões de modelo conferidos na
 * documentação oficial em 23/11/2026; os catálogos gratuitos mudam, por isso todo modelo pode ser trocado por variável sem mexer no código.
 *
 * Nível gratuito (aprox., nov/2026): Groq ~30 req/min e 1.000 req/dia por modelo (200 mil tokens/dia nos gpt-oss); Mistral (Experiment) ~1 req/s.
 * Só Gemini, Groq, Mistral e o modelo local fazem parte da cascata (decisão do usuário, 24/11/2026).
 */
const modelo = (principal: string, rapido: string, padraoPrincipal: string, padraoRapido?: string) => (nivel: Nivel) =>
  nivel === 'rapido'
    ? env(rapido) || padraoRapido || env(principal) || padraoPrincipal
    : env(principal) || padraoPrincipal;
const raciocinio = (nome: string) => /gpt-oss/i.test(nome);

const provedorGroq = provedorCompat({
  id: 'groq',
  base: () => 'https://api.groq.com/openai/v1',
  chave: () => env('GROQ_API_KEY'),
  modelos: modelo('GROQ_MODEL', 'GROQ_MODEL_RAPIDO', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'),
  usoNoFluxo: true,
  // gpt-oss raciocina antes de escrever e o raciocínio conta no teto de saída: esforço baixo, raciocínio fora da resposta e folga no teto.
  folga: 400,
  extras: (nome) => (raciocinio(nome) ? { reasoning_effort: 'low', include_reasoning: false } : {}),
});

const provedorMistral = provedorCompat({
  id: 'mistral',
  base: () => 'https://api.mistral.ai/v1',
  chave: () => env('MISTRAL_API_KEY'),
  modelos: modelo('MISTRAL_MODEL', 'MISTRAL_MODEL_RAPIDO', 'mistral-small-latest'),
});

/** Só endereços desta máquina: o modelo local nunca vira uma porta para a rede interna (SSRF). */
export function enderecoDoOllama(valor = env('SINDI_OLLAMA_URL')) {
  if (!valor) return undefined;
  try {
    const url = new URL(valor);
    return /^https?:$/.test(url.protocol) &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
      !url.username &&
      !url.password
      ? `${url.origin}/v1`
      : undefined;
  } catch {
    return undefined;
  }
}
const provedorOllama = provedorCompat({
  id: 'ollama',
  local: true,
  base: () => enderecoDoOllama(),
  chave: () => undefined,
  modelos: modelo('SINDI_OLLAMA_MODEL', 'SINDI_OLLAMA_MODEL_RAPIDO', 'qwen2.5:3b'),
  usoNoFluxo: true,
  // Só processador nesta máquina: ler o pedido (~2.500 tokens) leva dezenas de segundos antes do primeiro trecho.
  tempoMs: () => inteiro(process.env.SINDI_OLLAMA_TIMEOUT_MS, 120000, 5000, 300000),
  inatividadeMs: () => inteiro(process.env.SINDI_OLLAMA_INATIVIDADE_MS, 90000, 5000, 300000),
});

const TODOS: Provedor[] = [provedorGemini, provedorGroq, provedorMistral, provedorOllama];
/** Ordem padrão: os gratuitos com mais capacidade primeiro; o local sempre por último. */
const ORDEM_PADRAO = 'gemini,groq,mistral,ollama';

/** Provedores configurados, na ordem de `SINDI_CASCATA` (ids desconhecidos são ignorados; o local vai sempre ao fim). */
export function provedoresAtivos(): Provedor[] {
  const ordem = (process.env.SINDI_CASCATA || ORDEM_PADRAO)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const escolhidos = [...new Set(ordem)]
    .map((id) => TODOS.find((p) => p.id === id))
    .filter((p): p is Provedor => Boolean(p) && p!.configurado());
  return [...escolhidos.filter((p) => !p.local), ...escolhidos.filter((p) => p.local)];
}
