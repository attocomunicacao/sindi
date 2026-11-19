import type { Passage } from '@/lib/knowledge/core';
import { ferramentaOrcamento } from '@/lib/orcamento/ferramenta';
import type { ContextoDaFerramenta, Ferramenta } from './tipos';

/** Todas as ferramentas do site. Acrescentar uma é incluí-la aqui; o teste tests/ferramentas.test.ts confere páginas, rotas, variáveis de ambiente e testes declarados. */
export const FERRAMENTAS: Ferramenta[] = [ferramentaOrcamento];

/**
 * Pergunta ao chat: a primeira ferramenta que reconhece o pedido responde, e o resultado volta como fonte (`Passage`) marcada com a ferramenta e a orientação dela.
 * Uma ferramenta que falha não derruba a resposta: o chat segue como se ela não existisse.
 */
export async function executarFerramentas(pergunta: string, contexto: ContextoDaFerramenta, ferramentas: Ferramenta[] = FERRAMENTAS): Promise<Passage[]> {
  for (const ferramenta of ferramentas) {
    if (!ferramenta.chat) continue;
    try {
      const resultado = await ferramenta.chat.executar(pergunta, contexto);
      if (resultado) return [{ ...resultado.passagem, fetchedAt: new Date().toISOString(), pinned: true, ferramenta: { id: ferramenta.id, orientacao: resultado.orientacao } }];
    } catch { console.warn('SINDI ferramenta falhou', { ferramenta: ferramenta.id }); }
  }
  return [];
}
