import { normalizar } from '@/lib/base/texto';

/** Artigo citado na pergunta ("art. 7º", "artigo 5-A"); devolve a chave usada nas URLs (7, 5-A). */
export function chaveDoArtigo(pergunta: string) {
  const q = normalizar(pergunta);
  const m = q.match(/\bart(?:igo|\.)?\s*(\d{1,4})/);
  if (!m) return undefined;
  // A letra do artigo vem com hífen ("5-A", "5º-A") ou colada ao número ("5a"); "art. 7º a lei..." não é o artigo 7-A. O "o" colado é o ordinal ("5o").
  const resto = q.slice((m.index ?? 0) + m[0].length);
  const letra = resto.match(/^\s*[º°o]?\s*-\s*([a-z])\b/)?.[1] ?? resto.match(/^[º°]?([a-np-z])\b/)?.[1];
  return m[1] + (letra ? `-${letra.toUpperCase()}` : '');
}
/** Palavras que não ajudam a achar o trecho certo dentro de um documento longo (perguntas do tipo "como a NR-1 impacta minha empresa?"). */
const PALAVRAS_GENERICAS_DO_DOCUMENTO = new Set(
  'como qual quais quem onde quando porque para pode posso preciso precisa impacta impacto impactar afeta afetar minha meu minhas meus vida empresa empresas sobre isso esta esse essa diz fala dizem norma normas regulamentadora regulamentadoras artigo artigos constituicao regimento federal explique explica significa quer dizer exemplo'.split(
    ' ',
  ),
);
export const PALAVRAS_VAZIAS_DA_PERGUNTA = new Set(
  'qual quais como onde quando para por com que uma uns umas dos das nos nas pelo pela sobre este esta esse essa existe tem ter ser sao foi aos aquele convencao convencoes coletiva coletivas cct ccts aditivo sindicato sindeprestem trabalhador trabalhadores empresa empresas categoria'.split(
    ' ',
  ),
);
/** Termos da pergunta que distinguem o assunto dentro do documento, sem os rótulos ("NR", número) e sem palavras genéricas. */
export function termosDoDocumento(pergunta: string) {
  return [
    ...new Set(
      (normalizar(pergunta).match(/[a-z0-9]{4,}/g) ?? []).filter(
        (w) => !PALAVRAS_GENERICAS_DO_DOCUMENTO.has(w) && !PALAVRAS_VAZIAS_DA_PERGUNTA.has(w) && !/^\d+$/.test(w),
      ),
    ),
  ].slice(0, 8);
}
