# SINDI — Diagnóstico e plano de melhoria

> Foco pedido: **(1) a SINDI como centro neural do sistema**, **(2) como o cérebro funciona e como melhorar as respostas**, **(3) organização da informação como uma biblioteca**.
> Base: leitura do código em 2026-10-13 + `docs/ia/17-pesquisa-tecnologias-e-tendencias.md`.
> **Limites desta análise:** não executei o sistema, os testes nem a avaliação; os números de qualidade vêm do próprio `cerebro/README.md` (44% de acerto em 1º lugar e 63% entre os 3 primeiros, nas 16 paráfrases reserva). Não li por inteiro `painel.ts`, `sindicato.ts`, `orcamento/*` e os coletores. Recomendações marcadas *(hipótese)* precisam ser medidas antes de adotadas.

---

## 1. Veredito em cinco linhas

1. A arquitetura está **certa**: RAG, respostas diretas sem modelo, verificador de fatos fora do modelo, rollback do cérebro. É melhor que a maioria dos chatbots de sindicato ou empresa.
2. O **elo mais fraco é a recuperação**, não a geração: o trecho certo só é o 1º em 44% dos casos. Se o trecho certo não chega ao modelo, nenhum prompt conserta.
3. O segundo elo fraco é o **modelo de 1,5 bi de parâmetros**, que só consegue copiar bem e inventa ao resumir.
4. A informação está **organizada em arquivos, não em uma biblioteca**: não há identificador estável, vigência, dono, nível de confiança nem catálogo. Isso limita a qualidade, a auditoria e o crescimento.
5. A avaliação mede a **evidência**, não a **resposta final**, e o conjunto reserva é pequeno (16 perguntas).

---

## 2. Como o cérebro funciona hoje (e onde ele falha)

### 2.1 Fluxo de decisão

```
pergunta
  ├─ [A] resposta direta, SEM modelo ........ orçamento · FAQ literal · indicadores · sindicato · NR · leis · externas · contribuição · contato
  ├─ [B] saudação / encaminhamento jurídico / fora do escopo / sem fonte ... texto fixo
  └─ [C] RAG + modelo ....................... busca → 2–3 trechos → qwen2.5:1.5b → verificarFatos() → referências
```

Pontos fortes:

- Tudo o que tem resposta exata sai **literal** (zero alucinação por construção).
- **Sem fonte, sem chute** (`semFonteSemChute`), com recusa gentil e contato oficial.
- `verificarFatos` bloqueia e-mail, site, telefone, valor em R$ e número de lei inventados.
- Publicação do `auto/` com **avaliação antes e depois e rollback** automático.
- Cabeçalhos, FAQ com `Variações:` e perguntas-ouro: a disciplina "todo erro vira teste" já existe.

### 2.2 Diagnóstico por etapa

| # | Achado | Evidência no código ou docs | Impacto | Gravidade |
|---|---|---|---|---|
| D1 | **Recuperação ignora o histórico.** A busca usa só a última mensagem. "E o da noite?" ou "e para empresa filiada?" perdem o assunto. | `route.ts`: `question = messages.at(-1).content` → `retrieveKnowledge(question)` | Respostas "sem fonte" em conversas naturais | **Alta** |
| D2 | **Embedding fraco para português.** `nomic-embed-text` é predominantemente inglês. | `embeddings.ts`; README: top-1 de 44% (híbrida) e 38% (só significado) no conjunto reserva | Principal causa de trecho errado | **Alta** |
| D3 | **Sem reranqueador.** A ordem final vem de RRF puro; o trecho certo muitas vezes está em 2º ou 3º (top-3 = 63%). | `buscar.ts` `buscarHibrido` | Perde-se acerto que já estava a um passo | **Alta** |
| D4 | **Trechos sem contexto.** O vetor usa `secao + texto` limitado a 700 caracteres; o trecho não diz de qual convenção, categoria ou ano é. | `embeddings.ts` `textoParaVetor` | Confunde "piso da Portaria 2025" com "piso do Bombeiro 2025" | **Alta** |
| D5 | **Todo trecho do cérebro vira `pinned`.** Isso força `sufficientEvidence = true` e descarta o resto assim que o cérebro acerta qualquer coisa, mesmo um acerto fraco. | `buscar.ts` `passagensDoCerebro`, `core.ts`, `route.ts` linha de `choices` | Evidência ruim passa por boa; o modelo recebe lixo "fixado" | **Alta** |
| D6 | **Roteamento por regex.** `TOPICS` e as regras de `painel.ts` decidem resposta direta por palavra-chave; o primeiro regex que casar vence. | `retrieve.ts` `institutionalAnswer` | Pergunta nova cai no ramo errado e recebe resposta literal errada, sem o modelo para corrigir | **Média-alta** *(painel.ts não lido por inteiro)* |
| D7 | **Duas bases paralelas** (espelho do site em chunks fixos de 1.200 caracteres × cérebro por seção). Só o cérebro tem vetor; o espelho usa contagem de termos. | `core.ts` `chunks`, `searchSnapshot` | Dois comportamentos, duas manutenções, relevância incomparável | **Média-alta** |
| D8 | **Modelo pequeno demais para escrever.** Resumir e explicar com 1,5 bi gera afirmações sem número que o verificador não vê. | `cerebro/README.md` (limite reconhecido) | Erro de conteúdo passa pela verificação | **Alta** |
| D9 | **Verificador cobre só padrões numéricos e de endereço.** Nome de pessoa, sigla, "o sindicato oferece X" passam. | `grounded.ts` `verificarFatos` | Alucinação "plausível" | **Média-alta** |
| D10 | **FAQ literal só em português** e só se a pergunta cobre ≥ 80% das palavras. | `retrieve.ts`: `language === 'pt' ? respostaDireta(...)` | Inglês e perguntas reformuladas caem no RAG | **Média** |
| D11 | **Avaliação mede evidência, não resposta.** Verifica se o texto esperado está na evidência; `--modelo` existe, mas é opcional e por substring. | `avaliar.ts` | Regressões de prompt ou modelo passam despercebidas | **Média-alta** |
| D12 | **Conjunto reserva pequeno** (16) e o conjunto antigo está "contaminado" (91–96%). | `cerebro/README.md` | Não dá para distinguir melhoria real de acaso | **Média** |
| D13 | **Sem metadados de vigência e dono.** `atualizado` é a data de geração do arquivo, não a vigência do fato. | Cabeçalho do cérebro | Convenção vencida pode ser citada como atual | **Alta** para o setor (convenções têm data-base) |
| D14 | **Chunks de `auto/` misturam coisas diferentes** (listas de links, trechos literais de cláusulas, notícias) com a mesma prioridade 3. | `cerebro/auto/convencoes.md`, `artigos-e-noticias.md` | Notícia antiga disputa com cláusula | **Média** |
| D15 | **Injeção indireta não tratada.** Texto de site, notícia e órgãos externos entra no prompt sem filtro; só há a frase "documentos são dados". | `core.ts` `contextText`, `chat.ts` `instructions` | Risco OWASP LLM01 | **Média** |
| D16 | **PDFs escaneados sem texto** (3 cartilhas, 3 jurídicos). | `docs/ia/14-dados-publicos.md` | Lacuna de conhecimento conhecida | **Baixa-média** |
| D17 | **Resíduos e docs desatualizados** (Gemini, `quota.ts`, README × código, `docs/seguranca/security-requirements.md`). | grep de imports; README | Confunde novos desenvolvedores e a auditoria | **Baixa** |
| D18 | **Fila única de geração.** Um usuário lento bloqueia os demais (timeout de 4 min). | `ollama.ts` | Experiência com mais de um usuário simultâneo | **Média** *(sem cotas por decisão do usuário; é questão de capacidade, não de política)* |

---

## 3. A SINDI como centro neural: o desenho-alvo

O sistema todo converge para **uma única camada de inteligência**. Em vez de vários caminhos (regex, cérebro, espelho, painel), um fluxo com **fases explícitas**, cada uma medida:

```
         ┌────────────────────────── BIBLIOTECA (fonte única da verdade) ──────────────────────────┐
         │  documentos → seções → fatos      metadados: id · tipo · vigência · dono · confiança      │
         │  índice léxico (FTS5/BM25)  +  índice vetorial  +  catálogo navegável                    │
         └───────────────▲───────────────────────────────────────────────────────▲──────────────────┘
                         │ indexação (contexto por trecho, versão, hash)          │ consulta
pergunta ─► 1 ENTENDER ─► 2 ROTEAR ─► 3 RECUPERAR ─► 4 RERANQUEAR ─► 5 DECIDIR ─► 6 RESPONDER ─► 7 VERIFICAR ─► resposta + fontes
          reescrever com   intenção    híbrido +      cross-encoder   direta /      modelo com    afirmação a
          histórico        (modelo     filtros por    nos top 8–10    RAG /         JSON {texto,  afirmação nas
          + idioma         pequeno ou  tipo/vigência                  recusa /      fontes[]}     fontes citadas
                           exemplos)                                  encaminha
                         └───────────────────── 8 AVALIAR continuamente (CI) ◄───────────────────┘
```

Princípios:

- **Fatos vivem na biblioteca, nunca nos pesos do modelo.** O modelo escreve; a biblioteca sabe.
- **Toda afirmação carrega a origem** (id da seção) e a **vigência**.
- **Tudo é medido por fase**: recall@k na recuperação, fidelidade na geração.
- **A recusa é uma resposta válida e medida**, não um erro.

---

## 4. A biblioteca de informações

### 4.1 O que falta hoje

Hoje há "arquivos com cabeçalho". Uma biblioteca precisa de:

| Capacidade | Hoje | Alvo |
|---|---|---|
| Identificador estável por documento e seção | Derivado de arquivo + título + hash do início (quebra ao renomear) | `id` imutável (`CCT-PORTARIA-2025-2026#clausula-3`) |
| Tipo de fonte | Só `curado` / `autogerado` | Taxonomia (ver 4.2) |
| **Vigência** do fato | Ausente | `vigente_de`, `vigente_ate`, `substitui`, `substituido_por` |
| Dono e revisão | Ausente | `responsavel`, `revisado_em`, `revisar_ate` |
| Confiança | Só `prioridade` numérica | `confianca`: `oficial` · `institucional` · `terceiros` · `noticia` |
| Procedência | `fonte` (uma URL) | `fonte_url`, `coletado_em`, `hash_do_original` |
| Catálogo navegável | Não existe | `cerebro/CATALOGO.md` gerado + página `/base` |
| Público | Implícito | `publico`: `empresa` / `geral` (para respeitar escopo) |
| Lacunas conhecidas | Só na documentação | Registro de "o que a SINDI não sabe" |

### 4.2 Taxonomia sugerida

```
biblioteca/
  institucional/     quem é o sindicato, diretoria, missão, contatos, horário
  associacao/        associada × filiada, benefícios, como se associar
  contribuicoes/     modalidades, tabelas por faixa, vencimentos, formas de pagamento
  convencoes/        uma pasta por categoria → um arquivo por vigência (CCT 2025/2026 …)
                     cada cláusula-chave vira seção própria (salário, jornada, benefícios, data-base)
  juridico/          6.019/74, 13.429/17, ADIs, pareceres, encaminhamentos
  normas/            NRs, Constituição, regimentos (já coletados)
  setor/             conceitos de terceirização e trabalho temporário (explicação geral, marcada como tal)
  ferramentas/       orçamento, painel, chat e seus limites
  glossario/         siglas e termos
  faq/               perguntas aprovadas com variações (resposta literal)
  noticias/          fora do caminho dos fatos: usadas só para "últimas notícias"
  avaliacao/         perguntas-ouro, reserva, adversariais
```

Regra de ouro: **separar "fato vigente" de "notícia"**. Notícia antiga não pode competir com cláusula (D14).

### 4.3 Esquema de cabeçalho proposto (compatível com o parser atual)

```yaml
---
id: CCT-PORTARIA-2025-2026
titulo: Convenção Coletiva — Portaria — 2025/2026
tipo: convencao            # institucional | convencao | juridico | norma | faq | setor | glossario | noticia
confianca: oficial         # oficial | institucional | terceiros | noticia
fonte: https://www.sindeprestem.com.br/...
coletado_em: 2026-10-13
vigente_de: 2025-01-01
vigente_ate: 2025-12-31    # vazio = vigente
substitui: CCT-PORTARIA-2024-2025
responsavel: Setor Jurídico
revisar_ate: 2026-12-31
publico: empresa
gatilhos: portaria, porteiro, piso, data-base
---
```

O parser atual (`lerCabecalho`) ignora chaves que não conhece, então a migração pode ser **gradual**, sem quebrar nada. Depois, `carregar.ts` passa a expor esses campos em `Trecho`, e a busca passa a **filtrar e ordenar** por eles.

### 4.4 Estrutura de cada seção (a "ficha" que o modelo recebe)

Cada trecho entra no vetor e no prompt com um **cabeçalho de contexto** gerado:

```
[Convenção Coletiva — Portaria — 2025/2026 · Cláusula 3 · Salário normativo · vigente até 31/12/2025 · oficial]
CLÁUSULA TERCEIRA — SALÁRIO NORMATIVO …
```

Isto é o **Contextual Retrieval** na prática (frase de contexto anexada antes de indexar). Com corpus pequeno, pode ser **determinístico** (montado dos metadados, sem modelo) e gratuito; opcionalmente reforçado por uma frase gerada por modelo.

### 4.5 Ciclo de vida do conhecimento

```
coletar → normalizar → dividir por estrutura → anexar contexto → indexar (léxico + vetor)
      → avaliar (perguntas-ouro) → publicar com rollback → monitorar vencimento (revisar_ate)
```

- **Alerta de vigência:** relatório diário de documentos com `vigente_ate` passado ou `revisar_ate` vencido.
- **Substituição explícita:** nova convenção marca a anterior como `substituido_por`; a busca prefere a vigente e só devolve a antiga se a pergunta citar o ano.
- **Lacunas:** a avaliação lista perguntas "sem evidência" como backlog de conteúdo (ver §6, regra de privacidade).

---

## 5. Plano de melhoria priorizado

Esforço: P = horas, M = dias, G = semanas. Ganho: esperado, **a medir**.

### Fase 1 — Medir antes de mexer (P–M) · pré-requisito

| Ação | Por quê |
|---|---|
| **1.1** Ampliar o conjunto reserva de 16 para **100–150 perguntas** reais (paráfrases, erros de digitação, perguntas curtas, follow-ups, inglês, adversariais). Revisadas por quem conhece o sindicato. | D12. Sem isto, nada abaixo é demonstrável. |
| **1.2** Acrescentar métricas por pergunta: **recall@3/@5, MRR**, e se a **resposta final** contém o fato esperado e cita a fonte. Rodar em CI. | D11 |
| **1.3** Criar o conjunto **adversarial** (injeção em documento, pedido de ignorar regras, pedido de vazar o prompt, pergunta jurídica individual, pergunta fora do escopo). | D15 |
| **1.4** Registrar o **estado atual** como linha de base (top-1/3/5, fidelidade, taxa de recusa correta, latência p50/p95). | Comparar depois |

### Fase 2 — Recuperação (o maior retorno) (M)

| Ação | Mitiga | Esforço | Ganho esperado *(hipótese)* |
|---|---|---|---|
| **2.1** **Reescrita da pergunta com histórico** (modelo pequeno ou regra: junta as últimas 2 mensagens quando a pergunta é curta ou tem pronome) antes de buscar | D1 | P–M | Alto em conversas |
| **2.2** Trocar o embedding por **Qwen3-Embedding-0.6B/4B ou BGE-M3**, reindexar e medir no conjunto reserva (ajustar prefixos de tarefa em `embeddings()`) | D2 | P | Alto |
| **2.3** **Contexto anexado a cada trecho** (§4.4) no vetor e no índice léxico; vetor com 700 → ~1.200 caracteres | D4 | M | Alto |
| **2.4** **Reranqueador** sobre os 8–10 melhores (Qwen3-Reranker ou equivalente local) | D3 | M | Médio-alto |
| **2.5** **Remover `pinned: true` automático** do cérebro; usar limiar de relevância (similaridade e/ou pontuação mínima) em `sufficientEvidence` | D5 | P | Médio (menos falso "suficiente") |
| **2.6** Trocar o pontuador léxico próprio por **FTS5/BM25** (já existe no SQLite) com `remove_diacritics` | D7 | M | Médio |
| **2.7** **Filtros por metadado** (tipo, vigência, categoria) antes da fusão | D13, D14 | M | Alto para convenções |

> Alternativa a considerar: o corpus inteiro tem ~25 mil tokens. A fonte da Anthropic diz que, abaixo de ~200 mil tokens, **pôr tudo no prompt** dispensa RAG. **Não serve aqui**, porque o contexto configurado é 8.192 tokens e o modelo é pequeno; mas serve para **o modelo de avaliação** ou um modelo maior no futuro.

### Fase 3 — Biblioteca (M–G)

| Ação | Mitiga |
|---|---|
| **3.1** Migrar cabeçalhos para o esquema da §4.3 (gradual; `lerCabecalho` já tolera chaves novas) | D13 |
| **3.2** Reorganizar `cerebro/` na taxonomia da §4.2; **`id` estável** por seção | D14, D7 |
| **3.3** **Unificar** espelho do site e cérebro em **um índice** (SQLite com FTS5 + vetores, ou Postgres+pgvector se for à nuvem); o espelho vira só uma *fonte coletora* | D7 |
| **3.4** Gerar `CATALOGO.md` e a página `/base` (documentos, vigência, última revisão, lacunas) | Visibilidade |
| **3.5** Quebrar convenções em **uma seção por cláusula-chave** com contexto (categoria, ano, cláusula) em vez de trechos longos | D4 |
| **3.6** OCR para os 6 PDFs escaneados (ferramenta local) | D16 |
| **3.7** Relatório de **vencimento/revisão** | D13 |

### Fase 4 — Modelo e geração (M)

| Ação | Mitiga |
|---|---|
| **4.1** Testar **Qwen3 4B/8B** e **Gemma 3/4 4B** no conjunto reserva (fidelidade, citação, latência na máquina real). Escolher por medição, não por ranking | D8 |
| **4.2** **Saída estruturada** `{ resposta, fontes_usadas: [id…] }` (parâmetro `format` do Ollama). O servidor descarta citação a id que não foi entregue | D8, D9 |
| **4.3** **Verificação por afirmação:** segunda passada curta ("esta frase está sustentada pelo trecho X? sim/não"), só quando a resposta tem números, nomes ou "o sindicato oferece…" | D9 |
| **4.4** **Extração em vez de geração** para tabelas e cláusulas: devolver o trecho com a fonte e deixar o modelo só introduzir | D8 |
| **4.5** Recusa graduada: "encontrei X mas não Y" em vez de recusa total | Experiência |

### Fase 5 — Roteamento, segurança, operação (M)

| Ação | Mitiga |
|---|---|
| **5.1** Substituir o roteamento por regex por **classificador de intenção** (exemplos + similaridade de embedding, com limiar e "não sei → RAG"). Manter regex só para padrões inequívocos (CEP, NR-n) | D6 |
| **5.2** FAQ literal também em **inglês** (ou tradução fixa revisada) e limiar ajustável por medição | D10 |
| **5.3** **Higienizar texto coletado** antes do prompt: remover trechos com padrões de instrução ("ignore", "você deve", "system:"), limitar tamanho e marcar como dado entre delimitadores; testes de injeção do §1.3 no CI | D15 |
| **5.4** Impedir vazamento do prompt: não repetir regras ao usuário; teste adversarial | D15 |
| **5.5** Publicação segura: **Cloudflare Tunnel + Access (token de serviço) + proxy fino** que valida e só repassa `/api/chat` e `/api/embed`; origem do Ollama só em localhost | `OLLAMA_ACCESS_TOKEN` não é validado pelo Ollama |
| **5.6** Capacidade: medir latência com N usuários; se preciso, servidor com *batching* contínuo ou modelo menor para a rota de voz | D18 |
| **5.7** Limpeza: remover `ai`, `@ai-sdk/google`, `quota.ts`; corrigir README e `docs/seguranca/security-requirements.md` | D17 |

### Fase 6 — Aprendizado contínuo, com privacidade (G)

| Ação | Observação |
|---|---|
| **6.1** Backlog de **lacunas** a partir de perguntas ouro que falham e de perguntas reais **que o próprio usuário optar por enviar** ("Isto não ajudou? Enviar esta pergunta ao sindicato") | **Respeita o AGENTS.md:** sem log de conteúdo por padrão. Exige consentimento explícito, sem IP, e decisão do sindicato. |
| **6.2** **Fine-tuning LoRA** só para tom, formato e recusas, quando houver centenas de pares revisados; **não** para fatos | Pesquisa: RAG primeiro |
| **6.3** GraphRAG leve (entidade → convenção → cláusula → vigência) só se surgirem perguntas que cruzam documentos | Custo alto; hoje desnecessário |

---

## 6. Ordem recomendada (se só der para fazer cinco coisas)

1. **Conjunto de avaliação maior e métricas por fase** (1.1–1.4).
2. **Trocar o embedding** e **anexar contexto aos trechos** (2.2 + 2.3), medindo.
3. **Reescrita da pergunta com histórico** (2.1).
4. **Remover `pinned` automático** e usar limiar de relevância (2.5).
5. **Cabeçalho com vigência e id estável** (3.1 + 3.2), a base da biblioteca.

Depois: reranqueador (2.4), modelo maior com saída estruturada (4.1–4.2) e segurança de publicação (5.5).

---

## 7. Como saber que melhorou

| Métrica | Hoje (README) | Meta inicial *(hipótese)* | Como medir |
|---|---|---|---|
| Top-1 no conjunto reserva | 44% | ≥ 65% | `cerebro:comparar` |
| Top-3 | 63% | ≥ 85% | idem |
| Fidelidade da resposta final | não medida | ≥ 95% das afirmações sustentadas | verificação por afirmação + amostra humana |
| Citação correta | não medida | ≥ 90% | resposta cita id entregue e correto |
| Recusa correta (sem fonte) | não medida | ≥ 95% | conjunto adversarial e fora de escopo |
| Falha por injeção | não medida | 0 nos testes | conjunto adversarial no CI |
| Latência p95 da resposta | não medida | definir por máquina | benchmark com N simultâneos |

Metas são **ponto de partida**, a recalibrar após a linha de base da Fase 1.

---

## 8. Riscos e decisões que são do sindicato (não técnicas)

- **Autoridade do conteúdo.** Quem aprova cada fato do FAQ e cada texto "curado"? Hoje não há dono nem prazo de revisão.
- **Limite jurídico.** A SINDI encaminha casos individuais ao Setor Jurídico. Convém o jurídico validar a lista de gatilhos e os textos de recusa.
- **Privacidade.** Qualquer coleta de perguntas reais exige decisão formal e consentimento (LGPD). O `AGENTS.md` hoje proíbe log de conteúdo.
- **Capacidade vs. cotas.** Sem cotas de mensagens (decisão do usuário), a proteção contra sobrecarga recai em capacidade de máquina, fila e, se publicado, controles do provedor de rede. Convém registrar essa decisão e o risco.
- **Hospedagem.** O computador local precisa ficar ligado; publicar na Vercel com Ollama local depende de túnel protegido e de um responsável por mantê-lo.
- **Custo-benefício do modelo.** Um modelo maior melhora a escrita, mas exige memória/GPU. Decidir com medição, na máquina real.

---

## 9. Resumo executivo para a diretoria

A SINDI já é **segura por desenho**: responde com texto aprovado quando existe, recusa quando não sabe e confere o que o modelo escreve. O que limita a qualidade hoje é **achar o trecho certo** (acerto de 44% em primeiro lugar) e **o tamanho do modelo**. A melhoria mais valiosa é transformar os arquivos atuais em uma **biblioteca**: cada fato com identificador, origem, **vigência** e responsável, indexado por palavras e por significado, com contexto em cada trecho. Isto aumenta a precisão, permite saber quando uma convenção venceu e cria o caminho para a SINDI crescer sem inventar. O investimento começa por **medir** (um conjunto de teste maior), depois **trocar o modelo de busca**, **anexar contexto** e **organizar a biblioteca**.
