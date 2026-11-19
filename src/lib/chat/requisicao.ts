import { timingSafeEqual } from 'node:crypto';
import type { z } from 'zod';
import { chatSchema } from '@/lib/chat';
import { erroJson, guardaDeEscrita } from '@/lib/http/guarda';

export type MensagemDoChat = z.infer<typeof chatSchema>['messages'][number];

/**
 * Aquecimento (scripts/operacao/aquecer.ts): o próprio servidor pergunta as perguntas frequentes para guardar as respostas. Essas chamadas trazem um token
 * gerado a cada publicação e não entram nas métricas públicas de uso nem gastam a cota; sem o token certo, o pedido é tratado como qualquer outro.
 */
export function ehAquecimento(request: Request) {
  const esperado = process.env.SINDI_AQUECIMENTO_TOKEN ?? ''; const recebido = request.headers.get('x-sindi-aquecimento') ?? '';
  return esperado.length >= 32 && recebido.length === esperado.length && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
}

/** Origem, tipo, tamanho e formato do pedido do chat (papéis `system` e sequências inválidas são recusados pelo schema), mais a marca de aquecimento. */
export async function lerRequisicaoDoChat(request: Request): Promise<{ mensagens: MensagemDoChat[]; aquecimento: boolean } | { resposta: Response }> {
  const guarda = await guardaDeEscrita(request, { nome: 'chat', limiteBytes: 1_000_000, textos: { grande: 'Conversa muito longa.', invalido: 'Mensagem inválida.' } });
  if ('resposta' in guarda) return guarda;
  const parsed = chatSchema.safeParse(guarda.json);
  if (!parsed.success) return { resposta: erroJson('Revise a mensagem e tente novamente.', 400) };
  return { mensagens: parsed.data.messages, aquecimento: ehAquecimento(request) };
}
