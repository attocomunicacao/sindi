# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

As regras do projeto (segurança, cota, privacidade, provedor, aviso sobre a versão do Next.js) estão em `AGENTS.md` e valem aqui integralmente:

@AGENTS.md

O guia vigente do código é `docs/desenvolvimento/guia-do-desenvolvedor.md` (mapa, receita de ferramenta nova, checklist de segurança, armadilhas). Docs em `docs/ia/16-*` e `21-*` são históricos (Ollama como modelo principal, sem cota); hoje a geração é uma cascata de APIs gratuitas com o Ollama só como emergência. Avaliação completa e prioridades em `docs/avaliacao/2026-11-avaliacao.md`.

**Equipe de agentes:** para mudanças que tocam mais de uma área, use a skill `/orquestrar` (subagentes em `.claude/agents/`). Mudança no que a SINDI sabe: `/ensinar-sindi`. Página/ferramenta nova: `/nova-ferramenta`. O Playwright MCP (`.mcp.json`) serve para ver `/cerebro` e `/custos` no navegador.

## Comandos

- `npm run dev` — um único `next dev` por pasta; `.env.local` só é lido na partida (reinicie ao mudar).
- `npm run lint` / `npm run typecheck` / `npm test` / `npm run build`; `npm run check` roda os quatro. Fechar com `npm audit --audit-level=high`.
- Um arquivo de teste: `npx tsx --test tests/orcamento-rotas.test.ts`. Um caso: acrescente `--test-name-pattern="trecho do nome"`.
- `npm run test:ci` — testes com cobertura mínima de 80% das linhas em `src/**` (é o que a CI exige).
- `npm run test:e2e` — build + Playwright (Chromium, desktop e celular) com axe; primeira vez: `npx playwright install chromium`. Um spec: `npx playwright test e2e/<arquivo>.spec.ts` (após `npm run build`).
- Com o servidor rodando: `npm run verificar:funcional` (páginas, rotas, PDFs, ferramentas do registro; `-- --chat` faz uma pergunta real) e `npm run avaliar:treino` (gasta os limites gratuitos: rode com `SINDI_COTA_IP_DIA=0 SINDI_COTA_GLOBAL_DIA=0 SINDI_CHAT_POR_MINUTO=0` e leia as respostas).
- `npm run grafo:gerar` — refaz o grafo do cérebro e o cofre do Obsidian (sem chamar API).
- `npm run cerebro:indexar` após mudar `cerebro/` (embeddings; usa `GEMINI_API_KEY`).
- Scripts em `scripts/` não carregam `.env.local`: `npx tsx --env-file=.env.local scripts/...`.
- CI (`.github/workflows`): lint, typecheck, `test:ci`, build, audit, e2e e Semgrep (`p/nextjs`, `p/typescript` em `src`).

## Arquitetura

RAG com verificação, não modelo treinado. Fluxo de uma pergunta em `src/app/api/chat/route.ts`, que só orquestra as etapas de `src/lib/chat/`:

`requisicao` (origem, formato, limite por minuto) → cota consultada sem consumir → `situacao` (decide por regras a situação e o conector/área, e busca as fontes) → `prompt` (monta o pedido) → `respostas` (memória de respostas, deduplicação de gerações em curso, cota) → `geracao` (o modelo escreve; a verificação de fatos reprova e-mail/site/telefone/valor/número/lei que não estejam nas fontes e manda reescrever) → `stream` (NDJSON para o navegador).

- **O servidor nunca escreve a resposta**: decide e busca; o modelo escreve; a verificação confere. Saída de ferramenta que vira fonte precisa conter no texto todo número que a resposta possa citar.
- **Prompt com prefixo estável**: regras (`cerebro/instrucoes/`) e exemplos vão sempre iguais e primeiro; orientação do conector, fontes e pergunta vão na última mensagem. Ao modelo vão só as duas últimas trocas, já com `redigirDadosSensiveis` aplicado.
- **Provedores em cascata** (`src/lib/ia/`): `cascata.ts` tenta cada provedor configurado (`provedores.ts`; Gemini nativo em `src/lib/gemini.ts`, os demais por um adaptador OpenAI-compatível em `openai-compat.ts`, Anthropic pela SDK oficial em `anthropic.ts`). `saude.ts` é o disjuntor + contadores de limite conhecidos; `vez.ts` o semáforo/fila. Falha antes do primeiro trecho troca em silêncio; falha no meio emite `reset`. Nível `rapido` só para situações roteirizadas e só se `GEMINI_MODEL_RAPIDO`/`SINDI_NIVEL_RAPIDO=1`.
- **Orquestra e grafo**: `src/lib/agentes/orquestrador.ts` acrescenta um especialista de apoio quando a pergunta cai entre duas áreas (só estantes; uma chamada de escrita). `src/lib/grafo/` constrói o grafo (`construir.ts`), extrai leis/NRs/projetos (`entidades.ts`), exporta o Obsidian e, em `consulta.ts`, devolve documentos ligados à entidade citada — candidatos que passam pela mesma régua de `cobertura` em `retrieve.ts`.
- **Fontes**: `cerebro/` em Markdown (relido em até 5 s; `cerebro/auto/` é gerado, não editar) com busca híbrida em `src/lib/cerebro/`; biblioteca de dados públicos coletados em SQLite (`node:sqlite`, `src/lib/dados/` + `src/lib/biblioteca/`, FTS5 por estante). Cada conector (`cerebro/conectores/*.md`) define gatilhos, estantes e "Como responder"; só o conector da pergunta vai ao modelo.
- **Ferramentas** (contrato em `src/lib/ferramentas/tipos.ts`, registro em `registro.ts`; o orçamento em `src/lib/orcamento/` é o exemplo): lógica pura + rotas com guarda + página registrada em `src/lib/paginas.ts` (com glifo em `GLIFOS` de `src/components/sindi-mark.tsx`, senão não compila) + opcional `chat.executar`. `tests/ferramentas.test.ts` confere o registro e o `env.example`.
- **Estado**: cota e métricas de uso (inclusive por provedor) em Redis (Upstash) se configurado; senão em memória / `.data/usage.json`. Limite por minuto, disjuntor dos provedores, memória de respostas e cache de vetores de consulta ficam só na memória do processo. CSP com nonce em `src/proxy.ts` (não cobre `/api`).
- **IP do visitante** (`ipDoPedido`, `src/lib/cota.ts`): repasse assinado da Vercel (`x-sindi-repasse` = `SINDI_REPASSE_SEGREDO`) → `SINDI_IP_HEADER` → `cf-connecting-ip` → cabeçalhos da Vercel. Nunca confie em `x-forwarded-for` sem a assinatura.

## Armadilhas

- Arquivo `'use client'` não pode importar, nem indiretamente, `node:*`, sqlite ou `zod`; código compartilhado fica em módulos puros (`chat-historico.ts`, `chat-stream.ts`, `url-segura.ts`, `paginas.ts`, `dados/frescor.ts`).
- `route.ts` só exporta métodos HTTP e configuração (`runtime`, `maxDuration`, `dynamic`). Pastas `_` em `src/app` são privadas.
- `pdf-parse` toma posse do buffer; passe uma cópia se for reaproveitar.
- Testes: `node:test` via `tsx`. Interface (`*.test.tsx`) importa `./setup-dom` primeiro. Rede/Gemini se simulam trocando `globalThis.fetch` (restaure no `finally`); coletores usam `tests/rede-simulada.ts` (`simularRede`, `comBanco`). Rota/entrada nova ganha caso hostil em `tests/ataques*.test.ts*`; página nova entra em `PAGINAS` de `e2e/ajuda.ts`.
- Comentários em português, explicando o porquê.
