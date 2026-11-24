import type { Passagem } from '@/lib/base/tipos';
import { normalizar } from '@/lib/base/texto';
import { PERGUNTA_DE_ATUACAO, PERGUNTA_DE_CONVENCAO } from '@/lib/recuperacao/intencao';

// Sem dependências de servidor: o fiscalizador só olha endereço e texto. Por decisão do usuário (24/11/2026), toda questão jurídica deve
// se apoiar em fonte confiável (governo, Constituição, tribunais, Congresso), e fonte confiável sempre pesa mais que as demais.

/** Quem escreveu a fonte: o poder público (oficial), o próprio sindicato (entidade) ou qualquer outro (terceiro). Fonte sem endereço é interna (texto da equipe). */
export type NivelDaFonte = 'oficial' | 'entidade' | 'interna' | 'terceiro';

/** Sufixos de domínio do poder público brasileiro: governo (gov.br), Legislativo (leg.br), Judiciário (jus.br) e Ministério Público (mp.br). */
const SUFIXOS_OFICIAIS = ['.gov.br', '.leg.br', '.jus.br', '.mp.br'];
const DOMINIOS_DA_ENTIDADE = ['sindeprestem.com.br', 'fenaserhtt.org.br'];

/** Nível de um endereço. Só `https` ou `http` valem; o nome do host é comparado inteiro (`gov.br.falso.com` não é oficial). */
export function nivelDaUrl(url: string | undefined): NivelDaFonte {
  if (!url) return 'interna';
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'terceiro';
    host = u.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return 'terceiro';
  }
  const dominio = (d: string) => host === d.replace(/^\./, '') || host.endsWith(d.startsWith('.') ? d : `.${d}`);
  if (SUFIXOS_OFICIAIS.some(dominio)) return 'oficial';
  if (DOMINIOS_DA_ENTIDADE.some(dominio)) return 'entidade';
  return 'terceiro';
}

export const nivelDaPassagem = (p: Pick<Passagem, 'url'>): NivelDaFonte => nivelDaUrl(p.url);

/** Pontos somados à relevância de uma passagem na ordenação final (a relevância vai de 0 a pouco mais de 1): a fonte oficial vence um empate folgado, mas não uma fonte que nada tem a ver. */
const BONUS: Record<NivelDaFonte, number> = { oficial: 0.3, entidade: 0.1, interna: 0.1, terceiro: 0 };
export const bonusDeConfianca = (p: Pick<Passagem, 'url'>): number => BONUS[nivelDaPassagem(p)];

/**
 * Pergunta sobre o que a lei diz, exige ou permite: lei, artigo, Constituição, CLT, súmula, norma regulamentadora, emenda, projeto de lei,
 * jornada, multa, prazo legal, obrigação. É aqui que a fonte oficial passa a ser exigida.
 */
const JURIDICA =
  /\blei\b|\bleis\b|\bartigos? (\d|da lei|do decreto|da clt|da constitui)|\bart\.? ?\d|constitui[cç][aã]o|\bclt\b|s[uú]mula|norma regulamentadora|\bnr-?\s?\d|\bec ?\d|emenda constitucional|\bpec\b|projeto de lei|\bplp?\b|decreto|portaria (do|da|mte|mtp|n|\d)|jornada|\bobriga|\bproibid|\bmulta|\bprazo legal|fiscaliza[cç][aã]o|responsabilidade subsidi|terceiriza[cç][aã]o.*(lic[ií]|permit)|\bdireito\b|legisla[cç][aã]o/;
export const perguntaJuridica = (pergunta: string): boolean => JURIDICA.test(normalizar(pergunta));

/** Quantas vezes um texto cita termos jurídicos: serve para separar o arquivo de conhecimento que trata de lei do que só a menciona de passagem. */
export function termosJuridicosEm(texto: string): number {
  return (normalizar(texto).match(new RegExp(JURIDICA.source, 'g')) ?? []).length;
}

/**
 * Pergunta que SÓ se responde com texto oficial. Ficam de fora o que o sindicato faz ("o que o Sindeprestem está fazendo sobre a NR-1?", resposta nas notícias da entidade)
 * e o conteúdo de convenção coletiva (documento do próprio setor): ali a fonte certa é da entidade, não do governo.
 */
export function exigeFonteOficial(pergunta: string): boolean {
  const q = normalizar(pergunta);
  const doSindicato =
    /(sindeprestem|sindicato|entidade).{0,50}(acompanh|publica|oferece|ajuda)|(acompanh|publica|oferece).{0,40}(sindeprestem|sindicato|entidade)/.test(
      q,
    );
  return perguntaJuridica(pergunta) && !PERGUNTA_DE_ATUACAO.test(q) && !PERGUNTA_DE_CONVENCAO.test(q) && !doSindicato;
}

export type ResultadoDaFiscalizacao = {
  juridica: boolean;
  /** Quantas fontes de cada nível chegaram ao modelo. */
  niveis: Record<NivelDaFonte, number>;
  temOficial: boolean;
  /** Pergunta jurídica sem nenhuma fonte oficial (ou sem fonte alguma): a SINDI não responde, diz que não conseguiu confirmar nas fontes oficiais. */
  semOficial: boolean;
};

/** Confere as fontes escolhidas contra a natureza da pergunta. Não altera nada: quem decide o que fazer é o chamador. */
export function fiscalizarFontes(pergunta: string, fontes: Passagem[]): ResultadoDaFiscalizacao {
  const niveis: Record<NivelDaFonte, number> = { oficial: 0, entidade: 0, interna: 0, terceiro: 0 };
  for (const f of fontes) niveis[nivelDaPassagem(f)]++;
  const juridica = exigeFonteOficial(pergunta);
  // Resultado de ferramenta (cálculo do orçamento) é conta da SINDI sobre a tabela oficial do setor, não afirmação de lei: não exige fonte do governo.
  const temOficial = niveis.oficial > 0 || fontes.some((f) => f.ferramenta);
  return { juridica, niveis, temOficial, semOficial: juridica && !temOficial };
}
