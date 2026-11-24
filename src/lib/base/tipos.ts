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

/** Página ou PDF do espelho local do site do SINDEPRESTEM (`.data/knowledge/current.json`), lido pelo coletor `sindeprestem` e pela busca de reserva. */
export type DocumentoDoEspelho = {
  url: string; title: string; content: string; hash: string; fetchedAt: string;
  checkedAt: string; publishedAt?: string; etag?: string; lastModified?: string;
  kind: 'html' | 'pdf'; status: 'active' | 'removed'; links: string[];
};
export type EspelhoDoSite = { updatedAt: string; documents: DocumentoDoEspelho[] };

/** O que a recuperação de documentos devolve: os trechos, e `semResposta` (aviso pronto) quando o documento pedido não consta da coleta. `lista` indica vários documentos curtos. */
export type TrechosDeDocumentos = { passages: PassagemFixa[]; semResposta?: string; lista?: boolean };
