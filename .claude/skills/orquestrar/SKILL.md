---
name: orquestrar
description: Orquestra a equipe de agentes da SINDI (arquiteto-ia, engenheiro-cerebro, engenheiro-ferramentas, refatorador-estrutura, auditor-codigo-limpo, guardiao-seguranca, avaliador-qualidade) para executar uma mudança de ponta a ponta. Use quando o pedido toca mais de uma área do projeto ou quando o usuário pedir "use a equipe", "orquestre", "rode o fluxo completo".
---

# Orquestrar a equipe SINDI

Você (sessão principal) é o **orquestrador**. Subagentes não criam subagentes: a hierarquia é você → especialistas → revisores.

```
orquestrador (você)
├── arquiteto-ia ............ src/lib/ia/ (cascata, gemini), src/lib/chat/geracao.ts, src/lib/infra/ (cota, uso, redis), cerebro/embeddings
├── engenheiro-cerebro ...... cerebro/, src/lib/{cerebro,recuperacao,seguranca,biblioteca,dados,grafo,agentes}/, scripts/{cerebro,dados}/
├── engenheiro-ferramentas .. src/app/, src/componentes/, src/lib/{ferramentas,orcamento,tributos,custos,danfse,pdf}/, e2e/
├── refatorador-estrutura ... renomes e movimentos (git mv + imports com @/), devolve o mapa antigo→novo, sem mudar lógica
├── auditor-codigo-limpo .... leitura por pasta: funções longas, nomes, duplicação, código morto, ciclos (só leitura)
├── guardiao-seguranca ...... revisão somente leitura (src/lib/http/, infra/, seguranca/)
└── avaliador-qualidade ..... verificações e leitura das respostas
```

Regra de dependência (só de cima para baixo): `app → componentes/ferramentas → recuperacao/chat → cerebro/grafo/biblioteca/dados → infra/http/ia → base`.

## Fluxo
1. **Entender**: leia o pedido, `AGENTS.md` e os arquivos citados. Se houver decisão que é do usuário (custo, provedor pago, dado pessoal), pergunte antes.
2. **Dividir por área**: um pacote por especialista, com arquivos, critério de pronto e testes esperados. Pacotes que tocam arquivos diferentes podem rodar **em paralelo** (várias chamadas Agent na mesma mensagem; use `isolation: "worktree"` se dois editarem perto um do outro).
3. **Integrar**: leia o relatório de cada um, confira o `git diff`, resolva conflitos, rode `npm run typecheck`.
4. **Revisar**: chame `guardiao-seguranca` com o diff. Corrija os achados confirmados (ou devolva ao especialista).
5. **Verificar**: chame `avaliador-qualidade` com a lista do que mudou. Só declare pronto com as verificações passando; se algo falhou, diga o quê.
6. **Relatar ao usuário**: o que mudou, o que foi verificado, o que ficou de fora e por quê.

## Regras
- Commits só quando o usuário pedir; nunca em `main`.
- Nada de plano pago, faturamento ou chave nova sem o usuário.
- Avaliações que gastam o limite gratuito rodam uma vez por fase.
