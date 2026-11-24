import { mensagensRecentes } from '@/lib/chat/historico';

export type MensagemDaConversa = { role: 'user' | 'assistant'; content: string };

/** Tamanho máximo de uma pergunta (o mesmo limite do servidor). */
export const LIMITE_DA_PERGUNTA = 1500;
const TEMPO_MAXIMO_MS = 130000;

/**
 * Envia a conversa ao chat e devolve o corpo da resposta (fluxo NDJSON). Um repasse ou o servidor pode devolver HTML (502/504):
 * sem JSON, a mensagem é a do status, não um erro de leitura.
 */
export async function pedirResposta(conversa: MensagemDaConversa[], interrupcao: AbortSignal) {
  const resposta = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify({ messages: mensagensRecentes(conversa) }),
    signal: AbortSignal.any([interrupcao, AbortSignal.timeout(TEMPO_MAXIMO_MS)]),
  });
  if (!resposta.ok) {
    const dados = await resposta.json().catch(() => ({})) as { error?: string };
    throw new Error(dados.error || (resposta.status >= 500 ? 'O serviço está indisponível agora. Tente novamente em instantes.' : 'Não foi possível enviar.'));
  }
  if (!resposta.body) throw new Error('A resposta não pôde ser recebida.');
  return resposta.body;
}

/** Texto do aviso para uma falha da conexão ou do servidor. */
export function avisoDaFalha(causa: unknown) {
  if (!(causa instanceof Error)) return 'Tente novamente.';
  return ['TimeoutError', 'AbortError'].includes(causa.name) ? 'O serviço de IA demorou para responder. Tente novamente em instantes.' : causa.message;
}
