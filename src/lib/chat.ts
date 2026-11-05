import { z } from 'zod';
export { historicoParaOModelo, recentMessages } from './chat-historico';
export const chatSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(60000) })).min(1),
}).superRefine(({ messages }, ctx) => {
  if (messages[0].role !== 'user' || messages.at(-1)?.role !== 'user') ctx.addIssue({ code: 'custom', message: 'Invalid sequence' });
  messages.forEach((m, i) => {
    if (m.role !== (i % 2 ? 'assistant' : 'user') || (m.role === 'user' && m.content.length > 1500)) ctx.addIssue({ code: 'custom', message: 'Invalid message' });
  });
});
