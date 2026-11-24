import { provedorGemini } from '@/lib/gemini';
import { provedorAnthropic } from './anthropic';
import { provedorCompat } from './openai-compat';
import { inteiro, type Nivel, type Provedor } from './tipos';

/**
 * Os degraus da cascata. Cada provedor só entra se a credencial estiver no ambiente do servidor (nunca `NEXT_PUBLIC_`). Padrões de modelo conferidos na
 * documentação oficial em 23/11/2026; os catálogos gratuitos mudam, por isso todo modelo pode ser trocado por variável sem mexer no código.
 *
 * Nível gratuito (aprox., nov/2026): Groq ~30 req/min e 1.000 req/dia por modelo (200 mil tokens/dia nos gpt-oss); OpenRouter `:free` 20 req/min e
 * 50 req/dia (1.000 após US$ 10 de crédito); Mistral (Experiment) ~1 req/s; Cloudflare Workers AI 10.000 "neurons"/dia. GitHub Models foi descontinuado
 * em 30/07/2026 e Cerebras passou a exigir cartão: ficaram de fora.
 */
const env = (nome: string) => process.env[nome]?.trim() || undefined;
const modelo = (principal: string, rapido: string, padraoPrincipal: string, padraoRapido?: string) => (nivel: Nivel) =>
  nivel === 'rapido' ? env(rapido) || padraoRapido || env(principal) || padraoPrincipal : env(principal) || padraoPrincipal;
const raciocinio = (nome: string) => /gpt-oss/i.test(nome);

export const provedorGroq = provedorCompat({
  id: 'groq',
  base: () => 'https://api.groq.com/openai/v1',
  chave: () => env('GROQ_API_KEY'),
  modelos: modelo('GROQ_MODEL', 'GROQ_MODEL_RAPIDO', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'),
  usoNoFluxo: true,
  // gpt-oss raciocina antes de escrever e o raciocínio conta no teto de saída: esforço baixo, raciocínio fora da resposta e folga no teto.
  folga: 400,
  extras: nome => (raciocinio(nome) ? { reasoning_effort: 'low', include_reasoning: false } : {}),
});

export const provedorOpenRouter = provedorCompat({
  id: 'openrouter',
  base: () => 'https://openrouter.ai/api/v1',
  chave: () => env('OPENROUTER_API_KEY'),
  // `openrouter/free` sorteia um modelo gratuito por pedido; para respostas mais estáveis, fixe um `...:free` em OPENROUTER_MODEL.
  modelos: modelo('OPENROUTER_MODEL', 'OPENROUTER_MODEL_RAPIDO', 'openrouter/free'),
  usoNoFluxo: true, folga: 300,
  cabecalhos: () => ({ 'X-Title': 'SINDI' }),
});

export const provedorMistral = provedorCompat({
  id: 'mistral',
  base: () => 'https://api.mistral.ai/v1',
  chave: () => env('MISTRAL_API_KEY'),
  modelos: modelo('MISTRAL_MODEL', 'MISTRAL_MODEL_RAPIDO', 'mistral-small-latest'),
});

export const provedorCloudflare = provedorCompat({
  id: 'cloudflare',
  // O número da conta entra na URL: só formato hexadecimal de 32 caracteres, para não montar endereço com texto arbitrário.
  base: () => { const conta = env('CLOUDFLARE_ACCOUNT_ID'); return conta && /^[a-f0-9]{32}$/i.test(conta) ? `https://api.cloudflare.com/client/v4/accounts/${conta}/ai/v1` : undefined; },
  chave: () => env('CLOUDFLARE_API_TOKEN'),
  modelos: modelo('CLOUDFLARE_MODEL', 'CLOUDFLARE_MODEL_RAPIDO', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct'),
});

/** Só endereços desta máquina: o modelo local nunca vira uma porta para a rede interna (SSRF). */
export function enderecoDoOllama(valor = env('SINDI_OLLAMA_URL')) {
  if (!valor) return undefined;
  try { const url = new URL(valor); return /^https?:$/.test(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && !url.password ? `${url.origin}/v1` : undefined; }
  catch { return undefined; }
}
export const provedorOllama = provedorCompat({
  id: 'ollama', local: true,
  base: () => enderecoDoOllama(),
  chave: () => undefined,
  modelos: modelo('SINDI_OLLAMA_MODEL', 'SINDI_OLLAMA_MODEL_RAPIDO', 'qwen2.5:3b'),
  usoNoFluxo: true,
  // Só processador nesta máquina: ler o pedido (~2.500 tokens) leva dezenas de segundos antes do primeiro trecho.
  tempoMs: () => inteiro(process.env.SINDI_OLLAMA_TIMEOUT_MS, 120000, 5000, 300000),
  inatividadeMs: () => inteiro(process.env.SINDI_OLLAMA_INATIVIDADE_MS, 90000, 5000, 300000),
});

export const TODOS: Provedor[] = [provedorGemini, provedorGroq, provedorOpenRouter, provedorMistral, provedorCloudflare, provedorAnthropic, provedorOllama];
/** Ordem padrão: os gratuitos com mais capacidade primeiro; Anthropic (pago) só com chave; o local sempre por último. */
export const ORDEM_PADRAO = 'gemini,groq,openrouter,mistral,cloudflare,anthropic,ollama';

/** Provedores configurados, na ordem de `SINDI_CASCATA` (ids desconhecidos são ignorados; o local vai sempre ao fim). */
export function provedoresAtivos(): Provedor[] {
  const ordem = (process.env.SINDI_CASCATA || ORDEM_PADRAO).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const escolhidos = [...new Set(ordem)].map(id => TODOS.find(p => p.id === id)).filter((p): p is Provedor => Boolean(p) && p!.configurado());
  return [...escolhidos.filter(p => !p.local), ...escolhidos.filter(p => p.local)];
}
