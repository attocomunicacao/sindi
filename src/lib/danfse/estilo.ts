/**
 * Estilo visual do DANFSe: cores, deslocamentos de fonte e os estilos de célula (rótulo + valor) do gerador oficial.
 * Porte de style.go; ver a licença e o aviso no cabeçalho de `pdf.ts`.
 */
import { rgb } from 'pdf-lib';
import { ID, RECUO_CAMPO, SOMBRA_CAMPO_ALTURA, SOMBRA_CAMPO_TOPO, TAM_ROTULO, TAM_TITULO, TAM_VALOR } from '@/lib/danfse/geometria';

/** Compensação do deslocamento observado quando a Helvetica substituiu a fonte anterior (fração do tamanho). */
export const AJUSTE_BASE = 0.19;
/** Ascender da Helvetica (AFM, em milésimos de em). */
export const ASCENDER = 0.718;

export const PRETO = rgb(0, 0, 0);
export const CINZA_CABECALHO = rgb(0.9490196078, 0.9490196078, 0.9490196078);
export const VERMELHO = rgb(1, 0, 0);
export const RETICENCIAS = '...';

/** Limite de caracteres por texto desenhado: protege a medição de textos absurdos (o original já limita descrição e complementares). */
export const MAX_CARACTERES = 4000;

export type Estilo = { rotulo: number; valor: number; recuo: number; deslocRotulo: number; deslocValor: number; sombra?: { topo: number; altura: number } };
export const ESTILO_CAMPO: Estilo = { rotulo: TAM_ROTULO, valor: TAM_VALOR, recuo: RECUO_CAMPO, deslocRotulo: 0, deslocValor: 0.3 };
export const ESTILO_CAMPO_SOMBREADO: Estilo = { ...ESTILO_CAMPO, sombra: { topo: SOMBRA_CAMPO_TOPO, altura: SOMBRA_CAMPO_ALTURA } };
export const ESTILO_ACESSO: Estilo = { rotulo: TAM_VALOR, valor: TAM_VALOR, recuo: RECUO_CAMPO, deslocRotulo: 0, deslocValor: 0.3 };
export const ESTILO_ID: Estilo = { rotulo: TAM_TITULO, valor: TAM_VALOR, recuo: RECUO_CAMPO, deslocRotulo: ID.rotulo, deslocValor: ID.valor };
export const ESTILO_ID_SOMBREADO: Estilo = { ...ESTILO_ID, sombra: { topo: ID.sombraTopo, altura: ID.sombraAltura } };
