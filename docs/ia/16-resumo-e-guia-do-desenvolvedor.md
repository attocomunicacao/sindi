# SINDI — Resumo e guia do desenvolvedor

> **Atualizado por `21-fluxo-e-modelo-reduzido.md`:** o caminho da pergunta (seção 3), os modelos e a estrutura de `cerebro/` e `scripts/` descritos abaixo mudaram em 13/10/2026. Use este guia para as receitas e as armadilhas; para o fluxo atual, o documento 21.
> Documento de entrada para quem vai mexer no código. Baseado na leitura do repositório em 2026-10-13.
> **Limite da leitura:** o núcleo (chat, Ollama, cérebro, busca, verificação, proxy, coleta SQLite, publicação do cérebro) foi lido por inteiro. `src/lib/dados/painel.ts`, `src/lib/dados/sindicato.ts`, `src/lib/orcamento/*`, `src/components/*`, os coletores e `scripts/*` foram lidos só por nome, tamanho e pela documentação. Onde isso importa, o texto avisa.

---

## 1. Resumo em um minuto

**SINDI** é a assistente virtual (IA) do **SINDEPRESTEM**, sindicato das empresas de terceirização e trabalho temporário do Estado de São Paulo. O público principal são as **empresas associadas e filiadas**.

Ela **não é um modelo treinado com fatos do sindicato**. É um sistema de **RAG** (geração aumentada por recuperação) com várias camadas de proteção, em volta de um modelo pequeno que roda localmente no Ollama:

1. Responde **sem modelo** quando a resposta é exata (FAQ aprovado, contatos, tabelas, listas, indicadores, orçamento).
2. Quando precisa do modelo, **busca trechos** na base (cérebro em Markdown + páginas coletadas do site + fontes externas) e manda ao modelo só aquilo.
3. **Verifica** a resposta (e-mail, site, telefone, valor em R$ e número de lei precisam constar nas fontes) e troca por uma resposta segura se houver invenção.
4. Mede só **agregados** de uso (requisições, tokens), nunca conteúdo.

| Item | Valor atual |
|---|---|
| Front/back | Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript, Tailwind 4, shadcn/ui, Lucide |
| Modelo de texto | Ollama local, `qwen2.5:3b` (`OLLAMA_MODEL`) |
| Modelo de busca por significado | `nomic-embed-text` via Ollama (`OLLAMA_EMBED_MODEL`) |
| Base de conhecimento | `cerebro/*.md` + SQLite local (`.data/dados`) + espelho do site (Supabase opcional ou `.data/knowledge/current.json`) |
| Métricas | `.data/usage.json` local; Upstash Redis na Vercel |
| Persistência de conversas | **Nenhuma** (nova conversa apaga só na aba) |
| Cotas de mensagens da aplicação | **Nenhuma**, por decisão explícita do usuário |

---

## 2. Páginas e APIs

| Rota | O que faz |
|---|---|
| `/` | Chat (somente texto, português) com indicadores do painel |
| `/uso` | Painel público de consumo, 7 ou 30 dias |
| `/painel` | Indicadores e dados públicos coletados |
| `/orcamento` | Calculadora de custo de postos terceirizados, com PDF |
| `/base` | Estado da base documental |
| `POST /api/chat` | Chat. JSON, ou NDJSON se `Accept: application/x-ndjson` |
| `/api/usage`, `/api/painel`, `/api/knowledge` | Dados de apoio |
| `/api/orcamento/{calcular,catalogo,pdf}` | Orçamento |

---

## 3. Caminho de uma pergunta (`src/app/api/chat/route.ts`)

```
Navegador ── POST /api/chat ─────────────────────────────────────────────────┐
  1. allowedChatOrigin()  (Origin == Host, ou SINDI_PUBLIC_ORIGIN em https)    │
  2. Content-Type JSON, corpo ≤ 1 MB, chatSchema (zod): papéis só user/assistant│
  3. institutionalAnswer()  ← RESPOSTAS SEM MODELO, em ordem:                  │
       orçamento → FAQ literal (só pt) → indicadores → posicionamento →        │
       dados do sindicato → NR → leis → fontes externas → tabela de             │
       contribuição → contato/endereço/CEP                                     │
  4. saudação  → texto fixo                                                    │
  5. retrieveKnowledge()  (limite 6,5 s), em paralelo:                         │
       a) páginas "fixadas" do site (TOPICS: regex → página oficial)           │
       b) cérebro: busca híbrida (palavras + embeddings, fusão RRF)            │
       c) fontes externas (se EXTERNAL_INTENT)                                 │
       d) busca geral no espelho do site (Supabase RPC ou JSON local, 3,2 s)   │
  6. sourceChoices() → até 3 trechos; sufficientEvidence()     │
  7. legalReferral() (demissão, multa…) → encaminha ao Jurídico, sem modelo    │
  8. sem evidência → foraDoEscopo() / semFonteSemChute() → recusa gentil       │
  9. ollamaChat() (fila: 1 geração por vez por processo)                       │
       system = instructions() + regras do cérebro + evidências                │
 10. verificarFatos() → se reprovar, respostaSegura()                          │
 11. sourceReferences() acrescenta links; recordUsage() grava agregados        │
<───────────── resposta (JSON ou NDJSON: delta… done | error) ────────────────┘
```

Pontos que surpreendem quem chega:

- A busca usa **apenas a última mensagem do usuário**. O histórico vai ao modelo, mas não entra na recuperação.
- Todo trecho do cérebro sai marcado `pinned: true`. Isso faz `sufficientEvidence()` devolver `true` assim que o cérebro tem qualquer acerto, e faz a rota descartar passagens não fixadas.
- `recentMessages()` envia só as **últimas 7 mensagens**, cada uma cortada em 1.500 caracteres. O README diz "histórico completo sem corte": está desatualizado em relação ao código.
- `language === 'pt'` é condição para o FAQ literal. Perguntas em inglês nunca recebem resposta direta do FAQ.

---

## 4. Mapa do repositório

```
cerebro/                  base de conhecimento em Markdown (ver §6)
  00-…11-*.md             curados (identidade, setor, diretoria, ferramentas, glossário, FAQ, limites)
  auto/*.md               GERADOS por npm run cerebro:gerar — não editar
  avaliacao/              perguntas-ouro e paráfrases (testes do cérebro)
src/app/                  páginas, rotas /api, CSS
src/proxy.ts              CSP com nonce + strict-dynamic (substitui middleware no Next 16)
src/lib/chat.ts           schema zod, prompt-base (instructions), recentMessages
src/lib/ollama.ts         cliente Ollama: fila, streaming NDJSON, contagem de tokens
src/lib/origin.ts         validação de Origin
src/lib/usage.ts          métricas agregadas (arquivo local ou Upstash)
src/lib/cerebro/          carregar (parser + chunking), buscar (léxico + híbrido + FAQ),
                          embeddings (índice JSON + cosseno), gerar (auto/*.md),
                          publicar (publica com rollback), avaliar (perguntas-ouro)
src/lib/knowledge/        espelho do site: core (chunks, termos), retrieve (orquestração),
                          grounded (verificador, recusas), extract, supabase, status
src/lib/dados/            coletores (IBGE, BCB, Câmara, Senado, TST, WEC, MTE, CAGED,
                          Constituição, regimentos, SINDEPRESTEM), db.ts (SQLite + FTS5),
                          painel.ts (respostas diretas e indicadores), sync.ts, xlsx.ts
src/lib/orcamento/        cálculo, encargos, tabela de referência, PDF, interpretador de pedido
src/lib/quota.ts          RESÍDUO do Gemini (mensagem de cota) — candidato a remoção
supabase/migrations/      esquema da base documental
scripts/                  sync, cerebro:*, benchmark, start-*.ps1 (Windows)
tests/                    13 arquivos, node:test via tsx
docs/                     briefing, PRD, publicação, dados, segurança, verificação
.data/                    DADOS LOCAIS (usage, SQLite, vetores, logs, relatórios). Não versionar.
.data/security-source/    cópia antiga do código usada nas varreduras. Não é a fonte atual.
.tools/zap/               OWASP ZAP local
```

---

## 5. Como rodar

```bash
npm ci
ollama pull qwen2.5:3b
ollama pull nomic-embed-text      # só se quiser busca por significado
npm run dev                       # http://localhost:3000
```

| Comando | Para quê |
|---|---|
| `npm run lint` / `typecheck` / `test` / `build` | Verificações do CI |
| `npm audit --audit-level=high` | Auditoria de dependências |
| `npm run dados:sync` / `dados:watch` | Coleta de dados públicos (uma vez / contínua) |
| `npm run knowledge:sync` / `knowledge:watch` | Espelho do site SINDEPRESTEM |
| `npm run cerebro:gerar` | Recria `cerebro/auto/*.md` |
| `npm run cerebro:avaliar [-- --modelo]` | Perguntas de ouro (com ou sem a resposta do modelo) |
| `npm run cerebro:indexar` | Recalcula embeddings (incremental) |
| `npm run cerebro:comparar -- --arquivo=parafrases-reserva.md` | Palavras × significado × híbrida |
| `npx tsx scripts/modelo/benchmark-ollama.ts qwen2.5:3b` | Benchmark do modelo |
| `powershell -File scripts/dados/start-dados.ps1` | Coleta contínua no Windows |

### Variáveis de ambiente (nunca versionar valores reais; `.env.local` é privado)

| Variável | Uso |
|---|---|
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_EMBED_MODEL` | Ollama (padrões: `127.0.0.1:11434`, `qwen2.5:3b`, `nomic-embed-text`) |
| `OLLAMA_ACCESS_TOKEN` | Enviado como `Bearer`; só faz sentido atrás de um proxy que valide |
| `SINDI_PUBLIC_ORIGIN` | Origem https pública permitida atrás de proxy reverso |
| `SINDI_CEREBRO_DIR`, `SINDI_DATA_DIR` | Pastas do cérebro e dos dados |
| `SINDI_RESPOSTA_LIVRE=1` | Desliga a recusa "sem fonte, sem chute" |
| `SINDI_PESO_LEXICAL`, `SINDI_PESO_SEMANTICO`, `SINDI_LIMIAR_SEMANTICO` | Ajuste da busca híbrida (limiar padrão 0,55) |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Base documental (a secret só no coletor) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Métricas persistentes na Vercel |

---

## 6. O cérebro (`cerebro/`)

**Formato.** Cada `.md` começa com cabeçalho simples (`titulo`, `fonte`, `atualizado`, `tipo`, `prioridade` 0,5–3, `direta`, `semantica`, `gatilhos`). Cada `## Seção` vira um **trecho** de até ~1.700 caracteres (seções longas quebram por parágrafo). O título da seção pesa 4 na busca por palavras, os gatilhos 3, o texto 1; o resultado é multiplicado pela prioridade.

**Tipos de arquivo.**

| Tipo | Edita? | Observação |
|---|---|---|
| Curado (`00`–`11`) | Sim | `conhecimento/faq.md` tem `direta: sim`: pergunta equivalente → resposta literal, sem modelo |
| `auto/*.md` | **Não** | Regenerado a partir dos dados coletados |
| `avaliacao/*` | Sim | Testes. `parafrases-reserva.md` deve ficar **intocado** (é o conjunto honesto) |

**Publicação segura do `auto/`** (`publicar.ts`): valida tamanho mínimo de cada arquivo → só segue se algo mudou → avalia antes → grava → avalia depois → se alguma pergunta de ouro que passava passou a falhar, **restaura `auto.anterior/`**.

**Regra de manutenção.** Quando a SINDI errar: (1) corrija o fato num arquivo curado ou acrescente pergunta ao FAQ com `Variações:`; (2) acrescente a pergunta em `avaliacao/perguntas-ouro.md` com `espera:`; (3) rode `npm run cerebro:avaliar`.

Tamanho atual: ≈ 93 mil caracteres (≈ 25 mil tokens), dos quais ≈ 29 mil curados e ≈ 64 mil autogerados.

---

## 7. Receitas

**Adicionar uma resposta aprovada (a mais comum).** Edite `cerebro/conhecimento/faq.md`:

```md
## Como a pergunta aparece para o usuário?
Variações: forma 2 | forma 3 | forma 4
Resposta completa, com a fonte: [Página](https://www.sindeprestem.com.br/...).
```

A resposta direta só dispara se ≥ 80% das palavras úteis da pergunta do usuário estão no título ou numa variação, e ≥ 50% das palavras do título casam. Depois: `npm run cerebro:avaliar`.

**Adicionar um tema novo ao cérebro.** Crie `cerebro/NN-tema.md` com cabeçalho, uma ideia por `##`, título escrito como o usuário pergunta, fonte oficial no cabeçalho. Rode `npm run cerebro:indexar`.

**Adicionar uma resposta direta de código** (dado estruturado, fórmula): acrescente uma função em `src/lib/dados/painel.ts` (ou módulo próprio) e chame-a na cadeia de `institutionalAnswer()` em `src/lib/knowledge/retrieve.ts`. Atenção: a ordem da cadeia define a prioridade, e as intenções são regex.

**Adicionar uma fonte externa.** Novo coletor em `src/lib/dados/collectors/`, registro no `sync.ts`, documentação em `docs/ia/14-dados-publicos.md`, e (se virar resposta direta) regra em `painel.ts`. Respeitar `robots.txt`.

**Trocar o modelo.** Defina `OLLAMA_MODEL`. `qwen3*` é tratado (`/no_think`, resposta bufferizada). Rode `cerebro:avaliar -- --modelo` e `scripts/modelo/benchmark-ollama.ts` antes de adotar.

**Trocar o modelo de embeddings.** Defina `OLLAMA_EMBED_MODEL` e rode `cerebro:indexar`. O índice é invalidado automaticamente quando o nome do modelo muda. Confira se o modelo exige prefixos de tarefa (a função `embeddings()` hoje aplica os do nomic).

---

## 8. Regras do projeto (do `AGENTS.md`) que o código precisa respeitar

- Segredos só no servidor; nada de `NEXT_PUBLIC` para chaves; `.env.local` nunca é lido, impresso ou versionado.
- Validar payload e origem; papéis `system` nunca vêm do cliente.
- **Sem cotas de mensagens da aplicação** (decisão do usuário). Cotas do provedor continuam valendo.
- Métricas públicas = agregados de tokens e requisições. **Sem mensagens, IPs ou credenciais.**
- **Sem log de conteúdo**, sem histórico persistente, sem envio de dados confidenciais.
- Não inventar conhecimento institucional, jurídico ou conteúdo de documentos.
- Não adicionar serviços sem necessidade; não habilitar planos pagos sem autorização.
- Antes de publicar: lint, typecheck, testes, build, auditoria, e funcionamento, permissões e segurança verificados.
- **Next.js 16 tem mudanças de API.** Leia o guia em `node_modules/next/dist/docs/` antes de escrever código de framework.

---

## 9. Estilo de código

- Nomes de domínio em português (`trechosDoCerebro`, `respostaSegura`); termos técnicos de biblioteca em inglês.
- Funções pequenas e puras, comentário JSDoc dizendo o **porquê**, muitas vezes em linhas longas. Siga o estilo do arquivo que estiver editando.
- Todo comportamento novo de busca ou resposta ganha teste em `tests/` e, se for erro de resposta, uma pergunta de ouro.
- Regex de intenção sempre sobre texto `normalize()`d (sem acento, minúsculo).

---

## 10. Armadilhas conhecidas

1. **Documentação desencontrada:** README (histórico completo) × `recentMessages` (7 mensagens); `docs/seguranca/security-requirements.md` ainda cita Gemini, limites atômicos e testes com Redis real.
2. **Código morto do Gemini:** `src/lib/quota.ts` e os pacotes `ai` e `@ai-sdk/google` não são importados por nenhum arquivo em `src`, `scripts` ou `tests`.
3. **Duas bases paralelas:** espelho do site (chunks fixos de 1.200 caracteres, busca por termos) e cérebro (trechos por seção, busca híbrida). Só o cérebro tem embeddings.
4. **Regex de roteamento** em `retrieve.ts` (`TOPICS`) e `painel.ts`: pergunta nova que "cai" no regex errado recebe resposta direta errada, sem passar pelo modelo.
5. **Fila única** por processo em `ollama.ts`: várias pessoas simultâneas esperam em fila (timeout operacional de 4 minutos).
6. **Verificador de fatos limitado:** não pega erro sem número ou endereço (nome, definição de sigla, afirmação de benefício).
7. **PDFs escaneados** (3 cartilhas e 3 jurídicos) sem texto: sem OCR, só link.
8. **Windows-first:** scripts `.ps1`/`.vbs`, `.7z` extraído com `tar` do Windows, `curl`. Linux/CI exigem ajuste.
9. **`.data/` guarda logs e relatórios de varredura**; confira o `.gitignore` antes de qualquer versionamento (a pasta não é um repositório git hoje).

---

## 11. Checklist antes de mexer

- [ ] Li `cerebro/README.md` e este guia.
- [ ] A mudança afeta busca, resposta ou prompt? Então há pergunta de ouro nova ou ajustada.
- [ ] Rodei `npm run lint && npm run typecheck && npm test`.
- [ ] Rodei `npm run cerebro:avaliar` (e `-- --modelo` se mexi em prompt ou modelo).
- [ ] Nada de segredo, conteúdo de conversa ou IP em log, teste ou documento.
- [ ] Documentação atualizada (`README.md`, `docs/`, `cerebro/README.md`).
