// Sem dependências: a página do chat importa daqui, e assim o Zod (só usado na validação do servidor, em chat.ts) não vai para o navegador.
// No navegador, o Zod testa `Function("")` e a CSP registra a tentativa como violação de script-src.
export function mensagensRecentes<T extends { role: string; content: string }>(mensagens: T[]): T[] {
  // Três trocas completas mais a pergunta atual; começa por uma fala do usuário.
  return mensagens.slice(-7).map((mensagem) => ({ ...mensagem, content: mensagem.content.slice(0, 1500) }));
}
/**
 * Histórico que vai ao modelo: as duas últimas trocas, sem as referências (links) e com cada mensagem encurtada. Em CPU cada token lido custa tempo,
 * e para dúvidas curtas sobre a biblioteca o que importa do histórico é o assunto da conversa, não o texto inteiro das respostas anteriores.
 */
export function historicoParaOModelo<T extends { role: string; content: string }>(
  anteriores: T[],
  trocas = 2,
  limite = 400,
): T[] {
  return anteriores
    .slice(-trocas * 2)
    .map((m) => ({ ...m, content: encurtarPorFrase(semReferencias(m.content), limite) }));
}

/** Resposta sem o bloco de referências que o servidor acrescenta (os links não voltam ao modelo). */
export const semReferencias = (texto: string) => texto.replace(/\n\n(?:Referências|References): [\s\S]*$/, '');

/**
 * Encurta o texto até o limite sem cortar uma frase ao meio: links markdown viram só o rótulo, o corte vai até o fim da última frase que cabe e, não havendo
 * uma na segunda metade, até a última palavra inteira (com reticências, para o modelo saber que há mais).
 */
export function encurtarPorFrase(texto: string, limite: number): string {
  const limpo = texto
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__/g, '')
    .trim();
  if (limpo.length <= limite) return limpo;
  const corte = limpo.slice(0, limite);
  const fimDeFrase = Math.max(
    corte.lastIndexOf('. '),
    corte.lastIndexOf('? '),
    corte.lastIndexOf('! '),
    corte.lastIndexOf('\n'),
  );
  if (fimDeFrase >= limite * 0.5) return corte.slice(0, fimDeFrase + 1).trim();
  const inteira = limpo.slice(0, limite - 1);
  const espaco = inteira.lastIndexOf(' ');
  return `${(espaco >= limite * 0.5 ? inteira.slice(0, espaco) : inteira).trimEnd()}…`;
}
