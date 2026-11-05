import type { Db } from '../db';

export type Ctx = { db: Db; /** Reprocessa também o histórico (coleta completa), em vez de só o recente. */ full: boolean };
export type Result = { fetched: number; changed: number };
export type Collector = { source: string; label: string; run: (ctx: Ctx) => Promise<Result> };

/** Termos do setor usados para filtrar proposições legislativas. */
export const LEGISLATIVE_KEYWORDS = ['terceirização', 'trabalho temporário', 'jornada de trabalho', 'escala 6x1', 'contribuição sindical', 'reforma trabalhista'];
export const SINDEPRESTEM_HOME = 'https://www.sindeprestem.com.br';
