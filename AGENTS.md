# Instruções do projeto

- Respeitar docs e Guia Operacional do usuário. Design/Figma/FigJam dispensados explicitamente.
- Next.js, TypeScript, Tailwind, shadcn/ui e Lucide. Não adicionar serviços sem necessidade.
- Nunca ler, imprimir ou versionar segredos reais. `.env.local` é privado.
- Chaves Gemini e Redis somente no servidor. Nunca usar NEXT_PUBLIC para segredos.
- Validar payload e origem; papéis system não podem vir do cliente.
- Sem cotas de mensagens da aplicação, conforme instrução explícita do usuário. Preservar validação de entrada e origem. Cotas do provedor continuam válidas. Métricas públicas só contêm agregados de tokens/requisições, sem mensagens, IPs ou credenciais.
- Sem logs de conteúdo, sem histórico persistente, sem envio de dados confidenciais.
- Não inventar conhecimento institucional, jurídico ou conteúdo de documentos.
- Executar lint, typecheck, testes, build e auditoria. Documentar limites de verificação.
- Não publicar sem funcionamento, permissões e segurança verificados.
- Não habilitar planos pagos ou faturamento sem autorização.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
- Provedor atual: Ollama local, sem chamadas a provedores externos. Modelos `sindi` (qwen2.5:3b, respostas com fatos) e `sindi-rapido` (qwen2.5:1.5b, só saudação, recusas e encaminhamentos), criados por `npm run modelo:criar`. Configuração só no servidor. Não expor Ollama diretamente à internet; a publicação usa túnel para a aplicação (scripts/operacao/publicar.ps1).
- O que ensina a SINDI fica em `cerebro/` (instrucoes, conectores, conhecimento). Mudança de busca, prompt ou modelo exige `npm run avaliar:treino` com leitura das respostas: o critério automático não vê fato trocado.
