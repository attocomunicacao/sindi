# Avaliação do sistema SINDI — 23/11/2026

> Revisão por leitura do código (três varreduras: camada de IA, cérebro/biblioteca, segurança/desempenho/qualidade). As correções P0 e P1 foram aplicadas no ramo `feat/cascata-e-cerebro`; ver o fim deste arquivo.


### Pontos fortes
- **Forma de pensar:** é RAG com verificação, não um modelo "treinado".
  - O servidor decide por regras, busca as fontes e o modelo só escreve.
  - `verificarFatos` (`src/lib/knowledge/grounded.ts:69`) barra e-mail, telefone, R$, lei e números que não estejam nas fontes, e força a reescrita.
  - É a melhor decisão do projeto e é ela que torna a troca de provedor segura.
- **Arquitetura do chat em etapas:** `requisicao → situacao → prompt → respostas → geracao → stream` (`src/lib/chat/`), e a rota só orquestra.
- **Segurança de base:**
  - guarda HTTP em ordem correta (origem, tipo, limite, tamanho, JSON);
  - CSP com nonce e `strict-dynamic`;
  - zod na entrada;
  - redação de CPF, cartão e senha;
  - testes de ataque;
  - Semgrep e audit na CI;
  - migrações Supabase com RLS e menor privilégio.
- **Desempenho bem medido:**
  - FTS5 com CTE materializada (18 s → 0,05 s);
  - prefixo de prompt estável;
  - cache de respostas com deduplicação de gerações simultâneas;
  - semáforo de concorrência e fila.
- **Qualidade:** 35 arquivos de teste, cobertura ≥ 80% na CI, Playwright + axe, e conjuntos de avaliação (`cerebro/avaliacao/`).

### Pontos fracos

| Área | Problema | Onde |
|---|---|---|
| Segurança | **IP forjável**: a cota e o limite confiam primeiro em `x-vercel-forwarded-for`/`x-real-ip`. A URL do túnel está versionada, então qualquer pessoa burla a cota por IP e esgota a global | `src/lib/cota.ts:56-63`, `deployment/vercel-proxy/vercel.json:9`, `publicar.ps1:43` |
| Segurança/custo | O chat não tem limite por minuto. A busca (com chamada de embeddings) roda **antes** de checar a cota, então quem já passou do limite ainda gasta API | `src/lib/chat/requisicao.ts:19`, `route.ts` (`decidirSituacao` antes de `gastarCota`) |
| Privacidade | A pergunta atual vai à API de embeddings **sem** `redigirDadosSensiveis`; depende de o detector recusá-la antes | `src/lib/chat/situacao.ts:48,64` |
| Segurança | O token de aquecimento é gerado com `Get-Random` (não criptográfico) e passado na linha de comando | `publicar.ps1:41` |
| Segurança | Histórico do assistente forjável pelo cliente (até 60 mil caracteres). `FONTES:`/`PERGUNTA:` vão sem delimitação, abrindo injeção de prompt | `src/lib/chat.ts:4`, `src/lib/cerebro/instrucoes.ts:42` |
| Disponibilidade | **Provedor único**: um 429 do Gemini mostra "limite gratuito atingido" ao usuário | `src/lib/gemini.ts:20-30` |
| Disponibilidade | Uma máquina só; túnel rápido com URL nova a cada partida; sem supervisor; estado em memória perdido ao reiniciar | `scripts/operacao/publicar.ps1` |
| Bug | O cérebro carrega `auto.anterior/` (cópia de segurança): **64 de 231 vetores duplicados** | `src/lib/cerebro/carregar.ts:16` |
| Desempenho | 1 chamada de embeddings por pergunta, sem cache de vetor da consulta | `src/lib/cerebro/embeddings.ts` |
| Desempenho | Embeddings fora do semáforo | `src/lib/cerebro/embeddings.ts` |
| Desempenho | Nova conexão SQLite a cada consulta (cerca de 8 por pergunta) | `src/lib/dados/painel.ts`, `src/lib/biblioteca/pesquisa.ts` |
| Desempenho | `readPainel` sem cache no caminho do chat | `src/lib/dados/painel.ts` |
| Desempenho | Mapa de pesos de termos que cresce sem teto | `src/lib/biblioteca/pesquisa.ts:47` |
| Desempenho | `loadEnvFile` executado ao importar o módulo | `src/lib/knowledge/retrieve.ts:14` |
| Código | 196 linhas com mais de 250 caracteres (ex.: ternário de 7 níveis em `src/lib/chat/prompt.ts:124`); nomes misturando PT/EN | vários arquivos |
| Código | Busca espalhada por `knowledge/`, `cerebro/`, `biblioteca/` e `dados/painel.ts` | — |
| Código | 3 listas de stopwords diferentes | `buscar.ts`, `pesquisa.ts`, `core.ts` |
| Código | Cache "mtime a cada 5 s" repetido 3 vezes | `carregar.ts`, `instrucoes.ts` |
| Código | Código morto: `passagensDoCerebro`, `passagensHibridas`, ramos em inglês | `src/lib/cerebro/buscar.ts` e outros |
| Cérebro | Não há ligação entre os dados: os `links` do site são coletados e descartados | `src/lib/dados/collectors/sindeprestem.ts:85` |
| Cérebro | Biblioteca sem vetores | — |
| Cérebro | Não existe grafo | — |
| Cérebro | O SQLite da biblioteca **não existe** neste computador (`.data/dados/sindi-dados.sqlite`) | — |
| Docs | Docs desatualizadas (Ollama, `scripts/modelo/`) | — |
| Docs | `.gitignore` com `!.env.example`, mas o arquivo é `env.example` | `.gitignore` |
| Docs | O CLAUDE.md erra ao dizer que o limite por minuto usa Redis | `CLAUDE.md` |
| Testes | Nenhum teste da ordem padrão de cabeçalhos de IP nem da falha do Redis | — |
| Testes | Nenhum teste de "não buscar quando a cota acabou" | — |

### Atualizações por urgência
- **P0 (urgente, segurança/dinheiro):**
  - IP só por `cf-connecting-ip` atrás do túnel;
  - checar a cota (sem consumir) antes da busca;
  - limite por minuto no chat;
  - redigir a pergunta antes dos embeddings;
  - corrigir `auto.anterior/`;
  - token de aquecimento criptográfico.
- **P1 (disponibilidade):**
  - cascata de provedores com Ollama de emergência;
  - mensagens neutras;
  - embeddings no semáforo, com cache de vetor da consulta;
  - métricas por provedor.
- **P2 (produto):**
  - grafo do cérebro e página `/cerebro`;
  - orquestra de especialistas no chat;
  - página `/custos`;
  - persistir os `links` do site;
  - reconstruir o SQLite.
- **P3 (higiene):**
  - conexão SQLite reaproveitada e `readPainelEmCache`;
  - stopwords únicas;
  - utilitário de cache por mtime;
  - remover código morto;
  - quebrar linhas densas nos arquivos tocados;
  - docs atualizadas, `.gitignore`, testes dos casos acima.
- **Recomendação sem código (fora do escopo):** um túnel nomeado da Cloudflare (URL fixa) ou hospedagem, para tirar a dependência do computador ligado. Exige conta/decisão do usuário.


---

## Execução (ramo `feat/cascata-e-cerebro`, 23/11/2026)

| Prioridade | Item | Situação |
|---|---|---|
| P0 | IP forjável | Corrigido: `cf-connecting-ip` primeiro; repasse da Vercel virou função que assina cada pedido (`SINDI_REPASSE_SEGREDO`) e informa o IP; URL do túnel saiu do git (vai como variável da implantação) |
| P0 | Cota antes da busca, limite por minuto no chat | Corrigido (`cotaDisponivel`, `SINDI_CHAT_POR_MINUTO`, padrão 12) |
| P0 | Pergunta sem redação nos embeddings | Corrigido |
| P0 | `auto.anterior/` duplicando o cérebro | Corrigido; índice de vetores 231 → 168 (+1 seção nova) |
| P0 | Token de aquecimento não criptográfico | Corrigido (`RandomNumberGenerator`) |
| P0 | Histórico forjado e injeção pelas fontes | Assistente com teto de 4.000 caracteres; fontes entre marcadores fixos; marcadores e rótulos vindos de fora neutralizados (inclusive variantes Unicode) |
| P1 | Provedor único | Cascata `src/lib/ia/` (Gemini → Groq → OpenRouter → Mistral → Cloudflare → Anthropic desligado → Ollama), disjuntor, limites conhecidos, troca silenciosa e `reset` no meio do texto; mensagem neutra se tudo cair |
| P1 | Ollama de emergência | Instalado (v0.40.16) com `qwen2.5:3b`; `publicar.ps1` liga e aponta a SINDI para ele |
| P1 | Embeddings por pergunta | Cache LRU de vetores de consulta (500, 6 h) |
| P1 | Métricas por provedor | `/uso` mostra quem respondeu |
| P2 | Grafo do cérebro, `/cerebro`, Obsidian | Feito (`src/lib/grafo/`, `npm run grafo:gerar`, `.data/obsidian/SINDI`) |
| P2 | Grafo alimentando o chat | Documentos ligados à lei/NR/projeto citados entram como candidatos, filtrados por cobertura ≥ 0,5 |
| P2 | Orquestra de especialistas | `src/lib/agentes/orquestrador.ts` (especialista de apoio quando a pergunta cai entre duas áreas; sem chamada extra de IA) |
| P2 | `/custos` | Página oculta com os cenários interno e externo |
| P2 | Links do site e SQLite | Coletor guarda `meta.links`; biblioteca reconstruída |
| P3 | Higiene | Parcial: limite por minuto não zera mais tudo; docs, AGENTS.md, CLAUDE.md, README e guia atualizados. **Não feito**: conexão SQLite reaproveitada, `readPainelEmCache` no chat, stopwords únicas, utilitário de cache por mtime, remoção de código morto, quebra das linhas longas |

### Revisão de segurança (guardião) e correções
- **Alta**: o `caminho` do repasse permitia trocar de host (`\`, tab, quebra) e vazar o segredo. Corrigido com lista de caracteres permitidos e conferência de origem; teste em `tests/ia-cascata.test.ts`.
- **Média**: o hook de segredos tinha desvios (`node --env-file=... -e`, curingas, concatenação). Corrigido: lista fechada de comandos permitidos.
- **Baixa**: `SINDI_CHAT_POR_MINUTO` inválido desligava o limite (corrigido); variantes Unicode dos marcadores (corrigido).
- **Baixa, aceita**: o segredo do repasse aparece na linha de comando do `vercel deploy --env` durante a publicação (risco local da máquina; muda a cada publicação).

### Fora do escopo (decisão do usuário)
- Túnel nomeado da Cloudflare ou hospedagem, para não depender deste computador ligado.
- GitHub Models (descontinuado em 30/07/2026) e Cerebras (passou a exigir cartão) ficaram fora da cascata.
