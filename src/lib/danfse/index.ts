/**
 * Ponto de entrada do gerador de DANFSe: XML da NFS-e nacional -> PDF.
 * Porte do gerador oficial da Receita Federal do Brasil (MIT; ver o cabeçalho de `pdf.ts`).
 * Tudo em memória: nada é gravado nem registrado, e o mesmo XML gera sempre os mesmos bytes.
 */
import { apresentar, prepararNFSe } from '@/lib/danfse/apresentacao';
import { lerNFSe } from '@/lib/danfse/leitura';
import { SITUACAO_POR_STC } from '@/lib/danfse/modelo';
import { desenharDanfse } from '@/lib/danfse/pdf';

export { ErroDanfse } from '@/lib/danfse/modelo';
export { TAMANHO_MAXIMO_XML } from '@/lib/danfse/leitura';

export type OpcoesDanfse = { /** 0 válida, 1 substituída, 2 cancelada. */ stc?: 0 | 1 | 2; canhoto?: boolean };

/** Lê o XML (com todas as proteções de `lerNFSe`) e devolve o PDF do DANFSe. Lança `ErroDanfse` com mensagem em português. */
export async function gerarDanfse(xml: string, opcoes: OpcoesDanfse = {}): Promise<Uint8Array> {
  const inf = lerNFSe(xml);
  const nota = prepararNFSe(inf, SITUACAO_POR_STC[opcoes.stc ?? 0]);
  return desenharDanfse(apresentar(nota, { canhoto: opcoes.canhoto ?? true }));
}
