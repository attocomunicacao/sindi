import type { Passagem, TrechosDeDocumentos } from '@/lib/base/tipos';
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
  if (nr.passages.length || nr.semResposta) return marcar(nr, () => 'estante:normas');
  const lei = trechosDeLei(pergunta, termos, arquivo);
  if (lei.passages.length || lei.semResposta)
    return marcar(lei, (p) =>
      /^Constitui/i.test(p.title)
        ? 'estante:constituicao'
        : /^Regimento/i.test(p.title)
          ? 'estante:regimentos'
          : 'estante:legislacao',
    );
  if (perguntaDeClausula(q)) return marcar(trechosDeClausula(pergunta, arquivo), () => 'estante:convencoes');
  const indicadores = trechosDeIndicadores(pergunta, arquivo);
  if (indicadores.length) return marcar({ passages: indicadores }, () => 'estante:indicadores');
  const posicao = trechosDePosicionamento(pergunta, arquivo);
  if (posicao.passages.length || posicao.semResposta) return marcar(posicao, () => 'estante:noticias');
  const lista = trechosDoSindicato(pergunta, arquivo);
  if (lista.length) return marcar({ passages: lista, lista: true }, () => 'estante:institucional');
  return { passages: [] };
}

/** Marca de onde cada trecho veio (a estante do grafo), para a telemetria de uso do cérebro; o conteúdo não muda. */
function marcar(r: TrechosDeDocumentos, estante: (p: Passagem) => string): TrechosDeDocumentos {
  return { ...r, passages: r.passages.map((p) => ({ ...p, origem: 'documento' as const, no: estante(p) })) };
}
