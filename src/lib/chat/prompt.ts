import type { Conector } from '@/lib/cerebro/conectores';
import { mensagemDoPedido } from '@/lib/cerebro/instrucoes';
import type { Passage } from '@/lib/knowledge/core';

// Orientações ao modelo, limpeza do texto que ele escreve e montagem do pedido de cada pergunta. Sem rede nem estado: tudo aqui é função pura e testável.

export const WRITING = /\b(redija|reescreva|traduza|translate|draft|write|melhore o texto)\b/i;
/** Pedido de um texto para o usuário preencher (modelo, rascunho, anúncio, e-mail): só aí os campos entre colchetes ficam na resposta. */
export const PEDE_MODELO = /\b(modelo|redija|escreva|rascunho|template|an[uú]ncio|e-?mail|carta|estrutur\w*|apresenta[cç][aã]o|proposta)\b/i;
export const REDACAO = 'Escreva o texto em nome da empresa do usuário, nunca em nome do SINDEPRESTEM nem da SINDI. Use as fontes só como estrutura: não copie delas valores, salários, leis nem números. Deixe entre colchetes os dados que só o usuário conhece, como [nome da empresa] e [tempo de atuação]; não invente nenhum deles. Não assine como SINDI.';
// Orientações curtas: vão na mensagem de cada pergunta, depois das regras e dos exemplos, então cada palavra aqui é lida (e paga em tokens) toda vez.
export const COM_FONTES = 'Responda com as suas palavras, só com o que as fontes dizem, ligando-as ao que foi perguntado. Não copie trechos longos nem títulos.';
export const SEM_FONTES = 'Não há fonte para esta pergunta. Você pode dar orientação geral de método, sem citar números, valores, prazos, leis, contatos nem o que o SINDEPRESTEM oferece. Para dados específicos, recomende falar com o SINDEPRESTEM.';
export const LISTA = 'As fontes são só títulos de documentos. Diga em uma ou duas frases de que assuntos eles tratam e avise que os links estão nas referências. Não descreva o conteúdo de nenhum documento.';
export const SITUACAO = 'Siga a SITUAÇÃO abaixo.';
// Duas fontes por resposta: a terceira quase nunca traz o fato e, medido com o modelo pequeno, é a que ele mistura com as outras (número de uma fonte atribuído a outra).
export const MAXIMO_DE_FONTES = Math.min(4, Math.max(1, Number(process.env.SINDI_MAX_FONTES) || 2));
/** Corta o texto na última frase (ou item de lista) completa, desde que reste a maior parte dele. */
export function ateAUltimaFrase(texto: string) {
  const fim = Math.max(texto.lastIndexOf('. '), texto.lastIndexOf('.\n'), texto.lastIndexOf('\n'));
  if (fim <= texto.length * 0.5) return texto;
  // Sem item de lista vazio ("3.") nem subtítulo sem conteúdo ("Para estruturar a proposta:") no fim.
  return texto.slice(0, fim + 1).trimEnd().replace(/(?:\n\s*(?:\d+[.)]|[-*])?\s*[^\n]{0,3}|\n[^\n]*:)\s*$/, '').trimEnd();
}
/** Tira da resposta o que o modelo pequeno acrescenta por hábito e o servidor já fornece: a lista de fontes ao final (as referências vêm do servidor) e o "as fontes informam que". */
export function limparResposta(texto: string, manterColchetes = true) {
  const semLista = texto.replace(/\n+\**(?:Fontes?|Referências|Refer[eê]ncias?)\**:?\**\s*(?:\n\s*(?:[-*]\s*)?\[?\d+\]?[^\n]*)+\s*$/i, '').replace(/\n+\**(?:Fontes?|Referências)\**:[^\n]*$/i, '');
  // Campos entre colchetes ([nome do cliente]) só fazem sentido quando o usuário pediu um modelo para preencher; numeração repetida ("1. 1.") vira uma só.
  const semCampos = manterColchetes ? semLista : semLista.replace(/\s*\[[^\]\n]{2,40}\]/g, '')
    // O que sobra de uma lista de campos removidos (": , , ." ou "como , e .") também sai.
    .replace(/(:|\bcomo|\bem)(\s*,)+\s*(e\s*)?(?=[.;\n]|$)/g, '$1').replace(/(\s*,)+\s*(e\s*)?(?=[.;:\n]|$)/g, '').replace(/:\s*\./g, '.').replace(/[ \t]+([,.;])/g, '$1');
  // Assinatura "SINDI" no fim de um texto escrito para o usuário.
  const limpo = semCampos.replace(/\n+\s*(?:—\s*)?SINDI\s*$/i, '').replace(/^(\s*)(\d+)\.\s+\2\.\s+/gm, '$1$2. ');
  return limpo.replace(/^\s*(?:Segundo|De acordo com|Conforme) as fontes,?\s+(\p{L})/u, (_, letra: string) => letra.toUpperCase()).replace(/^\s*As fontes (?:informam|indicam|mencionam|dizem|mostram|apontam) que\s+(\p{L})/u, (_, letra: string) => letra.toUpperCase()).trim();
}
export type Uso = { inputTokens?: number; outputTokens?: number; totalTokens?: number };
export const somar = (a: Uso | undefined, b: Uso): Uso => ({ inputTokens: (a?.inputTokens ?? 0) + (b.inputTokens ?? 0), outputTokens: (a?.outputTokens ?? 0) + (b.outputTokens ?? 0), totalTokens: (a?.totalTokens ?? 0) + (b.totalTokens ?? 0) });

export type ContextoDoPedido = { writing: boolean; lista: boolean; relatorio: boolean; conector: Conector | undefined; choices: Passage[]; pergunta: string };
/**
 * Monta o pedido de cada tentativa: a orientação (a da ferramenta, quando a fonte vem de uma; a da situação; a do conector; ou a genérica), o limite de palavras e as
 * fontes com orçamento de caracteres. `choices` são as fontes escolhidas para a pergunta: só para elas valem a orientação do conector e a de lista.
 */
export function construirPedido({ writing, lista, relatorio, conector, choices, pergunta }: ContextoDoPedido) {
  return (nota: string, fontes: Passage[]) => {
    const ferramenta = fontes[0]?.ferramenta;
    const orientacao = writing && !nota.includes('SITUAÇÃO') ? REDACAO : nota.includes('SITUAÇÃO') ? SITUACAO : ferramenta ? ferramenta.orientacao : lista && fontes === choices ? LISTA : !fontes.length ? (conector?.modo === 'orientacao' ? `${conector.instrucao} ${SEM_FONTES}` : SEM_FONTES) : conector && fontes === choices ? conector.instrucao : COM_FONTES;
    const palavras = nota.includes('SITUAÇÃO') ? 40 : lista ? 50 : relatorio ? 80 : conector?.palavras ?? 55;
    return { texto: mensagemDoPedido({ orientacao, palavras, nota, fontes, pergunta, orcamento: relatorio ? 2200 : lista ? 1400 : 1200 }), palavras };
  };
}
