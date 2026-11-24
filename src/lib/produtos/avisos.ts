// Sem dependências: usado por componentes do navegador (rodapé, páginas) e pelo servidor (PDFs, orientação do chat).
/**
 * Salvaguardas jurídicas dos produtos da SINDI, num só lugar para rodapé, páginas e PDFs dizerem a mesma coisa.
 * Elas existem por quatro regras (parecer do advogado, 16/11/2026): informação e ferramenta, nunca consultoria
 * (Lei 8.906/1994, art. 1º, II); custo, nunca preço (Lei 12.529/2011, art. 36, § 3º, II); dado da empresa só com
 * consentimento; conteúdo com data e prazo de validade. Mudar o texto aqui muda em todo o site.
 */
export const AVISOS = {
  /** Informação geral: o caso concreto vai a um advogado. */
  naoEConsultoria:
    'Informação geral, sem caráter de consultoria ou parecer jurídico. Para o seu caso concreto, consulte um advogado ou o Setor Jurídico do SINDEPRESTEM.',
  /** O cálculo mostra custo; preço e margem são decisão de cada empresa. */
  custoNaoPreco:
    'O cálculo mostra custo, não preço. Margem, BDI e tributos são informados por quem usa; a SINDI não recomenda preço nem margem.',
  /** Só para ferramenta que calcula 100% no navegador, sem rota nem fetch (hoje, o Kit Jornada 42). Chat e PDF do orçamento passam pelo servidor: use `dadosNaoGuardados`. */
  dadosNoNavegador:
    'Os dados que você informa são calculados neste aparelho e não são guardados pela SINDI. Não envie dados pessoais nem confidenciais.',
  /** Vale para todo o site: o servidor processa (chat, PDF do orçamento) mas não grava o conteúdo. */
  dadosNaoGuardados:
    'A SINDI não guarda o que você escreve nem os dados que informa nas ferramentas. O chat e o PDF do orçamento passam pelo servidor só para serem processados, sem gravação. Não envie dados pessoais nem confidenciais.',
  /** Rodapé do site, em uma linha. */
  rodape: 'Protótipo. Não envie dados pessoais. Informação geral, não é consultoria.',
} as const;

/** "Atualizado em 16/11/2026": conteúdo sem data não vai ao público (produto que envelhece vira problema de reputação). */
export function textoDeVigencia(atualizadoEm: string, validoAte?: string): string {
  const data = (iso: string) => iso.split('-').reverse().join('/');
  return validoAte
    ? `Atualizado em ${data(atualizadoEm)}; válido até ${data(validoAte)}.`
    : `Atualizado em ${data(atualizadoEm)}.`;
}

/** Verdadeiro se a data de validade (AAAA-MM-DD) já passou em `hoje`; sem validade informada, nunca vence. */
export function conteudoVencido(validoAte: string | undefined, hoje: Date = new Date()): boolean {
  if (!validoAte) return false;
  return validoAte < hoje.toISOString().slice(0, 10);
}
