# Instruções do projeto

- Respeitar docs e Guia Operacional do usuário. Design/Figma/FigJam dispensados explicitamente.
- Next.js, TypeScript, Tailwind, shadcn/ui e Lucide. Não adicionar serviços sem necessidade.
- Nunca ler, imprimir ou versionar segredos reais. `.env.local` é privado.
- Chaves dos provedores de IA (Gemini, Groq, OpenRouter, Mistral, Cloudflare, Anthropic) e do Redis somente no servidor. Nunca usar NEXT_PUBLIC para segredos. Agentes nunca leem `.env*.local` (hook em `.claude/hooks/bloquear-segredos.mjs`).
- Validar payload e origem; papéis system não podem vir do cliente.
- Cota de mensagens da aplicação (`src/lib/infra/cota.ts`): por IP e global, por dia, conforme instrução explícita do usuário (2026-11-19). A cota anterior foi removida só porque o modelo era local e de teste; com API gratuita ela protege os limites do provedor. Preservar validação de entrada e origem. Métricas públicas só contêm agregados de tokens/requisições, sem mensagens, IPs ou credenciais; o IP da cota só existe como hash.
- Sem logs de conteúdo, sem histórico persistente. Dados pessoais e segredos são removidos antes de ir ao modelo (`redigirDadosSensiveis`), mas nos níveis gratuitos (Google, Mistral, alguns modelos do OpenRouter) as perguntas podem ser usadas para melhorar os produtos deles: o usuário foi avisado e a tela pede para não enviar dados pessoais nem confidenciais (decisão do usuário em 23/11/2026: cascata com todos os gratuitos, com redação).
- Não inventar conhecimento institucional, jurídico ou conteúdo de documentos.
- Executar lint, typecheck, testes, build e auditoria. Documentar limites de verificação.
- Toda rota de API usa a guarda de `src/lib/http/guarda.ts` (origem, tipo, limite por minuto, tamanho do corpo, erro em JSON). Ferramentas novas seguem a receita de `docs/desenvolvimento/guia-do-desenvolvedor.md` e entram em `src/lib/ferramentas/registro.ts`; páginas novas entram em `src/lib/paginas.ts`.
- Depois de subir o servidor, a verificação funcional confere páginas, rotas, PDFs e ferramentas registradas. A lista completa de comandos fica só em `CLAUDE.md` (seção Comandos).
- Não publicar sem funcionamento, permissões e segurança verificados.
- Não habilitar planos pagos ou faturamento sem autorização.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
- Provedores: **cascata** de APIs gratuitas (`src/lib/ia/cascata.ts`, ordem em `SINDI_CASCATA`): Gemini → Groq → OpenRouter → Mistral → Cloudflare → (Anthropic, pago, só com `ANTHROPIC_API_KEY`) → Ollama local de emergência. Quem esgota o limite sai da frente em silêncio: o usuário nunca vê "limite/tokens"; tudo fora = mensagem neutra (503). Embeddings continuam no Gemini (`GEMINI_EMBED_MODEL`). Nada de plano pago ou faturamento sem autorização (o adaptador Anthropic existe, desligado; `/custos` estima o gasto). A publicação usa túnel + função de repasse assinada na Vercel (scripts/operacao/publicar.ps1, deployment/vercel-proxy).
- Cérebro em grafo: o comando de geração (em `CLAUDE.md`; também roda no fim de cada coleta) gera `.data/dados/grafo.json` (página `/cerebro`, expansão da busca do chat por lei/NR/projeto citados) e o cofre do Obsidian em `.data/obsidian/SINDI`. O grafo público só leva títulos, tipos e ligações.
- Equipe de agentes do Claude Code em `.claude/agents/` (arquiteto-ia, engenheiro-cerebro, engenheiro-ferramentas, guardiao-seguranca, avaliador-qualidade), orquestrada pela skill `/orquestrar`; skills `/ensinar-sindi` e `/nova-ferramenta`.
- O que ensina a SINDI fica em `cerebro/` (instrucoes, conectores, conhecimento). Mudança de busca, prompt ou modelo exige a avaliação de treino (`CLAUDE.md`) com leitura das respostas: o critério automático não vê fato trocado.
