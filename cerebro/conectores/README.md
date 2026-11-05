# Conectores da SINDI

Um **conector** liga um tipo de pergunta ao lugar da biblioteca onde está a resposta e à forma de responder. É o que permite usar um modelo pequeno e rápido:
em vez de receber todas as regras e toda a base, o modelo recebe só a orientação da área da pergunta e os trechos das estantes daquela área.

```
pergunta ─► conector (por palavras-gatilho, sem modelo) ─► estantes da biblioteca ─► trechos ─► modelo escreve ─► verificação ─► resposta + referências
```

## Os conectores

| Arquivo | Área (documento da comunicação) | Produto |
|---|---|---|
| `01-sobre-a-sindi-e-limites.md` | Segurança e confiabilidade da própria SINDI | todos |
| `02-legislacao-e-seguranca-juridica.md` | 1. Legislação trabalhista e segurança jurídica | SINDI Responde |
| `03-inteligencia-setorial-e-relatorios.md` | 2. Inteligência de mercado e relatórios setoriais | SINDI Relatórios |
| `04-comercial-contratos-e-propostas.md` | 3. Comercial, contratos e propostas | SINDI Comercial |
| `05-rh-recrutamento-e-qualificacao.md` | 4. RH, recrutamento e qualificação | SINDI RH |
| `06-custos-tributacao-e-planejamento.md` | 5. Custos, tributação e planejamento | orientações e checklists |
| `07-relacionamento-com-o-sindeprestem.md` | 6. Relacionamento com o Sindeprestem | SINDI Responde |

O número no nome é a ordem de desempate: quando dois conectores têm a mesma pontuação, vale o de número menor.

## Formato

```
---
titulo: Nome da área
gatilhos: palavra, expressão com espaço, prefixo*
estantes: noticias, artigos, cartilhas
relatorio: relatório, resumo executivo
modo: fontes
palavras: 70
---

## Quando usar          (para a equipe; não vai ao modelo)
## Como responder       (ATÉ 420 CARACTERES: é o único trecho enviado ao modelo, a cada pergunta da área)
## Fontes da biblioteca (para a equipe)
## Limites              (para a equipe)
## Perguntas de treino  (para a equipe; as perguntas medidas ficam em cerebro/avaliacao/treino-v1.md)
```

| Chave | O que é |
|---|---|
| `gatilhos` | Palavras que identificam a área. A comparação ignora acentos e maiúsculas. Palavra solta vale 1 ponto e precisa aparecer inteira (`vaga` não casa com `vagas`; use `vaga*`). Expressão com espaço vale 2. Vence o conector com mais pontos. |
| `estantes` | Estantes de `/base` onde a SINDI pesquisa: `institucional`, `noticias`, `artigos`, `cartilhas`, `juridico`, `proposicoes` (projetos no Congresso), `noticias-setor` (TST, WEC, IBGE, MTE), `orientacoes` (Ministério do Trabalho). |
| `relatorio` | Opcional. Expressões que pedem um panorama: a SINDI reúne indicadores, publicações e projetos recentes. |
| `modo` | `fontes`: sem fonte, a SINDI diz que não conseguiu confirmar. `orientacao`: pode dar orientação geral de método (como montar uma proposta, como organizar uma seleção). |
| `palavras` | Tamanho máximo da resposta. Resposta curta é resposta rápida: neste computador o modelo escreve cerca de 20 palavras em 2 segundos. |

Convenções coletivas, Normas Regulamentadoras, Constituição e indicadores têm busca própria (por cláusula, número da NR, artigo e nome do indicador) e não precisam ser listados em `estantes`.

## Como editar

1. Edite o arquivo. A SINDI relê a pasta em até 5 segundos; não é preciso reiniciar nada.
2. Rode `npm run avaliar:treino` para ver as respostas e os tempos das perguntas de treino.
3. Se a pergunta deveria ter fonte e não tem, o problema é de conteúdo: acrescente o fato em `cerebro/conhecimento/` (com a fonte) ou peça a coleta do documento.

Conectores não guardam fatos. Fatos ficam em `cerebro/conhecimento/` (escritos pela equipe) e na biblioteca coletada (`/base`).
