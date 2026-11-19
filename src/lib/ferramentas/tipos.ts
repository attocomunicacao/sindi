import type { Passage } from '@/lib/knowledge/core';
import type { Conector } from '@/lib/cerebro/conectores';
import type { Pagina } from '@/lib/paginas';

/** O que o chat entrega à ferramenta: a pergunta já está dentro dos limites de tamanho e livre de dados pessoais (a redação roda antes do modelo; a ferramenta lê a original só para reconhecer o pedido). */
export type ContextoDaFerramenta = { idioma: string; conector?: Conector };
/** O resultado vira uma fonte para o modelo: ele apresenta os números com palavras próprias, e a verificação de fatos confere que cada valor citado está em `passagem.content`. */
export type ResultadoDaFerramenta = {
  passagem: Pick<Passage, 'url' | 'title' | 'content'>;
  /** Instrução curta ao modelo sobre como apresentar este resultado; substitui a orientação genérica das fontes. */
  orientacao: string;
};

/**
 * Contrato de uma ferramenta do SINDI. Uma ferramenta é uma capacidade do site (calculadora, consulta, gerador) que pode ter página, rotas de API e uma entrada no chat.
 * Tudo é opcional, menos `id` e `testes`. Como acrescentar uma: docs/README.md ("Adicionar uma ferramenta").
 */
export type Ferramenta = {
  id: string;
  /** Página da ferramenta (registrada em src/lib/paginas.ts). */
  pagina?: Pagina;
  /** Rotas de API da ferramenta. Cada uma precisa existir em src/app/api e usar a guarda de rotas (src/lib/http/guarda.ts). */
  api?: string[];
  /** Variáveis de ambiente que a ferramenta lê; precisam constar em env.example. */
  env?: string[];
  /** Arquivos de teste que cobrem a ferramenta (relativos à raiz do projeto); precisam existir. */
  testes: string[];
  /**
   * Entrada no chat: devolve o resultado se a pergunta é um pedido para esta ferramenta, ou `undefined` se não for (o chat segue com as fontes de sempre).
   * Pode ser assíncrona (consulta a serviço externo). Não deve lançar erro por pergunta que não reconhece.
   */
  chat?: { executar(pergunta: string, contexto: ContextoDaFerramenta): ResultadoDaFerramenta | undefined | Promise<ResultadoDaFerramenta | undefined> };
};
