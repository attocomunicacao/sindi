import { timingSafeEqual } from 'node:crypto';
import type { z } from 'zod';
import { chatSchema } from '@/lib/chat/esquema';
import { erroJson, guardaDeEscrita } from '@/lib/http/guarda';
import { inteiro } from '@/lib/ia/tipos';

export type MensagemDoChat = z.infer<typeof chatSchema>['messages'][number];

/**
 * Aquecimento (scripts/operacao/aquecer.ts): o próprio servidor pergunta as perguntas frequentes para guardar as respostas. Essas chamadas trazem um token
 * gerado a cada publicação e não entram nas métricas públicas de uso nem gastam a cota; sem o token certo, o pedido é tratado como qualquer outro.
 */
function ehAquecimento(request: Request) {
  const esperado = process.env.SINDI_AQUECIMENTO_TOKEN ?? ''; const recebido = request.headers.get('x-sindi-aquecimento') ?? '';
  return esperado.length >= 32 && recebido.length === esperado.length && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
}

/** Origem, tipo, tamanho e formato do pedido do chat (papéis `system` e sequências inválidas são recusados pelo schema), mais a marca de aquecimento. */
export async function lerRequisicaoDoChat(request: Request): Promise<{ mensagens: MensagemDoChat[]; aquecimento: boolean } | { resposta: Response }> {
  // 40 mensagens de até 1.500 caracteres (usuário) e 4.000 (assistente) cabem com folga em 200 KB. O limite por minuto protege a busca e o provedor
  // de rajadas; a cota diária continua sendo o teto. `SINDI_CHAT_POR_MINUTO` ajusta (0 desliga, para avaliações locais).
  // Valor inválido vale o padrão (não desliga o limite em silêncio); só "0" desliga.
  const porMinuto = process.env.SINDI_CHAT_POR_MINUTO === '0' ? 0 : inteiro(process.env.SINDI_CHAT_POR_MINUTO, 12, 1, 1000);
  const guarda = await guardaDeEscrita(request, { nome: 'chat', limiteBytes: 200_000, ...(porMinuto > 0 && !ehAquecimento(request) ? { limitePorMinuto: porMinuto } : {}), textos: { grande: 'Conversa muito longa.', invalido: 'Mensagem inválida.' } });
  if ('resposta' in guarda) return guarda;
  const parsed = chatSchema.safeParse(guarda.json);
  if (!parsed.success) return { resposta: erroJson('Revise a mensagem e tente novamente.', 400) };
  return { mensagens: parsed.data.messages, aquecimento: ehAquecimento(request) };
}
