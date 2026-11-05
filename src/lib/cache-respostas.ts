import { createHash } from 'node:crypto';

/**
 * Memória de respostas já escritas pelo modelo, só neste processo e só em RAM: a mesma pergunta, com as mesmas regras e as mesmas fontes, recebe na hora a resposta
 * que o modelo escreveu e que passou pela verificação de fatos. A chave é um resumo criptográfico (a pergunta em si não é guardada), nada vai a disco nem a log, e
 * qualquer mudança nas fontes, nas regras, nos exemplos ou no modelo muda a chave. Só vale para a primeira pergunta de uma conversa, que não depende de histórico.
 * `SINDI_CACHE_RESPOSTAS=0` desliga.
 */
// 24 horas por padrão: as respostas das perguntas frequentes são preparadas a cada publicação (aquecimento) e valem enquanto as fontes não mudarem.
const horas = Number(process.env.SINDI_CACHE_HORAS); const VALIDADE_MS = (horas > 0 && horas <= 168 ? horas : 24) * 60 * 60 * 1000; const MAXIMO = 500;
const respostas = new Map<string, { texto: string; ate: number }>();
export const cacheLigado = () => process.env.SINDI_CACHE_RESPOSTAS !== '0';
export const chaveDaResposta = (...partes: string[]) => createHash('sha256').update(partes.join('\u0000')).digest('hex');
export function respostaGuardada(chave: string, agora = Date.now()): string | undefined {
  const achada = respostas.get(chave); if (!achada) return undefined;
  if (achada.ate < agora) { respostas.delete(chave); return undefined; }
  // Reinsere para que as mais usadas sejam as últimas a sair.
  respostas.delete(chave); respostas.set(chave, achada); return achada.texto;
}
export function guardarResposta(chave: string, texto: string, agora = Date.now()) {
  respostas.delete(chave); respostas.set(chave, { texto, ate: agora + VALIDADE_MS });
  while (respostas.size > MAXIMO) respostas.delete(respostas.keys().next().value!);
}
export function limparRespostasGuardadas() { respostas.clear(); }
