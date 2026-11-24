import { normalizar } from '@/lib/base/texto';

/** Artigo citado na pergunta ("art. 7º", "artigo 5-A"); devolve a chave usada nas URLs (7, 5-A). */
export function chaveDoArtigo(pergunta: string) {
  const m = normalizar(pergunta).match(/\bart(?:igo|\.)?\s*(\d{1,4})\s*(?:[-º°o]\s*)?([a-z])?\b/);
  if (!m) return undefined;
  const sufixo = m[2] && /^[a-z]$/.test(m[2]) && /art(?:igo|\.)?\s*\d+\s*[-º°o]?\s*[a-z]\b/.test(normalizar(pergunta)) ? `-${m[2].toUpperCase()}` : '';
  return m[1] + sufixo;
}
/** Palavras que não ajudam a achar o trecho certo dentro de um documento longo (perguntas do tipo "como a NR-1 impacta minha empresa?"). */
const PALAVRAS_GENERICAS_DO_DOCUMENTO = new Set('como qual quais quem onde quando porque para pode posso preciso precisa impacta impacto impactar afeta afetar minha meu minhas meus vida empresa empresas sobre isso esta esse essa diz fala dizem norma normas regulamentadora regulamentadoras artigo artigos constituicao regimento federal explique explica significa quer dizer exemplo'.split(' '));
export const PALAVRAS_VAZIAS_DA_PERGUNTA = new Set('qual quais como onde quando para por com que uma uns umas dos das nos nas pelo pela sobre este esta esse essa existe tem ter ser sao foi aos aquele convencao convencoes coletiva coletivas cct ccts aditivo sindicato sindeprestem trabalhador trabalhadores empresa empresas categoria'.split(' '));
/** Termos da pergunta que distinguem o assunto dentro do documento, sem os rótulos ("NR", número) e sem palavras genéricas. */
export function termosDoDocumento(pergunta: string) {
  return [...new Set((normalizar(pergunta).match(/[a-z0-9]{4,}/g) ?? []).filter(w => !PALAVRAS_GENERICAS_DO_DOCUMENTO.has(w) && !PALAVRAS_VAZIAS_DA_PERGUNTA.has(w) && !/^\d+$/.test(w)))].slice(0, 8);
}
