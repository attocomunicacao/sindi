/**
 * Limite de pedidos por minuto, por visitante, para rotas que gastam processador ou rede (geração de PDF, download de documentos). Janela fixa, em memória do processo:
 * é uma proteção contra laços de requisição, não uma cota. O IP vem do mesmo cabeçalho configurado para a cota de mensagens (ver http/ip.ts).
 */
import { ipDoPedido } from '@/lib/http/ip';
const janelas = new Map<string, { inicio: number; usados: number }>();
const MAXIMO_DE_CHAVES = 20_000;
export function limitarPorMinuto(request: Request, nome: string, maximo: number, agora = Date.now()): { ok: boolean; reiniciaEmSegundos: number } {
  const chave = `${nome}|${ipDoPedido(request)}`;
  if (janelas.size >= MAXIMO_DE_CHAVES) for (const [k, j] of janelas) if (agora - j.inicio >= 60_000) janelas.delete(k);
  // Ainda cheio (muitos IPs na mesma janela): descarta só as janelas mais antigas. Limpar tudo zerava o limite de todo mundo, e um ataque com IPs variados fazia isso de propósito.
  if (janelas.size >= MAXIMO_DE_CHAVES) { let excesso = Math.ceil(MAXIMO_DE_CHAVES / 10); for (const k of janelas.keys()) { if (excesso-- <= 0) break; janelas.delete(k); } }
  const atual = janelas.get(chave);
  const janela = atual && agora - atual.inicio < 60_000 ? atual : { inicio: agora, usados: 0 };
  janela.usados++; janelas.set(chave, janela);
  return { ok: janela.usados <= maximo, reiniciaEmSegundos: Math.max(1, Math.ceil((60_000 - (agora - janela.inicio)) / 1000)) };
}
export function reiniciarLimitesNaMemoria() { janelas.clear(); }
