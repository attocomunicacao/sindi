import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Passage } from '../knowledge/core';
import { pastaCerebro, regrasDoCerebro } from './carregar';

/**
 * O que "ensina" o modelo pequeno, sem treinar pesos: as regras (`cerebro/instrucoes/identidade-e-regras.md`), exemplos de pergunta e resposta
 * (`cerebro/instrucoes/exemplos.md`) e, a cada pergunta, a orientação do conector da área com as fontes da biblioteca.
 *
 * Regras e exemplos são idênticos em todas as conversas e vêm primeiro: o Ollama reaproveita do cache o que já leu (prefixo igual), então só as fontes e a
 * pergunta são lidas a cada resposta. Em CPU, ler o prompt é o que mais demora; por isso nada que mude por pergunta pode vir antes deles.
 */
export type Mensagem = { role: 'system' | 'user' | 'assistant'; content: string };

const RESERVA = 'Você é a SINDI, assistente virtual (IA) do SINDEPRESTEM, o sindicato patronal das empresas de terceirização e trabalho temporário do Estado de São Paulo. Responda em português do Brasil, em frases curtas, só com o que está nas FONTES da mensagem. Se as FONTES não respondem, diga que não conseguiu confirmar e indique o contato do SINDEPRESTEM. Nunca invente números, leis, nomes ou contatos. Não dê parecer jurídico.';
/** Regras-base enviadas como mensagem de sistema. Sem o arquivo de regras, vale um texto de reserva com as mesmas proteções. */
export const sistema = (pasta = pastaCerebro()) => regrasDoCerebro(pasta) || RESERVA;

export type Pedido = { orientacao: string; palavras: number; nota?: string; fontes: Passage[]; pergunta: string; orcamento?: number };
/** Texto das fontes dentro de um orçamento de caracteres (o que o modelo lê a cada pergunta), dividido por igual: o que uma fonte curta não usa fica para as seguintes. */
export function textoDasFontes(fontes: Passage[], orcamento = 1900): string {
  let restante = orcamento;
  return fontes.map((p, i) => {
    const trecho = p.content.slice(0, Math.max(250, Math.floor(restante / (fontes.length - i)))); restante -= trecho.length;
    return `[${i + 1}] ${p.title}\n${trecho}`;
  }).join('\n\n');
}
/** Mensagem do usuário que o modelo recebe: orientação da área, situação (se houver), fontes e, por último, a pergunta. */
export function mensagemDoPedido({ orientacao, palavras, nota, fontes, pergunta, orcamento }: Pedido): string {
  return [`ORIENTAÇÃO: ${orientacao} Responda em até ${palavras} palavras.`, nota?.trim(), fontes.length ? `FONTES:\n${textoDasFontes(fontes, orcamento)}` : 'FONTES: nenhuma.', `PERGUNTA: ${pergunta}`].filter(Boolean).join('\n\n');
}

export type Exemplo = { orientacao: string; palavras: number; fontes: string; pergunta: string; resposta: string };
/** Lê os exemplos: cada `## título` tem as linhas `orientacao:`, `palavras:`, `pergunta:`, `resposta:` e um bloco `fontes:` (até a linha `pergunta:`). */
export function lerExemplos(markdown: string): Exemplo[] {
  return markdown.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split(/^## .*$/m).slice(1).flatMap(bloco => {
    const campo = (nome: string) => bloco.match(new RegExp(`^${nome}:[ \\t]*(.*)$`, 'm'))?.[1].trim() ?? '';
    const fontes = bloco.match(/^fontes:[ \t]*\n?([\s\S]*?)(?=^pergunta:)/m)?.[1].trim() ?? '';
    const resposta = bloco.match(/^resposta:[ \t]*([\s\S]*)$/m)?.[1].trim() ?? '';
    const pergunta = campo('pergunta');
    return pergunta && resposta ? [{ orientacao: campo('orientacao'), palavras: Number(campo('palavras')) || 70, fontes, pergunta, resposta }] : [];
  });
}
let cache: { mtime: number; mensagens: Mensagem[]; verificadoEm: number } | undefined;
/** Exemplos como pares de mensagens no mesmo formato do pedido real: é assim que o modelo aprende o formato, o tamanho e a recusa. */
export function exemplos(pasta = pastaCerebro()): Mensagem[] {
  if (cache && Date.now() - cache.verificadoEm < 5000) return cache.mensagens;
  const arquivo = path.join(pasta, 'instrucoes', 'exemplos.md');
  try {
    const mtime = statSync(arquivo).mtimeMs;
    if (cache && cache.mtime === mtime) { cache.verificadoEm = Date.now(); return cache.mensagens; }
    const mensagens = lerExemplos(readFileSync(arquivo, 'utf8')).slice(0, 4).flatMap((e): Mensagem[] => [
      { role: 'user', content: [`ORIENTAÇÃO: ${e.orientacao} Responda em até ${e.palavras} palavras.`, e.fontes ? `FONTES:\n${e.fontes}` : 'FONTES: nenhuma.', `PERGUNTA: ${e.pergunta}`].join('\n\n') },
      { role: 'assistant', content: e.resposta },
    ]);
    cache = { mtime, mensagens, verificadoEm: Date.now() }; return mensagens;
  } catch { cache = { mtime: 0, mensagens: [], verificadoEm: Date.now() }; return []; }
}
export function reiniciarCacheDasInstrucoes() { cache = undefined; }
