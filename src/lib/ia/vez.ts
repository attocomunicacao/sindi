import { inteiro, LlmError } from './tipos';

/**
 * Poucas gerações ao mesmo tempo por processo (os níveis gratuitos limitam requisições por minuto, e o modelo local usa o processador inteiro) e uma fila curta:
 * acima disso o pedido é recusado em vez de esperar sem fim. Vale para a cascata toda: uma pergunta ocupa uma vaga mesmo que passe por vários provedores.
 */
let ativos = 0; const fila: (() => void)[] = [];
const limiteSimultaneo = () => inteiro(process.env.SINDI_CONCORRENCIA, 4, 1, 16);
const limiteDaFila = () => inteiro(process.env.SINDI_FILA_MAX, 40, 1, 500);
export const MENSAGEM_DE_FILA = 'Há muitas conversas acontecendo agora. Tente novamente em instantes.';

export async function entrarNaVez(signal: AbortSignal) {
  signal.throwIfAborted();
  if (ativos < limiteSimultaneo()) { ativos++; return; }
  if (fila.length >= limiteDaFila()) throw new LlmError(MENSAGEM_DE_FILA, 503);
  await new Promise<void>((resolve, reject) => {
    const vez = () => { signal.removeEventListener('abort', desistir); ativos++; resolve(); };
    const desistir = () => { const i = fila.indexOf(vez); if (i >= 0) fila.splice(i, 1); reject(signal.reason); };
    fila.push(vez); signal.addEventListener('abort', desistir, { once: true });
  });
}
export function sairDaVez() { ativos--; fila.shift()?.(); }
