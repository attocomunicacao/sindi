/**
 * Geometria do DANFSe: posições em centímetros contados do topo da página (como no gerador oficial da Receita Federal),
 * conversões para pontos do PDF e o cálculo de quanto espaço a descrição e as informações complementares ganham.
 * Porte de layout.go; ver a licença e o aviso no cabeçalho de `pdf.ts`.
 */
import { A4 } from '@/lib/pdf/base';
import type { DocumentoDanfse } from '@/lib/danfse/apresentacao';

export const LARGURA_PAG = A4.width;
export const ALTURA_PAG = A4.height;
export const CM_PT = 72 / 2.54;
export const cm = (v: number) => v * CM_PT;
export const topoParaY = (topoCm: number) => ALTURA_PAG - topoCm * CM_PT;

export const PAGINA = { esquerda: 0.15, topo: 0.15, direita: 20.85, baixo: 29.55 };
export const GRADE = { esquerda: 0.3, x2: 5.41, x3: 10.51, x4: 15.62, fim: 20.7 };
export const LIMITES_COLUNA = [GRADE.esquerda, GRADE.x2, GRADE.x3, GRADE.x4, GRADE.fim];
export const colunaX = (i: number) => (i < 0 || i > 3 ? 0 : LIMITES_COLUNA[i] * CM_PT);
/** Largura, em pontos, de `quantidade` colunas a partir da `inicio`. */
export const larguraColunas = (inicio: number, quantidade: number) =>
  inicio < 0 || quantidade <= 0 || inicio + quantidade > 4
    ? 0
    : (LIMITES_COLUNA[inicio + quantidade] - LIMITES_COLUNA[inicio]) * CM_PT;
export const COL1_CM = GRADE.x2 - GRADE.esquerda;
export const corpoEsq = () => GRADE.esquerda * CM_PT;
export const corpoDir = () => GRADE.fim * CM_PT;

export const QR = { esquerda: 17.39, topo: 1.58, lado: 1.9, textoTopo: 3.53, textoPasso: 0.21, textoLargura: 4.72 };
export const QR_TEXTO_ESQ = QR.esquerda + (QR.lado - QR.textoLargura) / 2;
export const CHAVE = { topo: 1.48, largura: 15.3 };
export const TOPO_CAMPOS_NFSE = 2.27;
export const TOPO_CAMPOS_DPS = 2.96;

export const RECUO_CAMPO = 0.08;
export const ID = { altura: 0.69, rotulo: 0.06, valor: 0.36, sombraTopo: 0.015, sombraAltura: 0.675 };
export const TITULO_SECAO = 0.07;
export const PASSO_PARTE = 0.64;
export const PASSO_MUNICIPAL = 0.65;
export const PASSO_FEDERAL = 0.65;
export const PASSO_IBS = 0.64;
export const IBS_LINHA2 = 1.29;
export const IBS_LINHA3 = 1.94;
export const PASSO_TOTAIS = 0.69;
export const DESLOC_TRIB_SERVICO = 0.65;
export const DESLOC_DESC_SERVICO = 1.05;
export const DESLOC_CONTEUDO_COMPL = 0.41;
export const SOMBRA_CAMPO_TOPO = 0.015;
export const SOMBRA_CAMPO_ALTURA = PASSO_PARTE - SOMBRA_CAMPO_TOPO;

export const TAM_ROTULO = 6;
export const TAM_VALOR = 7;
export const TAM_TITULO = 7;
export const PASSO_LINHA = (TAM_VALOR * 1.2) / CM_PT;
export const PASSO_LINHA_COMPL = (6.5 * 1.2) / CM_PT;
export const FOLGA_COLUNA = 0.15;
export const MIN_LINHAS_COMPL = 12;
export const FOLGA_INFO = 0.1;
export const Y_CANHOTO = 28.1;
export const CANHOTO_BAIXO = 28.77;
export const ALTURA_SECAO = 0.63;
export const ALTURA_SECAO_COMPL = 0.39;
export const ALTURA_SECAO_TOTAL = 0.67;
export const ALTURA_PARTE_SUPRIMIDA = 0.4;
export const ALTURA_MUNICIPAL_SUPRIMIDO = 0.32;
export const ALTURA_PARTE = 1.94;
export const ALTURA_MUNICIPAL = 2.59;

export const ANCORAS = {
  tomador: 6.92,
  destinatario: 8.86,
  intermediario: 10.8,
  servico: 12.74,
  municipal: 14.43,
  federal: 17.02,
  ibs: 18.32,
  totais: 20.9,
  complementar: 22.27,
};

export type LayoutPagina = {
  tomador: number;
  destinatario: number;
  intermediario: number;
  servico: number;
  municipal: number;
  federal: number;
  ibs: number;
  totais: number;
  complementar: number;
};

export function montarLayoutPagina(doc: DocumentoDanfse): LayoutPagina {
  const altura = (visivel: boolean) => (visivel ? ALTURA_PARTE : ALTURA_PARTE_SUPRIMIDA);
  const tomador = ANCORAS.tomador;
  const destinatario = tomador + altura(doc.partes.tomador.visivel);
  const intermediario = destinatario + altura(doc.partes.destinatario.visivel);
  const servico = intermediario + altura(doc.partes.intermediario.visivel);
  const municipal = servico + (ANCORAS.municipal - ANCORAS.servico);
  const federal = municipal + (doc.municipal.visivel ? ALTURA_MUNICIPAL : ALTURA_MUNICIPAL_SUPRIMIDO);
  const ibs = federal + (ANCORAS.ibs - ANCORAS.federal);
  const totais = ibs + (ANCORAS.totais - ANCORAS.ibs);
  const complementar = totais + (ANCORAS.complementar - ANCORAS.totais);
  return { tomador, destinatario, intermediario, servico, municipal, federal, ibs, totais, complementar };
}

export const limiteInferior = (canhoto: boolean) => (canhoto ? Y_CANHOTO : CANHOTO_BAIXO);

export function contarLinhasComplementares(topoConteudo: number, topoLinhaTributos: number) {
  return Math.max(1, Math.floor((topoLinhaTributos - topoConteudo - FOLGA_INFO) / PASSO_LINHA_COMPL + 1e-9));
}

export function calcularAlocacaoTexto(
  layout: LayoutPagina,
  canhoto: boolean,
  linhasDescricao: number,
  linhasCompl: number,
) {
  linhasDescricao = Math.max(1, linhasDescricao);
  linhasCompl = Math.max(1, linhasCompl);
  const reserva = Math.min(linhasCompl, MIN_LINHAS_COMPL);
  const topoLinha = limiteInferior(canhoto);
  const baseConteudo = layout.complementar + DESLOC_CONTEUDO_COMPL;
  const disponivel = Math.max(0, topoLinha - baseConteudo - FOLGA_INFO);
  // A descrição do serviço ganha o espaço primeiro; as complementares mantêm ao menos uma linha.
  const extraDescricao = (linhasDescricao - 1) * PASSO_LINHA;
  const pedidoCompl = reserva * PASSO_LINHA_COMPL;
  if (extraDescricao + pedidoCompl > disponivel) {
    const maxExtra = Math.max(0, disponivel - pedidoCompl);
    const maxLinhas = 1 + Math.floor(maxExtra / PASSO_LINHA + 1e-9);
    if (linhasDescricao > maxLinhas) linhasDescricao = maxLinhas;
  }
  linhasDescricao = Math.max(1, linhasDescricao);
  const deslocamento = (linhasDescricao - 1) * PASSO_LINHA;
  return {
    linhasDescricao,
    linhasComplementares: contarLinhasComplementares(baseConteudo + deslocamento, topoLinha),
    deslocamento,
  };
}
