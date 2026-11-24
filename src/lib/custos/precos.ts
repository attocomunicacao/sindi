// Sem dependências: usado pela página /custos (navegador) e pelos testes.
/**
 * Preços por milhão de tokens (US$) dos modelos Claude considerados para a versão vendida da SINDI. Tabela de preços de primeira mão da Anthropic
 * consultada em 03/11/2026 (mesmos valores no Microsoft Foundry; Bedrock e Vertex têm tabela própria). Conferir na página oficial antes de uma proposta:
 * https://platform.claude.com/docs/en/about-claude/pricing
 */
export type PrecoDoModelo = { id: string; nome: string; entrada: number; saida: number; leituraDeCache: number; observacao?: string };
export const DATA_DOS_PRECOS = '03/11/2026';
export const MODELOS: PrecoDoModelo[] = [
  { id: 'claude-haiku-5-5', nome: 'Claude Haiku 5.5', entrada: 0.10, saida: 0.50, leituraDeCache: 0.01, observacao: 'Preço para pedidos de até 100 mil tokens (a SINDI usa cerca de 2 mil por pergunta).' },
  { id: 'claude-haiku-4-5', nome: 'Claude Haiku 4.5', entrada: 1, saida: 5, leituraDeCache: 0.10 },
  { id: 'claude-sonnet-5-5', nome: 'Claude Sonnet 5.5', entrada: 2, saida: 10, leituraDeCache: 0.10, observacao: 'Para comparação: modelo mais capaz, acima do necessário para um chatbot com fontes.' },
];
export const modeloPorId = (id: string) => MODELOS.find(m => m.id === id) ?? MODELOS[0];
