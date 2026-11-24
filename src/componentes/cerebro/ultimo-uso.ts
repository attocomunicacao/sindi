// A última resposta do chat deixa, só neste navegador, quais nós do cérebro ela usou: o /cerebro acende esse caminho. São ids de nós públicos e rótulos
// curtos (nada da pergunta nem da resposta), guardados por pouco tempo; sem armazenamento disponível (janela privada), o recurso simplesmente não funciona.
import { lerUsoDoCerebro, type UsoDoCerebro } from '@/lib/chat/uso-do-cerebro';

export const CHAVE_DO_ULTIMO_USO = 'sindi:cerebro:ultimo-uso';
/** Depois disto, o caminho aceso é esquecido (a resposta já não é "a última"). */
export const VALIDADE_DO_ULTIMO_USO_MS = 20 * 60_000;

export function guardarUltimoUso(uso: UsoDoCerebro | undefined, agora = Date.now()) {
  if (!uso) return;
  try {
    localStorage.setItem(CHAVE_DO_ULTIMO_USO, JSON.stringify({ em: agora, uso }));
  } catch {
    /* sem armazenamento: o /cerebro só não acende o caminho */
  }
}

export function lerUltimoUso(agora = Date.now()): UsoDoCerebro | undefined {
  try {
    const bruto = localStorage.getItem(CHAVE_DO_ULTIMO_USO);
    if (!bruto) return undefined;
    const { em, uso } = JSON.parse(bruto) as { em?: unknown; uso?: unknown };
    if (typeof em !== 'number' || agora - em > VALIDADE_DO_ULTIMO_USO_MS) return undefined;
    return lerUsoDoCerebro(uso);
  } catch {
    return undefined;
  }
}

export function esquecerUltimoUso() {
  try {
    localStorage.removeItem(CHAVE_DO_ULTIMO_USO);
  } catch {
    /* nada a limpar */
  }
}
