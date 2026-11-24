// Sem dependências do servidor: decide quando uma pergunta é continuação da anterior e monta a consulta da busca com o assunto da conversa.
import { termosDaConsulta } from '@/lib/base/texto';

/** Uma continuação tem no máximo 12 palavras (antes eram 6) e nenhum assunto próprio. */
const PALAVRAS_MAXIMAS_DA_CONTINUACAO = 12;
/** Termos de busca que uma pergunta precisa ter para ser um assunto por si só (não herda o assunto anterior). */
const TERMOS_DE_ASSUNTO_PROPRIO = 3;
const TAMANHO_DO_ASSUNTO = 300;

const palavrasDe = (texto: string) => texto.trim().split(/\s+/).filter(Boolean).length;
/** A pergunta se explica sozinha: tem termos suficientes para ser buscada sem o resto da conversa. */
export const temAssuntoProprio = (texto: string) => termosDaConsulta(texto).length >= TERMOS_DE_ASSUNTO_PROPRIO;

/**
 * "E para empresa filiada?" depende do que veio antes; "Qual o horário de atendimento?" não, mesmo curta (assunto novo: não herda o anterior e não polui a busca).
 * Antes só contava o tamanho (até 6 palavras), então uma pergunta nova e curta herdava o assunto antigo e uma continuação de 7 a 12 palavras o perdia.
 */
export function ehContinuacao(atual: string): boolean {
  return palavrasDe(atual) <= PALAVRAS_MAXIMAS_DA_CONTINUACAO && !temAssuntoProprio(atual);
}

/**
 * O assunto da conversa: a pergunta anterior MAIS RECENTE que se explica sozinha. Assim, "e para temporário?" depois de "e para filiada?" ainda
 * enxerga a pergunta original; sem nenhuma assim, vale a última.
 */
export function assuntoDaConversa(anteriores: string[]): string | undefined {
  if (!anteriores.length) return undefined;
  const base = [...anteriores].reverse().find((p) => !ehContinuacao(p)) ?? anteriores.at(-1)!;
  return base.slice(0, TAMANHO_DO_ASSUNTO);
}

/** A consulta da busca: a pergunta atual, acrescida do assunto da conversa quando ela é uma continuação. */
export function consultaDaConversa(atual: string, anteriores: string[]): string {
  const assunto = assuntoDaConversa(anteriores);
  return assunto && ehContinuacao(atual) ? `${assunto} ${atual}` : atual;
}
