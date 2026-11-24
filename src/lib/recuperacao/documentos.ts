import type { TrechosDeDocumentos } from '@/lib/base/tipos';
import { normalizar } from '@/lib/base/texto';
import { caminhoDoBanco } from '@/lib/dados/db';
import { trechosDeClausula } from '@/lib/recuperacao/convencoes';
import { trechosDeIndicadores } from '@/lib/recuperacao/indicadores';
import { perguntaDeClausula } from '@/lib/recuperacao/intencao';
import { trechosDeLei, trechosDeNR } from '@/lib/recuperacao/leis';
import { trechosDePosicionamento, trechosDoSindicato } from '@/lib/recuperacao/sindicato';

/**
 * Tudo o que a SINDI sabe de fontes estruturadas ou documentos longos, como trechos escolhidos pela pergunta: NR, Constituição e regimentos, cláusulas de convenção,
 * indicadores, posição do sindicato em artigos e notícias, e listas de documentos do sindicato. Os trechos vão ao modelo, nunca ao usuário: a SINDI explica, não copia.
 * `semResposta` é o aviso quando o documento pedido não consta da coleta. `lista` indica que há vários documentos curtos (mais trechos cabem na evidência).
 */
export function trechosDeDocumentos(
  pergunta: string,
  termos: string[],
  arquivo = caminhoDoBanco(),
): TrechosDeDocumentos {
  const q = normalizar(pergunta);
  const nr = trechosDeNR(pergunta, arquivo);
  if (nr.passages.length || nr.semResposta) return nr;
  const lei = trechosDeLei(pergunta, termos, arquivo);
  if (lei.passages.length || lei.semResposta) return lei;
  if (perguntaDeClausula(q)) return trechosDeClausula(pergunta, arquivo);
  const indicadores = trechosDeIndicadores(pergunta, arquivo);
  if (indicadores.length) return { passages: indicadores };
  const posicao = trechosDePosicionamento(pergunta, arquivo);
  if (posicao.passages.length || posicao.semResposta) return posicao;
  const lista = trechosDoSindicato(pergunta, arquivo);
  if (lista.length) return { passages: lista, lista: true };
  return { passages: [] };
}
