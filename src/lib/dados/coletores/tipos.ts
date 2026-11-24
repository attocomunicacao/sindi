import type { BancoDeDados } from '@/lib/dados/db';

export type ContextoDaColeta = {
  db: BancoDeDados;
  /** Reprocessa também o histórico (coleta completa), em vez de só o recente. */ full: boolean;
};
export type ResultadoDaColeta = { fetched: number; changed: number };
export type Coletor = { source: string; label: string; run: (ctx: ContextoDaColeta) => Promise<ResultadoDaColeta> };

/** Termos do setor usados para filtrar proposições legislativas. */
export const PALAVRAS_LEGISLATIVAS = [
  'terceirização',
  'trabalho temporário',
  'jornada de trabalho',
  'escala 6x1',
  'contribuição sindical',
  'reforma trabalhista',
];
