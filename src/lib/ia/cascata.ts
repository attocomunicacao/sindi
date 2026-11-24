import { provedoresAtivos } from '@/lib/ia/provedores';
import type { Mensagem } from '@/lib/base/tipos';
import { podeTentar, registrarFalha, registrarSucesso, registrarTentativa } from '@/lib/ia/saude';
import { env, inteiro, LlmError, type Nivel, type OpcoesDeGeracao, type Resultado } from '@/lib/ia/tipos';
import { entrarNaVez, sairDaVez } from '@/lib/ia/vez';

/**
 * A cascata de provedores: o chat pede um texto e esta função tenta, em ordem, cada provedor configurado (`SINDI_CASCATA`), pulando os que estão de castigo
 * ou no limite conhecido. Quem esgotou o nível gratuito sai da frente **em silêncio**: o usuário nunca vê "limite atingido" ou "tokens insuficientes".
 *
 * - Falha antes do primeiro trecho: o próximo provedor tenta, sem nada na tela.
 * - Falha no meio do texto: `onReset` apaga o que foi mostrado (a tela já trata o evento `reset`) e o próximo provedor recomeça.
 * - Todos falharam: mensagem neutra (503). Se todos recusaram o conteúdo: pede para reformular (422).
 * - O modelo local (Ollama) é sempre o último degrau, e é tentado mesmo de castigo se ninguém mais pôde ser tentado.
 * - Orçamento de tempo: passado `SINDI_ORCAMENTO_NUVEM_MS` (150 s), os provedores na nuvem são pulados e sobra o tempo do modelo local dentro do `maxDuration` da rota (300 s).
 */
export const MENSAGEM_NEUTRA = 'A SINDI está com muita procura agora. Tente novamente em instantes.';
export { LlmError } from '@/lib/ia/tipos';

/** O nível rápido só é usado quando foi pedido explicitamente (no Gemini, era assim: só com `GEMINI_MODEL_RAPIDO`). */
export const rapidoLigado = () => Boolean(process.env.GEMINI_MODEL_RAPIDO) || process.env.SINDI_NIVEL_RAPIDO === '1';

export async function gerarTexto(
  messages: Mensagem[],
  signal: AbortSignal,
  onDelta?: (text: string) => void,
  opcoes: OpcoesDeGeracao = {},
  nivel: Nivel = 'principal',
  onReset?: () => void,
): Promise<Resultado> {
  const provedores = provedoresAtivos();
  if (!provedores.length) throw new LlmError('O serviço de IA ainda não foi configurado.', 503, 'configuracao');
  await entrarNaVez(signal);
  try {
    let tentou = false;
    let recusas = 0;
    let falhas = 0;
    const inicio = Date.now();
    const orcamentoNuvemMs = inteiro(env('SINDI_ORCAMENTO_NUVEM_MS'), 150_000, 10_000, 250_000);
    const tentar = async (indice: number, ignorarCastigo: boolean): Promise<Resultado | undefined> => {
      const p = provedores[indice];
      if (!ignorarCastigo && !podeTentar(p.id)) return undefined;
      if (!p.local && Date.now() - inicio > orcamentoNuvemMs) return undefined;
      tentou = true;
      registrarTentativa(p.id);
      let mostrou = false;
      const delta = onDelta
        ? (t: string) => {
            mostrou = true;
            onDelta(t);
          }
        : undefined;
      try {
        const r = await p.gerar(messages, signal, delta, opcoes, nivel);
        registrarSucesso(p.id);
        return { ...r, provedor: p.id, modelo: r.modelo ?? p.modelo(nivel) };
      } catch (falha) {
        if (signal.aborted) throw falha;
        const erro = falha instanceof LlmError ? falha : new LlmError('Provedor indisponível.', 502, 'indisponivel');
        if (erro.tipo === 'bloqueio') recusas++;
        else falhas++;
        registrarFalha(p.id, erro, Date.now(), p.local);
        // Só o tipo e o status vão ao registro: nunca a pergunta, a resposta ou o corpo de erro do provedor.
        console.warn('SINDI provedor de IA falhou', { provedor: p.id, tipo: erro.tipo, status: erro.status });
        if (mostrou) onReset?.();
        return undefined;
      }
    };
    for (let i = 0; i < provedores.length; i++) {
      const r = await tentar(i, false);
      if (r) return r;
    }
    // Ninguém pôde ser tentado (todos de castigo ou no limite): o modelo local tenta assim mesmo, e na falta dele o primeiro que não está mal configurado.
    if (!tentou) {
      const local = provedores.findIndex((p) => p.local);
      const r = await tentar(local >= 0 ? local : 0, true);
      if (r) return r;
    }
    if (recusas && !falhas)
      throw new LlmError('Não foi possível responder a esta pergunta. Tente reformulá-la.', 422, 'bloqueio');
    throw new LlmError(MENSAGEM_NEUTRA, 503);
  } finally {
    sairDaVez();
  }
}
