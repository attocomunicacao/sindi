import type { Ferramenta } from '@/lib/ferramentas/tipos';
import type { Passagem } from '@/lib/base/tipos';
import { orcamentoAnswer } from '@/lib/orcamento/interpretar';

/** Como o modelo apresenta o resultado do cálculo: números exatos da fonte, sem recalcular, e o aviso de que é estimativa. */
export const ORIENTACAO_DO_ORCAMENTO = 'Apresente o resultado com os números exatos da fonte, sem arredondar nem recalcular. Diga que é uma estimativa e que a ferramenta permite ajustar os postos e baixar o orçamento em PDF.';

/**
 * Cálculo do orçamento de terceirização (uma conta sobre a tabela de referência) como trecho para o modelo: ele apresenta o resultado com palavras próprias,
 * e a verificação de fatos confere que cada valor citado está no cálculo. A referência leva à ferramenta, com os postos já preenchidos.
 */
export function calculoDoOrcamento(question: string, language: string): Pick<Passagem, 'url' | 'title' | 'content'> | undefined {
  const texto = orcamentoAnswer(question, language); if (!texto) return undefined;
  const ferramenta = texto.match(/\]\((\/orcamento[^)]*)\)/)?.[1] ?? '/orcamento';
  return { url: ferramenta, title: 'Ferramenta de orçamento de terceirização', content: texto.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') };
}

export const ferramentaOrcamento: Ferramenta = {
  id: 'orcamento',
  pagina: 'orcamento',
  api: ['/api/orcamento/calcular', '/api/orcamento/catalogo', '/api/orcamento/pdf'],
  testes: ['tests/lib/orcamento/orcamento.test.ts', 'tests/app/orcamento-rotas.test.ts'],
  chat: {
    executar(pergunta, { idioma }) {
      const passagem = calculoDoOrcamento(pergunta, idioma);
      return passagem ? { passagem, orientacao: ORIENTACAO_DO_ORCAMENTO } : undefined;
    },
  },
};
