# SINDI — Pesquisa: tecnologias e tendências por ferramenta

> Pesquisa feita em 2026-10-13 com buscas na web. Para cada ferramenta do projeto: **o que as big techs e a comunidade fazem hoje**, **o que isso muda para a SINDI**.
> **Honestidade sobre as fontes:** a maioria dos resultados são blogs e guias de terceiros, não documentação oficial. Números de benchmark vêm de quem os publicou e **precisam ser validados no corpus da SINDI**. Onde não achei fonte primária, está escrito. Afirmações sem fonte aparecem marcadas como *(minha avaliação)*.

---

## 1. Resumo das tendências

| Tendência | Quem pratica | Efeito para a SINDI |
|---|---|---|
| **Recuperação híbrida** (palavras + vetores + reranqueador) é o padrão | Anthropic, Supabase/Postgres, Weaviate, LlamaIndex | A SINDI já tem híbrido, mas sem reranqueador e com um embedding fraco |
| **Contextual Retrieval**: cada trecho recebe uma frase de contexto antes de indexar | Anthropic | Barato para um corpus de ~25 mil tokens; ataca o ponto mais fraco medido |
| **Avaliação contínua** com conjunto-ouro, métricas separadas de recuperação e geração | RAGAS, DeepEval, práticas de produção | A SINDI já tem a base (perguntas-ouro); falta métrica de fidelidade e de recuperação |
| **Guardrails fora do modelo** e dados recuperados tratados como dados | OWASP LLM Top 10 2025 | A SINDI já faz isto bem; falta tratar injeção indireta vinda de páginas coletadas |
| **RAG primeiro, fine-tuning só para comportamento** | Consenso de vários guias | Confirma a arquitetura atual |
| **Modelos pequenos multilíngues melhores** (Qwen3, Gemma 3/3n/4, Granite) | Alibaba, Google, IBM | O `qwen2.5:1.5b` é o elo mais fraco da escrita |
| **GraphRAG / RAG agêntico** para perguntas que cruzam documentos | Microsoft, AWS | Útil só mais tarde; custo alto para o tamanho do corpus |
| **Embeddings multilíngues abertos** (Qwen3-Embedding, BGE-M3, EmbeddingGemma) | Alibaba, BAAI, Google | Trocar `nomic-embed-text` por modelo melhor em português |
| **Next.js 16**: Turbopack padrão, `proxy.ts`, Cache Components | Vercel | O projeto já usa `proxy.ts` e Turbopack |
| **Túnel de saída + política de acesso** em vez de abrir porta | Cloudflare | Caminho para publicar com Ollama local sem expor a porta |

---

## 2. Por ferramenta

### 2.1 RAG (a técnica central da SINDI)

**O que se faz hoje**

- **Contextual Retrieval (Anthropic).** Um modelo escreve uma frase curta situando cada trecho no documento; essa frase é anexada ao trecho antes de gerar o embedding e o índice BM25. Segundo a Anthropic, a taxa de falha da recuperação (trecho certo fora dos 20 primeiros) cai de 5,7% para 3,7% só com embeddings contextuais (−35%), para 2,9% com BM25 contextual junto (−49%) e para cerca de 1,9% somando reranqueamento (−67%). A mesma fonte observa que, **se a base tem menos de ~200 mil tokens, a alternativa mais simples é colocar tudo no prompt**. [Anthropic](https://anthropic.com/news/contextual-retrieval) · [resumo](https://www.maginative.com/article/anthropics-contextual-retrieval-technique-enhances-rag-accuracy-by-67)
- **Chunking.** O consenso é que o *chunking* é a principal alavanca de qualidade, e que se combinam estratégias: divisão **por estrutura** (títulos, listas) com o **caminho de títulos anexado a cada trecho**; **parent-document** (busca em trechos pequenos, devolve o contexto maior); *late chunking* para textos em que o sentido cruza fronteiras; e **metadados** para filtro, citação e permissão. A métrica de ponta deixou de ser "achou o trecho certo?" e passou a ser "a resposta citou o trecho certo?". [Comparação de estratégias](https://www.glukhov.org/rag/retrieval/chunking-strategies-in-rag/) · [estudo arXiv 2504.19754](https://arxiv.org/pdf/2504.19754)
- **GraphRAG.** Constrói um grafo de entidades e relações no momento da indexação; ajuda em perguntas agregadas e que cruzam documentos. Fontes de fornecedores estimam custo de 3 a 5 vezes o do RAG simples (**não verificado**). Tendência: arquiteturas híbridas com agentes. [AWS](https://aws.amazon.com/what-is/graphrag/) · [Enterprise Knowledge](https://enterprise-knowledge.com/graphrag-in-the-enterprise/)

**Para a SINDI.** O corpus é pequeno e estruturado (seções curtas, FAQ, tabelas). Contextual Retrieval e chunking por estrutura com cabeçalhos anexados dão ganho sem infraestrutura nova. GraphRAG **não** compensa agora; um grafo leve (entidade → documento → vigência) pode ser feito em SQLite se surgir a necessidade.

### 2.2 Modelos de linguagem pequenos (Ollama + Qwen)

**O que se faz hoje**

- Guias de 2026 listam como opções abaixo de 10 bilhões de parâmetros: **Qwen3-8B** (32 mil de contexto, ~5,2 GB quantizado, Apache 2.0, 100+ idiomas segundo o fornecedor), **Gemma 3n E2B** (~3 GB, voltado a dispositivos), **Gemma 4 E4B**, **Granite 4.1 8B**, **Phi-4-mini**. Os rankings vêm de fornecedores e **não medem português nem fidelidade a fontes**; a própria fonte recomenda construir um conjunto de avaliação em português a partir dos seus documentos. [Guia SLM 2026](https://www.labellerr.com/blog/best-small-language-models-under-10b-parameters/) · [Lightweight models](https://blog.premai.io/best-lightweight-language-models-worth-running)
- **Saída estruturada (JSON Schema)** no Ollama via parâmetro `format` (desde dez/2024, Ollama ≥ 0.5). Confiabilidade varia por modelo. [Blog do Ollama](https://registry.ollama.ai/blog/structured-outputs)

**Para a SINDI.** Para a fidelidade, o modelo pesa menos que a recuperação e o prompt (a própria pesquisa diz isso). Ainda assim, 1,5 bilhão de parâmetros é o limite do que escreve bem. Candidatos a testar na máquina disponível: Qwen3 4B/8B, Gemma 3/4 de 4B. O código já trata `qwen3*`. A saída estruturada permite exigir `{resposta, fontes_usadas[]}` e validar as citações no servidor *(minha avaliação)*.

### 2.3 Embeddings (busca por significado)

**O que se faz hoje**

| Modelo | Notas (fontes de terceiros) |
|---|---|
| **Qwen3-Embedding** 0,6B / 4B / 8B | Apache 2.0, 100+ idiomas, contexto de 32 mil, dimensão ajustável; o 8B liderava o MTEB multilíngue em jun/2025. Disponível no Ollama. |
| **BGE-M3** (568M) | Multilíngue, contexto de 8 mil, suporta busca densa, esparsa e multivetor; opção "equilibrada" para auto-hospedagem. |
| **EmbeddingGemma** (~300M) | 768 dimensões (reduzíveis), contexto ~2 mil; recomendado no Ollama. Sem dado de português nas fontes. |
| **MTEB-BR** | Benchmark de 22 tarefas em português do Brasil, 93 modelos avaliados; o topo era dominado por modelos de API, com variantes Qwen3-Embedding entre os melhores abertos. Confirmar o placar ao vivo. |

[MTEB-BR](https://benchmarklist.com/benchmarks/mteb_br/) · [Qwen3-Embedding no Ollama](https://glukhov.org/de/rag/embeddings/qwen3-embedding-qwen3-reranker-on-ollama/) · [Modelos de embedding no Ollama](https://www.morphllm.com/ollama-embedding-models)

Cuidados práticos: o contexto efetivo é o `num_ctx` do Modelfile (confira com `ollama show`); `/api/embed` não aplica *template* de instrução, e cada modelo pede o seu prefixo.

**Para a SINDI.** O `nomic-embed-text` é majoritariamente inglês e a SINDI mede só 44% de acerto em 1º lugar nas paráfrases reserva. Trocar por **Qwen3-Embedding-0.6B/4B ou BGE-M3** e remedir é o experimento de maior retorno e menor custo.

### 2.4 Reranqueadores

**O que se faz hoje.** Segunda etapa: o recuperador traz 20–50 candidatos e um modelo *cross-encoder* reordena cada par (pergunta, trecho). É o último degrau do ganho da Anthropic (de −49% para −67% de falhas). Existem reranqueadores abertos da família Qwen3 e da BAAI, executáveis localmente. [Qwen3-Reranker no Ollama](https://glukhov.org/de/rag/embeddings/qwen3-embedding-qwen3-reranker-on-ollama/) · [Anthropic](https://anthropic.com/news/contextual-retrieval)

**Para a SINDI.** Hoje a fusão RRF decide sozinha. Um reranqueador sobre os 8–10 melhores candidatos corrige o tipo de erro "trecho certo em 2º ou 3º lugar", que é exatamente o que as medições mostram (top-1 44%, top-3 63%).

### 2.5 Busca lexical e banco (SQLite FTS5, Postgres/Supabase + pgvector)

**O que se faz hoje.** Busca híbrida **dentro do Postgres**: índice **HNSW** nos vetores, **GIN** no `tsvector`, e uma função que funde as duas listas por **RRF** (`1/(k+posição)`, k≈50–60, com pesos por ramo). [Padrão RRF](https://tessl.io/registry/g14wxz/hybrid-search-rrf-pattern) · [Migration do Supabase](https://git.gay/root/supabase.supabase/src/branch/master/supabase/migrations/20250714120000_hybrid_search.sql) *(terceiros; confirmar na documentação oficial do pgvector antes de adotar)*

**Para a SINDI.** O SQLite local já tem **FTS5 com `remove_diacritics`**, que implementa BM25 de verdade. O cérebro, porém, usa um pontuador próprio (prefixo de 6 letras, pesos fixos). Unificar tudo no **mesmo repositório** (SQLite com FTS5 + vetores, ou Postgres com pgvector se for à nuvem) elimina a duplicidade entre "espelho do site" e "cérebro" *(minha avaliação)*.

### 2.6 Avaliação (RAGAS, DeepEval, conjunto-ouro)

**O que se faz hoje.** Quatro métricas básicas: **fidelidade** (cada afirmação está no contexto), **relevância da resposta**, **precisão do contexto** e **recall do contexto** (este último pede resposta de referência). Diagnóstico: fidelidade baixa = alucinação; recall baixo = recuperador fraco. Boas práticas: avaliar **recuperação e geração separadamente**; usar conjunto-ouro **validado por especialista**; **fixar o modelo-juiz** e acompanhar tendência; **calibrar o juiz com humanos**; monitorar falhas de parse (JSON inválido vira NaN e some do agregado); rodar em CI. [Visão geral](https://futureagi.substack.com/p/rag-evaluation-metrics-a-technical) · [DeepEval/RAGAS/G-Eval](https://learn.traeai.com/t/ai-engineering/phases/05-nlp-foundations-to-advanced/27-llm-evaluation-frameworks)

**Para a SINDI.** As perguntas-ouro hoje verificam se a *evidência* contém o texto esperado, não se a *resposta final* está fiel. Isso mede a recuperação, não a geração. Faltam: recall@k e MRR por pergunta, fidelidade da resposta final e um conjunto de teste que não seja copiado para o cérebro.

### 2.7 Segurança de aplicações com LLM (OWASP, guardrails)

**O que se faz hoje.** O **OWASP LLM Top 10 2025** põe a injeção de prompt em 1º (LLM01), com forma **indireta** em RAG: instruções escondidas em documento recuperado. Mitigações: **controles fora do modelo**, tratar conteúdo recuperado como **dado, nunca comando**, filtrar entrada e saída, validar formato, não pôr segredos no prompt, **recuperação com controle de acesso** e registro das buscas. Listas de bloqueio ("ignore as instruções") são camada fraca. Vazamento do *system prompt* entrou como risco próprio. [OWASP 2025 (resumo)](https://dev.to/amasen/owasp-llm-top-10-what-every-engineer-building-with-ai-needs-to-know-in-2025-2gp8) · [Barracuda](https://blog.barracuda.com/2024/11/20/owasp-top-10-risks-large-language-models-2025-updates)

**Para a SINDI.** Já faz: papéis `system` barrados, origem validada, verificador de fatos fora do modelo, instrução de "documentos são dados". **Lacunas prováveis:** (a) o texto coletado do site, de notícias e de órgãos externos entra no prompt sem filtro de instruções; (b) o *system prompt* (regras do cérebro) pode ser pedido ao modelo pequeno; (c) não há teste automatizado de injeção. Tudo isto cabe em testes e filtros no servidor.

### 2.8 Fine-tuning × RAG

**O que se faz hoje.** Consenso: **RAG primeiro** para fatos e citações (atualiza reindexando, dá para auditar a fonte). **LoRA** para **comportamento, formato e tom**, com cerca de 500–1.000 exemplos de qualidade; não elimina alucinação e pode causar esquecimento. Produção costuma combinar os dois. [Guia 2026](https://idealogic.io/blog/fine-tuning-llm-guide) · [Estudo RAG × LoRA × DoRA (arXiv 2502.10497)](https://arxiv.org/pdf/2502.10497) *(só o início do estudo foi recuperado; ler antes de citar)*

**Para a SINDI.** Confirma o `cerebro/README.md`: fatos ficam em arquivos. Um LoRA só faz sentido depois de centenas de pares revisados (FAQ + perguntas-ouro + respostas ideais) e se o problema for tom/formato/recusa.

### 2.9 Next.js 16, React 19, Turbopack

**O que há de novo** (lançado em 21/10/2025): **Turbopack** como empacotador padrão (builds 2–5× mais rápidos, Fast Refresh até 10×); **`proxy.ts`** substitui o middleware; **Cache Components** (`"use cache"`, cache opt-in, PPR); **React Compiler** estável; React 19.2; Devtools MCP; novas APIs de cache (`updateTag`, `refresh`); `next lint` removido. [Anúncio oficial](https://nextjs.org/blog/next-16) · [InfoQ](https://www.infoq.com/news/2025/12/nextjs-16-release)

**Para a SINDI.** O projeto já usa `proxy.ts` e Turbopack. Oportunidades: ativar o React Compiler (menos código de memoização no chat) e usar `"use cache"` nas páginas de dados (`/painel`, `/uso`). O AGENTS.md exige ler o guia em `node_modules/next/dist/docs/` antes de mexer.

### 2.10 Vercel AI SDK (`ai`, `@ai-sdk/google`)

**Situação.** Nenhum arquivo do projeto importa esses pacotes: são resíduo da fase Gemini. O projeto fala com o Ollama por `fetch`, o que é correto e simples. *(Verificação feita por busca de imports em `src`, `scripts` e `tests`.)*

**Para a SINDI.** Remover as duas dependências reduz superfície de ataque e de auditoria. Se um dia houver provedor múltiplo ou chamada de ferramentas, o AI SDK volta a fazer sentido.

### 2.11 Ollama como servidor de inferência

**O que se faz hoje.** Saída estruturada por JSON Schema, chamada de ferramentas, `/api/embed` em lote, `keep_alive`. O projeto usa `keep_alive: 30m`, temperatura 0,2, `num_ctx: 8192`, fila de uma geração por vez. Para vários usuários simultâneos, a tendência é um servidor de inferência com **batching contínuo** (vLLM, llama.cpp server) *(minha avaliação; não pesquisado a fundo)*.

### 2.12 Cloudflare Tunnel e Access (publicação)

**O que se faz hoje.** O **Tunnel** cria conexão **só de saída** (sem porta aberta), e uma política **Access com Service Token** (cabeçalhos `CF-Access-Client-Id/Secret`) deixa só o servidor da SINDI chamar a API. A origem **também** deve recusar tráfego que não veio do túnel (ligar só em localhost ou validar o JWT do Access). [Docs do Tunnel](https://developers.cloudflare.com/tunnel/llms-full.txt)

**Para a SINDI.** O repositório já tem logs do `cloudflared`, e o `AGENTS.md` proíbe expor o Ollama diretamente. O desenho certo é: Vercel → Cloudflare Access (token de serviço) → túnel → um **proxy fino** que valida e só encaminha `/api/chat` e `/api/embed` ao Ollama. Hoje `OLLAMA_ACCESS_TOKEN` é enviado como `Bearer`, mas **o Ollama não o valida**; é preciso o proxy.

### 2.13 Upstash Redis, Supabase, SQLite

Sem pesquisa específica. Observação do código: SQLite via `node:sqlite` com WAL e FTS5 é adequado ao volume atual; Supabase está opcional; Upstash só para métricas na Vercel. Não há motivo, hoje, para adicionar serviços novos, em linha com o `AGENTS.md`.

---

## 3. Itens que **não** consegui confirmar

- Placar atual do MTEB-BR e posição exata do BGE-M3 nele.
- Desempenho de EmbeddingGemma em português.
- Qualquer benchmark de **fidelidade a fontes em português** para Qwen3, Gemma ou Granite. Só a avaliação interna resolve.
- Limites de lote e novidades recentes do Ollama (a busca devolveu tutoriais, não notas de versão).
- Conteúdo dos resultados do estudo arXiv 2502.10497 e do 2504.19754.
- Os números "3 a 5×" de custo do GraphRAG (opinião de fornecedor).

Recomendação: tratar esta pesquisa como **lista de hipóteses a testar** com o conjunto reserva da SINDI, não como verdade.
