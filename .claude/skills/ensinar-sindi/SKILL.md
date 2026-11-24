---
name: ensinar-sindi
description: Ensina algo à SINDI pelo cérebro — corrigir um fato (cerebro/conhecimento), mudar como uma área responde (cerebro/conectores) ou a regra geral (cerebro/instrucoes) — e depois reindexa, regenera o grafo e avalia. Use quando o usuário disser "a SINDI respondeu errado", "ensine a SINDI", "corrija a resposta sobre...".
---

# Ensinar a SINDI

1. **Onde mexer** (`cerebro/README.md`):
   - fato errado ou ausente → `cerebro/conhecimento/<assunto>.md` (cabeçalho `titulo`, `fonte`, `atualizado`, `gatilhos`);
   - jeito de responder de uma área → `cerebro/conectores/NN-<area>.md`, seção `## Como responder` (até 420 caracteres);
   - regra geral → `cerebro/instrucoes/identidade-e-regras.md` (até 2.600 caracteres no total).
   - Nunca edite `cerebro/auto/` (gerado). Não invente fato: peça a fonte ao usuário se ela não estiver na biblioteca.
2. **Reindexar** só o que mudou: `npx tsx --env-file=.env.local scripts/cerebro/indexar-cerebro.ts`.
3. **Regenerar o grafo**: `npm run grafo:gerar`.
4. **Medir a busca**: `npm run cerebro:comparar` (sem regressão em top-3/MRR).
5. **Avaliar respostas** (servidor rodando com `SINDI_COTA_IP_DIA=0 SINDI_COTA_GLOBAL_DIA=0`): `npm run avaliar:treino` e **leia** as respostas da área tocada.
6. Relate: o que foi ensinado, a fonte, e as respostas antes/depois.
