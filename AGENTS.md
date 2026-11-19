# Instruções do projeto

- Respeitar docs e Guia Operacional do usuário. Design/Figma/FigJam dispensados explicitamente.
- Next.js, TypeScript, Tailwind, shadcn/ui e Lucide. Não adicionar serviços sem necessidade.
- Nunca ler, imprimir ou versionar segredos reais. `.env.local` é privado.
- Chaves Gemini e Redis somente no servidor. Nunca usar NEXT_PUBLIC para segredos.
- Validar payload e origem; papéis system não podem vir do cliente.
- Cota de mensagens da aplicação (`src/lib/cota.ts`): por IP e global, por dia, conforme instrução explícita do usuário (2026-11-19). A cota anterior foi removida só porque o modelo era local e de teste; com API gratuita ela protege os limites do provedor. Preservar validação de entrada e origem. Métricas públicas só contêm agregados de tokens/requisições, sem mensagens, IPs ou credenciais; o IP da cota só existe como hash.
- Sem logs de conteúdo, sem histórico persistente. Dados pessoais e segredos são removidos antes de ir ao modelo (`redigirDadosSensiveis`), mas no nível gratuito do Gemini o Google pode usar as perguntas para melhorar seus produtos: o usuário foi avisado e a tela pede para não enviar dados pessoais nem confidenciais.
- Não inventar conhecimento institucional, jurídico ou conteúdo de documentos.
- Executar lint, typecheck, testes, build e auditoria. Documentar limites de verificação.
- Toda rota de API usa a guarda de `src/lib/http/guarda.ts` (origem, tipo, limite por minuto, tamanho do corpo, erro em JSON). Ferramentas novas seguem a receita de `docs/desenvolvimento/guia-do-desenvolvedor.md` e entram em `src/lib/ferramentas/registro.ts`; páginas novas entram em `src/lib/paginas.ts`.
- Depois de subir o servidor, `npm run verificar:funcional` confere páginas, rotas, PDFs e ferramentas registradas.
- Não publicar sem funcionamento, permissões e segurança verificados.
- Não habilitar planos pagos ou faturamento sem autorização.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
- Provedor atual: API do Gemini no nível gratuito (`src/lib/gemini.ts`, por `fetch`, sem SDK), com `GEMINI_MODEL`, `GEMINI_MODEL_RAPIDO` e `GEMINI_EMBED_MODEL`. Nada de plano pago ou faturamento sem autorização. Configuração só no servidor; a publicação usa túnel para a aplicação (scripts/operacao/publicar.ps1).
- O que ensina a SINDI fica em `cerebro/` (instrucoes, conectores, conhecimento). Mudança de busca, prompt ou modelo exige `npm run avaliar:treino` com leitura das respostas: o critério automático não vê fato trocado.
