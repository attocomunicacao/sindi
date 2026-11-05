# SINDI — Fluxo de resposta e modelo reduzido

> Escrito em 13/10/2026, depois da leitura completa do código e de medições feitas no computador do projeto (Intel i7-1255U, 10 núcleos / 12 threads,
> 15,7 GB de RAM, **sem placa de vídeo dedicada**: o modelo roda só no processador). Substitui o "caminho de uma pergunta" de `16-resumo-e-guia-do-desenvolvedor.md`.
> Pesquisa de mercado feita na mesma data; onde a fonte é de terceiros ou não foi reverificada, está dito.

## 1. O pedido e o resultado, em uma página

**Pedido:** reduzir o modelo para rodar neste computador com menos consumo, "ensiná-lo" com a biblioteca e com as instruções da comunicação, e ter respostas ágeis
para dúvidas simples que estão na biblioteca.

**O que foi feito**

| Frente | Antes | Agora |
|---|---|---|
| Modelo | `qwen2.5:3b` para tudo | Dois modelos locais, escolhidos por tipo de pedido: `sindi-rapido` (1,5 bilhão de parâmetros) e `sindi` (3 bilhões) |
| Janela de contexto | 8.192 tokens | 4.096 tokens |
| Texto lido a cada pergunta | regras + regras do cérebro + até 2.600 caracteres de fontes (≈ 1.900 tokens) | regras e exemplos fixos (lidos do cache) + orientação da área + até 1.200 caracteres de fontes |
| Fontes por resposta | até 3 | até 2 (configurável) |
| Tamanho da resposta | "até 90 palavras", sem teto | limite por área (50 a 110 palavras) com teto de tokens |
| Processador | todas as threads | núcleos lógicos menos 4 (8 de 12 neste computador) |
| Busca | cérebro + espelho do site (arquivo de 41 MB lido a cada pergunta, ou chamada de rede) | cérebro + biblioteca local em SQLite, pelas estantes do conector (menos de 0,5 s) |
| Uso da biblioteca | títulos de notícias e artigos; texto só para NR, artigos de lei, cláusulas | texto das 4.022 notícias, 26 artigos, cartilhas e projetos de lei, com data |
| Instruções | um texto único para qualquer pergunta | 7 conectores (um por área do documento da comunicação), só o da pergunta vai ao modelo |
| Mesma pergunta de novo | gerada de novo | sai da memória (só RAM), se regras, fontes e modelo forem os mesmos |
| Verificação | e-mail, site, telefone, R$, número de lei | idem + qualquer número (percentual, decimal, 3+ dígitos) fora das fontes |

**O que a medição mostrou sobre "reduzir o modelo" (seção 4):** o modelo de 1,5 bilhão é 2 vezes mais rápido e usa metade da memória, mas, mesmo com regras,
exemplos e fontes melhores, **troca e inventa fatos** em perguntas com conteúdo (disse que o sindicato patronal defende "direitos dos trabalhadores", trocou
"associada" por "filiada" e inventou providências jurídicas sobre a estabilidade da gestante). Por isso ele ficou só com o que é curto e roteirizado (saudação, recusa, encaminhamento), e o de 3 bilhões
continua escrevendo as respostas com fatos, agora dentro de um fluxo que lê e escreve menos. Para usar só o modelo pequeno basta uma variável (`OLLAMA_MODEL=sindi-rapido`),
sabendo desse risco.

## 2. O que as grandes empresas de IA fazem, e o que foi adotado

| Prática | Quem documenta | Na SINDI |
|---|---|---|
| **Engenharia de contexto**: enviar ao modelo o menor conjunto de tokens de alto sinal | Anthropic (Agent Skills e guias de contexto) | Regras-base curtas; orientação só da área da pergunta; até 2 fontes; histórico de 2 trocas |
| **Divulgação progressiva** (*skills*): o modelo recebe primeiro só nome e descrição de cada habilidade e carrega o resto quando precisa. Publicado como padrão aberto e adotado por OpenAI, Google, GitHub e Cursor, segundo comentaristas | Anthropic, "Equipping agents for the real world with Agent Skills" | `cerebro/conectores/*.md`: um arquivo por área, com gatilhos, estantes e "Como responder". A escolha é por regra (sem modelo), porque o modelo local é pequeno |
| **Conectores** entre o assistente e as fontes de dados (MCP e conectores de produto) | Anthropic (Model Context Protocol), OpenAI, Google | Cada conector aponta para estantes da biblioteca local; não há serviço externo |
| **Roteamento por intenção e por complexidade**: pergunta simples não vai ao modelo mais caro | Prática corrente em guias de RAG de produção (terceiros) | `sindi-rapido` para saudação, recusas e encaminhamentos; `sindi` para o resto |
| **Recuperação híbrida** (palavras + significado) com filtro por metadados | Anthropic (Contextual Retrieval), guias de produção | Cérebro: híbrida já existente. Biblioteca: FTS5/BM25 por estante, termos pesados pela raridade, título como âncora, preferência por texto recente |
| **Cache de prefixo do prompt**: o que não muda vem primeiro e é reaproveitado | Anthropic e OpenAI (prompt caching); no Ollama, reuso automático do prefixo igual | Regras e exemplos sempre idênticos e no início; o que muda (orientação, fontes, pergunta) vai na última mensagem |
| **Cache de respostas** com chave que inclui versão do prompt e do modelo; cache por semelhança é arriscado | Guias de produção (terceiros) | Só correspondência exata (resumo criptográfico de modelo + regras + pedido), só em memória, 6 horas |
| **Guardrails fora do modelo** e conteúdo recuperado tratado como dado | OWASP LLM Top 10 (2025) | Já existia; ampliado com a verificação de números e com os indicadores entregues como frases prontas |
| **Avaliação separada de recuperação e de geração**, com conjunto validado por especialista | RAGAS, DeepEval, guias de produção | `cerebro/avaliacao/treino-v1.md` (perguntas da comunicação) mede resposta final, área e tempo; os conjuntos anteriores medem a evidência |
| **RAG para fatos; ajuste fino só para comportamento** | Consenso de guias | Mantido. Sem placa de vídeo, ajuste fino não é viável neste computador |

Fontes consultadas em 13/10/2026: [Agent Skills (Anthropic)](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) ·
[Agent Skills: progressive disclosure (SwirlAI)](https://www.newsletter.swirlai.com/p/agent-skills-progressive-disclosure) ·
[Is Progressive Disclosure All You Need? (arXiv 2607.17598)](https://arxiv.org/pdf/2607.17598), que lembra que a economia de tokens da técnica foi adotada antes de ser medida com controle de acurácia ·
[RAG in production in 2026 (dev.to)](https://dev.to/ai_builder/rag-in-production-in-2026-beyond-naive-chunk-and-embed-3803) ·
[Production RAG guide 2026](https://jobsbyculture.com/blog/production-rag-guide-2026) · [RAG guardrails (Meilisearch)](https://www.meilisearch.com/blog/rag-guardrails) ·
[Prompt caching no Ollama (Leanpub)](https://leanpub.com/read/ollama/prompt-caching) · [Best CPU-only local LLMs in 2026](https://www.popularai.org/p/best-cpu-only-local-llm-2026) ·
[Testing local LLMs without GPU (It's FOSS)](https://itsfoss.com/testing-local-llms-without-gpu) · [Ollama embedding models (Morph)](https://www.morphllm.com/ollama-embedding-models) ·
e a pesquisa anterior em `17-pesquisa-tecnologias-e-tendencias.md`. Com exceção do texto da Anthropic, são fontes de terceiros; nenhuma mede português nem fidelidade a
fontes, e por isso a escolha de modelo foi feita por medição própria.

## 3. O fluxo

```
                                   ┌────────────── cerebro/instrucoes ──────────────┐
                                   │ regras-base + exemplos (iguais em toda conversa │
                                   │ → lidos uma vez, depois vêm do cache do Ollama) │
                                   └───────────────────────┬─────────────────────────┘
pergunta                                                   │
   │                                                       ▼
   ├─1─ PROTEGER (regras, sem modelo)        dados pessoais removidos · caso jurídico · saudação · fora do escopo
   │
   ├─2─ ROTEAR (palavras-gatilho)            conector da área ──► instrução "Como responder", estantes, limite de palavras
   │                                         cerebro/conectores/01…07
   ├─3─ RECUPERAR (local, < 0,5 s)
   │      a) cálculo do orçamento
   │      b) relatório: indicadores + publicações + projetos           (quando o conector reconhece o pedido)
   │      c) atuação da entidade: notícias, artigos e cartilhas         ("o que o Sindeprestem está fazendo sobre…")
   │      d) documento citado: NR-n, artigo, cláusula, indicador, posição, lista
   │      e) cérebro (palavras + significado)  +  biblioteca nas estantes do conector  → até 2 fontes, por cobertura dos termos
   │
   ├─4─ ESCREVER (Ollama local)              sindi-rapido: saudação, recusa, encaminhamento · sindi: respostas com fatos
   │      mensagem = ORIENTAÇÃO da área + limite de palavras + FONTES + PERGUNTA      teto de tokens · 8 threads · contexto 4.096
   │
   ├─5─ VERIFICAR (regras, sem modelo)       e-mail · site · telefone · R$ · lei · números → fora das fontes: reescreve (até 2 vezes)
   │
   └─6─ RESPONDER                            texto + referências (links das fontes usadas) · métricas só agregadas · resposta guardada em RAM
```

### Onde está cada etapa no código

| Etapa | Arquivo |
|---|---|
| Proteger | `src/lib/knowledge/grounded.ts` (`contemDadosSensiveis`, `casoJuridicoIndividual`, `foraDoEscopo`, `lacunaConhecida`) |
| Rotear | `src/lib/cerebro/conectores.ts` (`escolherConector`, `pedeRelatorio`) |
| Recuperar | `src/lib/knowledge/retrieve.ts` (ordem), `src/lib/biblioteca/pesquisa.ts` (biblioteca e relatório), `src/lib/cerebro/buscar.ts` (cérebro), `src/lib/dados/painel.ts` (documentos e indicadores) |
| Escrever | `src/lib/cerebro/instrucoes.ts` (regras, exemplos, mensagem), `src/lib/ollama.ts` (modelos e parâmetros), `src/app/api/chat/route.ts` (orquestração) |
| Verificar | `src/lib/knowledge/grounded.ts` (`verificarFatos`) |
| Responder | `src/app/api/chat/route.ts`, `src/lib/cache-respostas.ts`, `src/lib/usage.ts` |

## 4. Escolha do modelo: medições

### 4.1 Velocidade bruta (mesmo prompt de 350 tokens, contexto de 4.096)

| Modelo | Memória | Leitura | Escrita | Observação |
|---|---:|---:|---:|---|
| `qwen2.5:0.5b` | 0,5 GB | 247 tokens/s | 44 tokens/s | Resposta incompleta (omitiu a prorrogação de 90 dias) |
| `qwen2.5:1.5b` | 1,2 GB | 123–137 tokens/s | 20 tokens/s | Resposta correta em pergunta de um fato |
| `qwen2.5:3b` | 2,2 GB | 60–82 tokens/s | 10 tokens/s | Resposta correta |

Threads com o 1,5B: 2 → 77 tokens/s de leitura; 4 → 86; 6 → 102; **8 → 123**; 10 → 133. Oito threads custam 7% de velocidade e deixam o computador utilizável;
é o padrão (núcleos lógicos menos 4). Comando: `npm run modelo:medir -- sindi sindi-rapido`.

### 4.2 Fidelidade com o fluxo novo (leitura manual das respostas)

Rodada 1, **só o modelo de 1,5B**, 37 perguntas de `treino-v1.md` com critério automático: 32 de 37 dentro do critério, mediana de 15,2 s, 1ª palavra em 5,6 s.
O critério automático (trechos esperados) não viu o que a leitura mostrou:

| Pergunta | O que o 1,5B escreveu | O que as fontes dizem |
|---|---|---|
| O que é o Sindeprestem e quais empresas ele representa? | "…defendendo direitos dos trabalhadores, combater precarização…" | Sindicato patronal: representa empresas |
| Quais benefícios o Sindeprestem oferece aos associados? | "cursos e eventos sem custo para empresas filiadas" | Sem custo para **associadas**; filiadas participam **com custo** |
| O que mudou na estabilidade gestante…? | Lista de providências ("revisar contratos", "informar os trabalhadores", "monitoramento") | O artigo não traz providências; a orientação era encaminhar ao Jurídico |
| Compare os indicadores de emprego… | "Saldo de emprego formal — Brasil: fechou 2.438" | O número é do trabalho temporário, não do Brasil |
| Mercado de trabalho temporário em São Paulo | "[Novo CAGED] está em discussão" | Frase sem sentido, copiada da regra sobre projetos de lei |

Reforçar as regras ("monte a resposta com as frases das fontes", "não troque a quem cada fato se refere") e usar temperatura 0 **não corrigiu** esses erros.
O 3B, com as mesmas fontes e regras, respondeu corretamente a essas perguntas, com um deslize ("filiada tem acesso… com custo menor"). É o mesmo resultado do
teste de 13/10 registrado em `20-sintese-e-biblioteca.md`: o 1,5B inventa quando precisa escrever em vez de copiar.

Também medido: com um exemplo de resposta sobre o prazo do trabalho temporário, o 1,5B repetiu "Lei 6.019/1974" e "180 dias" numa resposta sobre estabilidade da
gestante. Os exemplos passaram a conter só os contatos oficiais.

### 4.3 Decisão

| Tipo de pedido | Modelo | Por quê |
|---|---|---|
| Saudação, fora do escopo, sem fonte, dados pessoais, encaminhamento jurídico | `sindi-rapido` (1,5B) | O servidor já decidiu o que dizer; o modelo só redige duas frases |
| Perguntas sobre a própria SINDI (limites, confiabilidade, dados pessoais) | `sindi` (3B) | Testado com o 1,5B: 7 de 10; chegou a escrever "como a SINDI é um sindicato patronal, nós fornecemos…" |
| Tudo o que tem fato: legislação, relatórios, sindicato, comercial, RH, custos | `sindi` (3B) | É o menor modelo instalado que não trocou fatos na medição |
| Reescrita depois de reprovação na verificação | `sindi` (3B) | — |

Resultado com esse roteamento: seção 5.

**Alternativas não testadas** (exigem baixar modelos, o que não foi feito sem autorização): `qwen3:1.7b`, `gemma3n:e2b`, `granite4` (3B) e modelos afinados para RAG
como o LFM2-1.2B-RAG. Nenhuma fonte encontrada mede fidelidade em português; o caminho é `ollama pull <modelo>`, `npm run modelo:criar -- --rapido=<modelo>` e
`npm run avaliar:treino`, lendo as respostas. Um modelo de embeddings multilíngue (`embeddinggemma`, `bge-m3`, `qwen3-embedding:0.6b`) continua sendo a troca
recomendada para a busca por significado (item 2.2 do plano em `18-diagnostico-e-plano-de-melhoria.md`).

## 5. Resultado medido do fluxo atual

Medição de 13/10/2026 contra o servidor de produção local (`npm run avaliar:treino -- --base=http://127.0.0.1:3100`), 48 perguntas de `treino-v1.md`, uma por
vez, sem histórico. Nesta rodada as perguntas sobre a própria SINDI ainda iam ao modelo rápido (por isso os tempos menores daquela linha); depois dela passaram
ao principal, e uma conferência de 8 perguntas confirmou as respostas e os tempos da última linha.

| Tipo de pergunta | Tempo total | 1ª palavra | Leitura das respostas |
|---|---:|---:|---|
| Um indicador ("quantos empregos formais…", "trabalho temporário em São Paulo") | 12–15 s | 3–4 s | Corretas, com período e fonte |
| Legislação, sindicato, custos (2 fontes da biblioteca) | 17–33 s | 7–15 s | Fiéis às fontes, com data; "benefícios" e "o que é o Sindeprestem" corretos |
| Comercial e RH (roteiros) | 25–40 s | 14–16 s | Segue o roteiro escrito pela equipe; na proposta, acrescentou "início imediato", que não estava na fonte |
| Relatórios e resumos (indicadores + publicações + projetos) | 32–60 s | 1–25 s | Números copiados corretamente; texto seco, em lista. É o tipo mais lento |
| Sobre a própria SINDI, com o modelo rápido (rodada) | 6–10 s | 3–4 s | 7 de 10; três respostas ruins, uma delas grave |
| Sobre a própria SINDI, com o modelo principal (conferência) | 15–18 s | 7–9 s | 3 de 3 corretas nas que tinham falhado |
| Saudação, fora do escopo, caso jurídico (modelo rápido) | 3–10 s | 1–8 s | Adequadas; a recusa fora do escopo nem sempre diz o que a SINDI faz |
| Mesma pergunta repetida | 0,4–0,9 s | — | Idêntica à primeira (memória de respostas) |

Total da rodada: mediana de **22,3 s**, 90% das respostas em até 44,9 s, máxima de 60,8 s; 1ª palavra em **10,2 s** (mediana). Critério automático: 42 de 48.
Nenhuma resposta foi reprovada pela verificação de fatos (0 reescritas).

**Leitura honesta.** Para dúvidas de um fato a SINDI responde em 12 a 15 segundos e o texto começa a aparecer em 3 a 4. Respostas que precisam ler duas fontes ficam
entre 17 e 33 segundos; relatórios passam de 30. Isso é melhor que a faixa anterior medida no mesmo computador (10 a 70 s, `20-sintese-e-biblioteca.md`), mas não é
instantâneo: o limite é o processador sem placa de vídeo escrevendo cerca de 10 tokens por segundo com o modelo de 3 bilhões. As três alavancas que restam são:
um modelo pequeno melhor que o `qwen2.5:1.5b` (a testar), respostas ainda mais curtas (`palavras:` nos conectores) e uma máquina com placa de vídeo.

A rodada só com o modelo de 1,5B (seção 4.2) deu mediana de 15,2 s e 1ª palavra em 5,6 s: é o que se ganha em velocidade, e o que se perde está na tabela da 4.2.

## 6. Consumo do computador

| Item | Valor | Ajuste |
|---|---|---|
| Memória com os dois modelos e o de busca carregados | ≈ 2,2 GB + 1,2 GB + 0,4 GB (antes: um modelo de 3B com contexto de 8.192) | `SINDI_MODELO_RAPIDO=` (vazio) usa só o `sindi`; `OLLAMA_MODEL=sindi-rapido` usa só o rápido |
| Tempo que os modelos ficam na memória sem uso | 20 minutos | `SINDI_KEEP_ALIVE` (ex.: `5m`) |
| Threads durante a resposta | 8 de 12 | `SINDI_NUM_THREAD` |
| Janela de contexto | 4.096 tokens | `SINDI_NUM_CTX` |
| Fontes por resposta | 2 | `SINDI_MAX_FONTES` |
| Processo de coleta contínua (tarefa agendada `SINDI-Knowledge`) | espelho antigo do site; o chat não depende mais dele quando a coleta em SQLite existe | pode ser desativado no Agendador de Tarefas, se o sindicato não usar o Supabase |

Uma resposta é gerada por vez (fila no servidor). Enquanto a SINDI escreve, o processador trabalha perto do máximo nas 8 threads; fora disso, o consumo é o de
manter os modelos na memória.

## 7. Limites que continuam

1. **Sem placa de vídeo, resposta com fato leva segundos, não décimos.** O que o usuário vê é a primeira palavra em poucos segundos e o texto aparecendo.
2. **A verificação não pega fato certo no lugar errado** (um número verdadeiro atribuído a outro indicador) nem afirmação sem número. O 3B erra menos, não zero.
3. **Conectores escolhidos por palavra**: uma pergunta com vocabulário inesperado cai sem conector (regras gerais) ou no conector vizinho. Corrige-se nos `gatilhos:`.
4. **Notícia antiga**: a busca prefere os últimos três anos e sempre diz a data; se só houver texto antigo, ele é usado com a data.
5. **Série histórica curta**: o CAGED guardado tem 3 meses; "últimos 12 meses" recebe o que existe e o aviso de que não há mais.
6. **Respostas de referência novas** (`revisao: pendente`) aguardam validação do sindicato (lista em `22-conectores-e-treinamento.md`).
7. **Perguntas em inglês**: as regras mandam responder em português; a busca por palavras é fraca em inglês.

## 8. Teste de modelos pequenos mais novos (14/10/2026)

Baixados com autorização e medidos neste computador, no mesmo fluxo da SINDI (regras, conectores, fontes), com as 10 perguntas mais difíceis.

| Modelo | Memória | Leitura | Escrita | Tempo por resposta | Fidelidade (leitura manual) |
|---|---:|---:|---:|---:|---|
| `LiquidAI/lfm2.5-1.2b-instruct` | 0,73 GB | 158–231 tok/s | 18–19 tok/s | 5–26 s | **Ruim.** Respondeu "Sim, posso orientar" a "você pode garantir uma interpretação?"; deu o número do mês anterior como atual; disse que a demanda por temporários "aumentou" quando o saldo fechou vagas; respostas vagas |
| `hf.co/LiquidAI/LFM2-1.2B-RAG-GGUF:Q4_K_M` | 0,73 GB | 109–275 tok/s | 20–21 tok/s | 9–36 s | **Média.** Acertou prazo, piso e NR-1; inventou um "aumento de 11.866 vagas" (barrado pela verificação) e interpretou o saldo de São Paulo com conclusões sem fonte ("pressão competitiva", "taxas salariais mais baixas") |
| `qwen3.5:2b-q4_K_M` | 1,95 GB | 59–150 tok/s | 8–12 tok/s | 12–40 s | **Média.** Disse que o sindicato "não oferece serviços diretos às empresas"; não achou o número do CAGED que estava na fonte; "fale diretamente comigo no Setor Jurídico". **Não foi mais rápido que o 3B** |
| `sindi` (qwen2.5:3b, atual) | 1,93 GB | 60–80 tok/s | ~10 tok/s | 12–40 s | **Boa** (seção 5) |

**Conclusão:** nenhum modelo menor disponível hoje é ao mesmo tempo mais rápido e tão fiel às fontes quanto o atual neste computador. Os LFM são de fato ~2x mais
rápidos, mas trocam e interpretam fatos. O `sindi` (3B) continua o modelo principal. Os modelos baixados ficam instalados para novos testes
(`npm run modelo:criar -- --base=<modelo>` e `npm run avaliar:treino`).

## 9. Respostas prontas para as perguntas frequentes e respostas mais curtas (14/10/2026)

Como nenhum modelo menor foi fiel o bastante (seção 8), o ganho de velocidade veio de duas mudanças:

1. **Aquecimento.** Ao publicar, `scripts/operacao/aquecer.ts` pergunta ao próprio servidor, uma por vez, as sugestões da tela inicial e as perguntas de
   `cerebro/avaliacao/treino-v1.md`. Cada resposta (escrita pelo modelo e aprovada pela verificação) fica na memória de respostas por **24 horas**
   (`SINDI_CACHE_HORAS`). Quem fizer a mesma pergunta como primeira da conversa recebe a resposta em menos de 1 segundo. Essas chamadas levam um token gerado a
   cada publicação e **não entram nas métricas públicas** de `/uso`. A memória é só RAM: reiniciar o servidor apaga, e a próxima publicação prepara de novo.
   A resposta pronta só vale enquanto regras, exemplos, fontes e modelo forem os mesmos (eles fazem parte da chave).
2. **Respostas mais curtas.** Limites de palavras: legislação, sindicato e "sobre a SINDI" 55; inteligência setorial 70 (relatórios 80); custos 80;
   comercial e RH 90; recusas e saudações 40. Menos texto para escrever, uns 3 a 5 segundos a menos por resposta nova.

Perguntas novas, que não estão nessa lista, continuam no tempo da seção 5 (um pouco menor com as respostas mais curtas).
