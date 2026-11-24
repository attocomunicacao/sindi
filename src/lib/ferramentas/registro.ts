import type { Passagem } from '@/lib/base/tipos';
import { ferramentaDanfse } from '@/lib/danfse/ferramenta';
import { ferramentaDiagnostico } from '@/lib/diagnostico/ferramenta';
import { ferramentaJornada42 } from '@/lib/jornada42/ferramenta';
import { ferramentaOrcamento } from '@/lib/orcamento/ferramenta';
import { ferramentaTributos } from '@/lib/tributos/ferramenta';
import type { ContextoDaFerramenta, Ferramenta } from '@/lib/ferramentas/tipos';

/** Todas as ferramentas do site. Acrescentar uma é incluí-la aqui; o teste tests/ferramentas/ferramentas.test.ts confere páginas, rotas, variáveis de ambiente e testes declarados. */
export const FERRAMENTAS: Ferramenta[] = [
  ferramentaOrcamento,
  ferramentaTributos,
  ferramentaDanfse,
  ferramentaJornada42,
  ferramentaDiagnostico,
];

/**
 * Pergunta ao chat: a primeira ferramenta que reconhece o pedido responde, e o resultado volta como fonte (`Passagem`) marcada com a ferramenta e a orientação dela.
 * Uma ferramenta que falha não derruba a resposta: o chat segue como se ela não existisse.
 */
export async function executarFerramentas(
  pergunta: string,
  contexto: ContextoDaFerramenta,
  ferramentas: Ferramenta[] = FERRAMENTAS,
): Promise<Passagem[]> {
  for (const ferramenta of ferramentas) {
    if (!ferramenta.chat) continue;
    try {
      const resultado = await ferramenta.chat.executar(pergunta, contexto);
      if (resultado)
        return [
          {
            ...resultado.passagem,
            fetchedAt: new Date().toISOString(),
            pinned: true,
            ferramenta: { id: ferramenta.id, orientacao: resultado.orientacao },
          },
        ];
    } catch {
      console.warn('SINDI ferramenta falhou', { ferramenta: ferramenta.id });
    }
  }
  return [];
}
