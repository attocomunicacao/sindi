/** Mensagem trocada com os provedores de IA (regras, exemplos, histórico e o pedido com as fontes). */
export type Mensagem = { role: 'system' | 'user' | 'assistant'; content: string };

/** Trecho de fonte que o modelo pode citar na resposta (página do site, documento, indicador ou saída de ferramenta). */
export type Passagem = {
  url: string; title: string; content: string; fetchedAt: string; pinned?: boolean;
  /** Fonte produzida por uma ferramenta (src/lib/ferramentas): a orientação dela diz ao modelo como apresentar o resultado. */
  ferramenta?: { id: string; orientacao: string };
};

/** Passagem já escolhida pela pergunta (documentos e indicadores nomeados): sempre fixada. */
export type PassagemFixa = Passagem & { pinned: true };
