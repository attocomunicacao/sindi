---
name: nova-ferramenta
description: Cria uma ferramenta ou página nova na SINDI seguindo a receita do guia do desenvolvedor (lógica pura, rotas com guarda, página registrada, glifo, entrada no chat, registro, env, testes, e2e). Use quando o usuário pedir uma nova calculadora, consulta, gerador ou página.
---

# Nova ferramenta / página

Siga `docs/desenvolvimento/guia-do-desenvolvedor.md` §4, nesta ordem:

1. Lógica pura em `src/lib/<ferramenta>/` + schema zod da entrada. Sem rede dentro do cálculo.
2. Rotas em `src/app/api/<ferramenta>/<acao>/route.ts` com `guardaDeEscrita(request, { nome, limiteBytes, limitePorMinuto })` ou `guardaDeLeitura(request, nome, limite)`; erros com `erroJson`, PDFs com `respostaPdf`.
3. Página `src/app/<rota>/page.tsx` com `metadata`; entrada em `PAGINAS` de `src/lib/paginas.ts` (`menu: false` para página oculta, `previa: false` para não indexar); glifo em `GLIFOS` de `src/componentes/layout/marca-sindi.tsx` (4 elementos SVG, 80×32).
4. (Opcional) entrada no chat: `chat.executar(pergunta, { idioma, conector })` devolvendo texto com **todo número** que a resposta possa citar.
5. Registro em `FERRAMENTAS` (`src/lib/ferramentas/registro.ts`) se for ferramenta.
6. Variáveis novas documentadas em `env.example`; segredo só no servidor.
7. Testes: lógica, rotas (copie `tests/orcamento-rotas.test.ts`), interface (`tests/interface-*.test.tsx`, importe `./setup-dom` primeiro), caso hostil em `tests/ataques*.test.ts`.
8. Página em `PAGINAS` de `e2e/ajuda.ts`; `npm run test:e2e`.
9. `cerebro/conhecimento/ferramentas-da-sindi.md` se a SINDI deve saber da ferramenta.
10. `npm run verificar:funcional` com o servidor rodando; uma linha no README se for visível ao usuário.
