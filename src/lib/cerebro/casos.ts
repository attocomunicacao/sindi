import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pastaCerebro } from '@/lib/cerebro/carregar';

export type Caso = { pergunta: string; espera: string[]; nao: string[]; categoria?: string };
export type ResultadoCaso = { pergunta: string; ok: boolean; origem: string; faltam: string[]; proibidos: string[]; evidencia: string; categoria?: string };

/** Lê as perguntas de ouro: `## pergunta`, `espera: a | b` (todos devem aparecer), `nao: x` (não pode aparecer) e `categoria: y` (só para o relatório). Títulos `###` agrupam e são ignorados. */
export function lerCasos(markdown: string, semExpectativa = false): Caso[] {
  const casos: Caso[] = [];
  for (const bloco of markdown.replace(/\r\n/g, '\n').split(/^## /m).slice(1)) {
    const linhas = bloco.split('\n'); const caso: Caso = { pergunta: linhas[0].trim(), espera: [], nao: [] };
    for (const l of linhas.slice(1)) {
      const m = l.match(/^(espera|nao):\s*(.+)$/); if (m) (m[1] === 'espera' ? caso.espera : caso.nao).push(...m[2].split('|').map(s => s.trim()).filter(Boolean));
      const c = l.match(/^categoria:\s*(.+)$/); if (c) caso.categoria = c[1].trim();
    }
    // Com `semExpectativa`, perguntas só com `categoria:` também entram: servem para ler a resposta e medir o tempo, sem critério automático.
    if (caso.espera.length || caso.nao.length || (semExpectativa && caso.categoria)) casos.push(caso);
  }
  return casos;
}
export const arquivoDeCasos = (nome = 'perguntas-ouro.md') => path.join(pastaCerebro(), 'avaliacao', nome);
export const carregarCasos = (nome?: string, semExpectativa = false) => lerCasos(readFileSync(arquivoDeCasos(nome), 'utf8'), semExpectativa);
