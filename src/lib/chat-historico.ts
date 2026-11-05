// Sem dependências: a página do chat importa daqui, e assim o Zod (só usado na validação do servidor, em chat.ts) não vai para o navegador.
// No navegador, o Zod testa `Function("")` e a CSP registra a tentativa como violação de script-src.
export function recentMessages<T extends { role: string; content: string }>(messages: T[]): T[] {
  // Three complete exchanges plus the current question; start with a user turn.
  return messages.slice(-7).map(message => ({ ...message, content: message.content.slice(0, 1500) }));
}
/**
 * Histórico que vai ao modelo: as duas últimas trocas, sem as referências (links) e com cada mensagem encurtada. Em CPU cada token lido custa tempo,
 * e para dúvidas curtas sobre a biblioteca o que importa do histórico é o assunto da conversa, não o texto inteiro das respostas anteriores.
 */
export function historicoParaOModelo<T extends { role: string; content: string }>(anteriores: T[], trocas = 2, limite = 400): T[] {
  return anteriores.slice(-trocas * 2).map(m => ({ ...m, content: m.content.replace(/\n\n(?:Referências|References): [\s\S]*$/, '').slice(0, limite) }));
}
