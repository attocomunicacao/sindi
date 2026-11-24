import { z } from 'zod';
import { erroJson, guardaDeEscrita, respostaPdf } from '@/lib/http/guarda';
import { ErroDanfse, gerarDanfse, TAMANHO_MAXIMO_XML } from '@/lib/danfse';

export const runtime = 'nodejs';

// O XML vai dentro de um JSON: a margem cobre o escape das aspas e das quebras de linha.
const LIMITE_BYTES = Math.ceil(TAMANHO_MAXIMO_XML * 1.05);

const schema = z.object({
  xml: z.string().min(1, 'Envie o XML da NFS-e.'),
  stc: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  canhoto: z.boolean().optional(),
}).strict();

/**
 * Gera o DANFSe (PDF) a partir do XML da NFS-e nacional. O XML é processado em memória e descartado:
 * não é gravado, nem registrado em log, nem devolvido em mensagem de erro.
 */
export async function POST(request: Request) {
  const lida = await guardaDeEscrita(request, {
    nome: 'danfse', limitePorMinuto: 10, limiteBytes: LIMITE_BYTES,
    textos: { grande: 'O XML passa do limite de 5 MiB.', invalido: 'Requisição inválida.' },
  });
  if ('resposta' in lida) return lida.resposta;
  const corpo = schema.safeParse(lida.json);
  if (!corpo.success) return erroJson('Envie um JSON com o XML da NFS-e e, se quiser, a situação (0, 1 ou 2) e o canhoto (verdadeiro ou falso).', 400);
  try {
    return respostaPdf(await gerarDanfse(corpo.data.xml, { stc: corpo.data.stc, canhoto: corpo.data.canhoto }), 'danfse.pdf');
  } catch (erro) {
    if (erro instanceof ErroDanfse) return erroJson(erro.message, 400);
    return erroJson('Não foi possível gerar o DANFSe com este XML.', 400);
  }
}
