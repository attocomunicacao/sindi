import { abrirGeracao, cacheLigado, chaveDaResposta, esperarIgual, respostaGuardada } from '@/lib/cache-respostas';
import { consumirCota, cotaDisponivel, mensagemDeCota, type ResultadoCota } from '@/lib/cota';
import type { Situacao } from '@/lib/knowledge/grounded';

/** Chave da memória de respostas: só a primeira pergunta de uma conversa (não depende de histórico) e nunca a que traz dados sensíveis. */
export function chaveDaGeracao({ mensagens, situacao, modelo, base, texto }: { mensagens: unknown[]; situacao: Situacao | undefined; modelo: string; base: unknown; texto: string }) {
  return cacheLigado() && mensagens.length === 1 && situacao !== 'dados-sensiveis' ? chaveDaResposta(modelo, JSON.stringify(base), texto) : undefined;
}

/** Ou há uma resposta pronta (`texto`), ou esta requisição vai gerar e deve chamar `concluir` ao terminar (com o texto, ou sem ele se falhar). */
export type Reuso = { texto: string } | { concluir?: (texto?: string) => void };
/**
 * Resposta que esta requisição não precisa gerar: a já guardada na memória ou a que outra pessoa está gerando agora para a mesma pergunta (espera o resultado dela em
 * vez de gastar outra requisição do limite gratuito). Se ninguém gera, registra esta requisição como a que gera. Verificar e registrar acontecem no mesmo passo,
 * sem `await` no meio: perguntas simultâneas não passam todas pela verificação antes de alguma registrar. Se a geração esperada falha, quem esperou gera por conta própria.
 */
export async function reaproveitarOuAbrir(chave: string | undefined, signal: AbortSignal): Promise<Reuso> {
  if (!chave) return {};
  const guardada = respostaGuardada(chave); if (guardada) return { texto: guardada };
  const emCurso = esperarIgual(chave);
  if (!emCurso) return { concluir: abrirGeracao(chave) };
  const texto = await Promise.race([emCurso, new Promise<never>((_, rejeitar) => { if (signal.aborted) rejeitar(signal.reason); else signal.addEventListener('abort', () => rejeitar(signal.reason), { once: true }); })]);
  return texto ? { texto } : { concluir: abrirGeracao(chave) };
}

/**
 * Cota de mensagens: uma por mensagem do usuário, só quando o provedor de IA vai ser usado (resposta reaproveitada não gasta) e nunca no aquecimento do servidor.
 * Cota esgotada devolve a resposta 429 pronta, com `Retry-After`.
 */
export async function gastarCota(request: Request, aquecimento: boolean): Promise<{ cota?: ResultadoCota } | { resposta: Response }> {
  if (aquecimento) return {};
  const cota = await consumirCota(request);
  if (cota.ok) return { cota };
  return { resposta: respostaDeCota(cota) };
}
const respostaDeCota = (cota: ResultadoCota) => Response.json({ error: mensagemDeCota(cota), restantes: 0 }, { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(cota.reiniciaEmSegundos) } });

/**
 * Antes da busca: quem já esgotou a cota recebe o aviso sem que a SINDI gaste embeddings ou leituras da biblioteca. Para saber se haveria uma resposta
 * guardada seria preciso buscar as fontes (a chave da memória depende delas), então quem esgotou a cota recebe o aviso mesmo para uma pergunta frequente.
 */
export async function conferirCotaAntes(request: Request, aquecimento: boolean): Promise<Response | undefined> {
  if (aquecimento) return undefined;
  const cota = await cotaDisponivel(request);
  return cota.ok ? undefined : respostaDeCota(cota);
}
