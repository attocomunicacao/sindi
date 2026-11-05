import { readFileSync } from 'node:fs';
import path from 'node:path';
import { retrieveKnowledge } from '../knowledge/retrieve';
import { casoJuridicoIndividual, sourceChoices } from '../knowledge/grounded';
import { sufficientEvidence } from '../knowledge/core';
import { pastaCerebro } from './carregar';

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
const norm = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').toLowerCase();
export const arquivoDeCasos = (nome = 'perguntas-ouro.md') => path.join(pastaCerebro(), 'avaliacao', nome);

/** Texto que a SINDI entrega ao modelo como fonte para a pergunta (nenhuma resposta pronta existe: o modelo sempre escreve). */
export async function evidenciaDa(pergunta: string): Promise<{ origem: string; texto: string }> {
  const conhecimento = await retrieveKnowledge(pergunta);
  const escolhidas = sourceChoices(conhecimento.passages, pergunta, conhecimento.lista ? 8 : 4).slice(0, conhecimento.lista ? 8 : 3);
  const texto = (sufficientEvidence(escolhidas, pergunta) ? escolhidas : []).map(p => `${p.title}\n${p.url}\n${p.content}`).join('\n\n');
  // Caso jurídico individual: o modelo recebe a orientação de encaminhar ao Setor Jurídico, e isso também vale como evidência.
  if (!texto && casoJuridicoIndividual(pergunta)) return { origem: 'encaminhamento', texto: 'Setor Jurídico (encaminhamento)' };
  return { origem: texto ? 'evidência' : 'sem evidência', texto };
}
/** Com `somenteResposta`, só a resposta final do modelo é conferida; a evidência não conta (necessário para `nao:` e para recusas, que a evidência poderia satisfazer ou contaminar). */
export async function avaliarCasos(casos: Caso[], textoExtra?: (pergunta: string) => Promise<string>, somenteResposta = false): Promise<ResultadoCaso[]> {
  const resultados: ResultadoCaso[] = [];
  for (const caso of casos) {
    const { origem, texto } = await evidenciaDa(caso.pergunta);
    const completo = textoExtra ? (somenteResposta ? await textoExtra(caso.pergunta) : `${texto}\n\n[MODELO]\n${await textoExtra(caso.pergunta)}`) : texto; const alvo = norm(completo);
    const faltam = caso.espera.filter(e => !alvo.includes(norm(e))); const proibidos = caso.nao.filter(n => alvo.includes(norm(n)));
    resultados.push({ pergunta: caso.pergunta, ok: !faltam.length && !proibidos.length, origem: textoExtra ? `${origem}+modelo` : origem, faltam, proibidos, evidencia: completo.slice(0, 400).replace(/\n/g, ' '), categoria: caso.categoria });
  }
  return resultados;
}
export const carregarCasos = (nome?: string, semExpectativa = false) => lerCasos(readFileSync(arquivoDeCasos(nome), 'utf8'), semExpectativa);
