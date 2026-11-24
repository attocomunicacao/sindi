import { z } from 'zod';
export { historicoParaOModelo, mensagensRecentes } from '@/lib/chat/historico';
export const chatSchema = z
  .object({
    // O histórico vem do navegador e pode ser forjado: as respostas do assistente têm teto (o modelo só lê as duas últimas trocas, encurtadas).
    messages: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(4000) }))
      .min(1)
      .max(40),
  })
  .superRefine(({ messages }, ctx) => {
    if (messages[0].role !== 'user' || messages.at(-1)?.role !== 'user')
      ctx.addIssue({ code: 'custom', message: 'Invalid sequence' });
    messages.forEach((m, i) => {
      if (m.role !== (i % 2 ? 'assistant' : 'user') || (m.role === 'user' && m.content.length > 1500))
        ctx.addIssue({ code: 'custom', message: 'Invalid message' });
    });
  });
