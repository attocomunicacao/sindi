# Guia do desenvolvedor

Este é o guia vigente para quem vai mexer no código ou acrescentar uma ferramenta. Ele substitui o `ia/16-resumo-e-guia-do-desenvolvedor.md` (histórico de 13/10/2026,
que ainda fala de Ollama e de "sem cota"). Para o fluxo de uma pergunta e as medições, leia também [`../ia/21-fluxo-e-modelo-reduzido.md`](../ia/21-fluxo-e-modelo-reduzido.md);
para ensinar a SINDI, [`../../cerebro/README.md`](../../cerebro/README.md).

## 1. O que é

A SINDI é a assistente virtual do SINDEPRESTEM. Não é um modelo treinado com fatos do sindicato: o servidor decide por regras o que fazer com a pergunta, busca as fontes
(cérebro em Markdown, biblioteca coletada em SQLite, resultado de uma ferramenta), entrega só isso ao modelo (API do Gemini, nível gratuito) e **verifica** a resposta
antes de mostrá-la (e-mail, site, telefone, valor, número e lei precisam constar nas fontes). Há cota de mensagens por pessoa e por dia, sem histórico de conversas.

## 2. Mapa do código

| Onde | O que mora ali |
|---|---|
| `src/app/` | Páginas (`page.tsx`) e rotas de API (`api/**/route.ts`). Uma rota só exporta os métodos HTTP e a configuração; funções auxiliares ficam em `src/lib` |
| `src/proxy.ts` | CSP com nonce por requisição (não cobre `/api`) |
| `src/components/` | Componentes. Os que têm `'use client'` não podem importar módulos que puxam `node:*`, `sqlite` ou `zod` (ver "Armadilhas") |
| `src/lib/chat/` | O chat em etapas: `requisicao` → `situacao` → `prompt` → `respostas` → `geracao` → `stream`. A rota `api/chat/route.ts` só orquestra |
| `src/lib/ferramentas/` | Contrato `Ferramenta` e registro. O orçamento (`src/lib/orcamento/ferramenta.ts`) é o exemplo |
| `src/lib/http/guarda.ts` | Proteções de rota: origem, tipo, limite por minuto, tamanho do corpo, erro JSON, PDF |
| `src/lib/paginas.ts` | Registro das páginas (menu, marca, `robots.txt`, 404) |
| `src/lib/gemini.ts`, `cota.ts`, `limite.ts`, `redis.ts` | Provedor de IA, cota de mensagens, limite por minuto, Redis (Upstash) |
| `src/lib/cerebro/`, `knowledge/` | Conectores, busca (palavras + significado), verificação de fatos, trechos |
| `src/lib/dados/`, `biblioteca/` | Coleta de dados públicos (SQLite), painel, biblioteca |
| `src/lib/orcamento/` | Cálculo, encargos, tabela de referência, PDFs |
| `cerebro/` | O que ensina a SINDI (instruções, conectores, conhecimento, avaliação) |
| `scripts/` | Coleta, indexação, avaliação, publicação |
| `tests/` | `node:test` via `tsx`; um arquivo por assunto |

## 3. Comandos

| Comando | Para quê |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (só um por pasta). Lê `.env.local` |
| `npm run check` | Lint, typecheck e testes |
| `npm run build` | Build de produção (rode também antes de abrir um PR) |
| `npm run verificar:funcional` | Percorre páginas, rotas, PDFs e as ferramentas do registro **no servidor em execução** e imprime um relatório (`--chat` inclui uma pergunta real) |
| `npm run cerebro:indexar` | Indexa a busca por significado (usa `GEMINI_API_KEY`) |
| `npm run avaliar:treino` | Perguntas de treinamento contra o chat em execução. **Gasta o limite gratuito**: use `SINDI_COTA_IP_DIA=0` e `SINDI_COTA_GLOBAL_DIA=0` e leia as respostas |

Scripts em `scripts/` não carregam o `.env.local` sozinhos: `npx tsx --env-file=.env.local scripts/...`.

## 4. Adicionar uma ferramenta

Uma ferramenta é uma capacidade do site (calculadora, consulta, gerador) com página, rotas de API e, opcionalmente, uma entrada no chat. O orçamento é o modelo a seguir.
Siga esta ordem; o teste `tests/ferramentas.test.ts` confere os itens 2, 3, 5 e 6 por você.

1. **A lógica, pura e testável** em `src/lib/<ferramenta>/`: funções que recebem dados e devolvem resultado, mais o schema zod da entrada. Sem acesso a rede dentro do cálculo.
2. **As rotas** em `src/app/api/<ferramenta>/<acao>/route.ts`, sempre com a guarda de `src/lib/http/guarda.ts`:
   - `POST`: `guardaDeEscrita(request, { nome: '<ferramenta>-<acao>', limiteBytes, limitePorMinuto })` (origem, tipo, limite, tamanho e JSON) e depois a validação do schema;
   - `GET`: `guardaDeLeitura(request, '<ferramenta>-<acao>', limite)`;
   - erros com `erroJson`, PDFs com `respostaPdf`. Não registre o conteúdo do pedido em log.
3. **A página** em `src/app/<ferramenta>/page.tsx`, com `metadata`, e a entrada em `src/lib/paginas.ts` (rota, rótulo, `previa`). Desenhe o glifo em `GLIFOS` (`src/components/sindi-mark.tsx`); sem ele o TypeScript não compila.
4. **A entrada no chat** (se a SINDI deve responder a esse pedido): `chat.executar(pergunta, { idioma, conector })` devolve `{ passagem, orientacao }` ou `undefined` se a pergunta não é para a ferramenta.
   O resultado vira fonte do modelo e **precisa conter, no texto, todo número que a resposta puder citar** (a verificação de fatos barra o que não estiver lá).
5. **O registro**: inclua a ferramenta em `FERRAMENTAS` (`src/lib/ferramentas/registro.ts`) com `id`, `pagina`, `api`, `env` e `testes`.
6. **Variáveis de ambiente**: documente em `env.example` (o teste confere). Chave de terceiros só no servidor, nunca `NEXT_PUBLIC`.
7. **Testes**: a lógica, as rotas (origem, tipo, tamanho, validação, limite) e a entrada no chat. Para as rotas, copie `tests/orcamento-rotas.test.ts`.
8. **O que a SINDI sabe sobre a ferramenta**: atualize `cerebro/conhecimento/ferramentas-da-sindi.md` e rode `npm run avaliar:treino` lendo as respostas (o critério automático não vê fato trocado).
9. **Verificação funcional**: `npm run verificar:funcional` com o servidor rodando. A ferramenta registrada entra no relatório sozinha (página e rotas).
10. **Documentação**: uma linha no `README.md`, se a ferramenta aparece para o usuário.

### Checklist de segurança (para a revisão do PR)

- [ ] Toda rota usa a guarda (`guardaDeEscrita`/`guardaDeLeitura`), com limite por minuto e tamanho máximo de corpo.
- [ ] A entrada é validada por schema; texto livre é limpo de caracteres de controle e tem tamanho máximo.
- [ ] Nenhum segredo no código, no log, na URL ou no navegador; nenhuma variável `NEXT_PUBLIC_` com segredo.
- [ ] Não há log de conteúdo de conversa, de IP nem de dados do usuário.
- [ ] Links externos passam por `linkSeguro`; endereços vindos de fontes externas só são aceitos como http(s)/ftp, sem credenciais.
- [ ] Se a ferramenta busca algo na rede: https, sem credenciais, sem IP/host interno, com limite de tamanho e de tempo (ver `politeFetch` em `src/lib/dados/http.ts`).
- [ ] Se gera PDF: `respostaPdf`, sem cache, com limite por minuto.
- [ ] Se grava arquivo: nome sem entrada do usuário, teto de tamanho e de quantidade.
- [ ] Se usa o provedor de IA: passa pela cota; o custo em tokens do pedido é conhecido (o nível gratuito é limitado).
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` e `npm audit --audit-level=high` sem falhas.

### Escrever testes

- **Lógica e rotas**: `tests/<assunto>.test.ts`, com `node:test`. Rotas se chamam direto (`POST(new Request(...))`); copie `tests/orcamento-rotas.test.ts`. Trocar `globalThis.fetch` simula o Gemini e a rede; restaure no `finally`.
- **Interface**: `tests/<assunto>.test.tsx` com Testing Library. Importe `./setup-dom` **primeiro** (cria o navegador jsdom); `definirAbaOculta` simula a aba em segundo plano. Veja `tests/interface-orcamento.test.tsx`.
- **Coletores de dados**: `tests/rede-simulada.ts` (`simularRede` com respostas gravadas e `comBanco` com SQLite temporário, sem esperas). Cada coletor leva uma resposta boa, uma vazia, uma malformada e uma com erro HTTP. Chamar uma URL que nenhuma rota cobre falha o teste.
- **Antes de confiar num teste novo**, quebre o código de propósito e confirme que ele falha (foi assim que os testes de interface foram validados).
- `npm run test:coverage` mostra a cobertura; ela só mede os arquivos que algum teste carrega.

## 5. Convenções do projeto

- Respostas da SINDI nunca são texto fixo do servidor: o servidor decide e busca, o modelo escreve, a verificação confere (`AGENTS.md`).
- Sem cota por usuário na aplicação foi uma decisão antiga, revertida em 19/11/2026: há cota por IP e global (`src/lib/cota.ts`), porque o provedor é um nível gratuito.
- Dados pessoais e segredos são removidos antes de chegar ao modelo (`redigirDadosSensiveis`). No nível gratuito o Google pode usar as perguntas: a tela avisa.
- Comentários em português, explicando o porquê. Arquivos novos em UTF-8.

## 6. Armadilhas conhecidas

- **Componente cliente × módulo de servidor.** Um arquivo com `'use client'` que importa (mesmo de passagem) `node:sqlite`, `node:fs` ou `zod` quebra o build ou gera violação de CSP.
  Funções usadas nos dois lados vão em módulos puros, como `src/lib/chat-historico.ts`, `chat-stream.ts`, `url-segura.ts`, `dados/frescor.ts` e `paginas.ts`.
- **Rotas do Next só exportam métodos HTTP** e configuração (`runtime`, `maxDuration`, `dynamic`). Funções auxiliares ficam em `src/lib`.
- **Pastas que começam com `_` em `src/app` são privadas** (não viram rota).
- **Um servidor `next dev` por pasta.** Para trocar a configuração, reinicie: `.env.local` só é lido na partida.
- **Leitor de PDF (`pdf-parse`) toma posse do buffer**: depois da leitura o `Uint8Array` fica inutilizável; passe uma cópia se precisar reaproveitá-lo.
- **Limites por IP dependem do cabeçalho do IP** (`SINDI_IP_HEADER`). Atrás de Vercel + túnel, confirme qual cabeçalho traz o visitante; sem ele todos caem no mesmo grupo.
- **Avaliação gasta o limite gratuito do Gemini**; indexação também (100 textos por minuto).
- **`.env.local` é privado**: não leia, não imprima, não versione.
- **TypeScript**: `noUncheckedIndexedAccess` não está ligado (217 pontos a corrigir hoje); as demais verificações estritas estão.
