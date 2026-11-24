# O cérebro na tela e o chat usando o cérebro (24/11/2026)

## O que foi feito
- **`/cerebro`**: nova silhueta (dois hemisférios vistos de cima, só o contorno), SINDI no centro, áreas distribuídas pelos hemisférios, estantes entre as áreas que as consultam e documentos recolhidos na estante (abrem ao clicar ou com zoom). Dica do mouse sem texto quebrado, rótulos sem colisão, teclado e pinça.
- **Telemetria "o chat usou o cérebro"**: cada fonte leva `origem` e `no`; a rota devolve `cerebro` (área, origens e nós das fontes apoiadas); `/cerebro` acende o caminho da última resposta e `/uso` soma contadores agregados.
- **Referências só das fontes apoiadas** (`fontesApoiadas`): antes saíam todas as fontes enviadas ao modelo.
- **Medição**: `npm run cerebro:cobertura` e `cerebro:avaliar -- --como-no-chat`.

## Linha de base (antes de qualquer mudança de busca)
| Medida | Resultado |
|---|---|
| Perguntas de ouro (`perguntas-ouro.md`, evidência) | 40/46 |
| Ampliado (`perguntas-ouro-ampliado.md`) | 53/62 |
| `cerebro:comparar` híbrida | 83% no 1º lugar, 100% no top 3, MRR 0,91 |
| `cerebro:avaliar --como-no-chat` (2 fontes, área real, portas da rota) | 40/46, com composição diferente: "Posso demitir…" passa (encaminhamento ao Jurídico) e "Quais projetos sobre terceirização estão na Câmara?" **falha** |

A avaliação antiga usava 3 fontes e nenhuma área; por isso era mais generosa que o chat real.

## Cobertura (174 perguntas de avaliação, sem modelo)
- Origem das fontes: cérebro 122, documentos estruturados 29, biblioteca 23, contato 7, ferramenta 4, externa 1.
- 38 perguntas ficaram **sem área** (usam as estantes padrão e não recebem a orientação "Como responder" de nenhuma área).
- 7 de 14 estantes nunca foram usadas: jurídico, normas, regimentos, proposições, notícias do setor, orientações e a estante do cérebro.
- Só 1 de 18 arquivos de conhecimento nunca foi usado (lista de títulos de notícias, que é filtrada de propósito).

## Testado e descartado (sem ganho medido)
1. **Ligar `juridico`, `convencoes`, `normas`, `orientacoes` e `indicadores` às áreas** (`estantes:` dos conectores): as fontes entregues em 8 perguntas de teste e o resultado das perguntas de ouro (40/46 e 53/62) **não mudaram**. As convenções e as normas já são servidas por caminhos próprios (`trechosDeDocumentos`).
2. **Gatilhos "projeto*, câmara, senado, congresso" no conector de legislação** e **âncora na ementa para a estante de projetos**: a área passou a ser a certa e a estante devolveu um projeto, mas a seleção final o descartou (PDL de 2021, mais de 3 anos) e a pergunta continuou falhando. Revertido.

## Pendências (precisam de avaliação do modelo, não só da evidência)
- **Roteamento por grafo** (temas, `parecido`, 2 saltos): hoje o grafo só entra quando a pergunta cita o número de uma lei, NR ou projeto.
- **Fusão e reranking** (RRF entre cérebro, biblioteca e grafo, com vaga reservada ao cérebro curado): hoje `cobertura` + `slice(0, 3)` em `recuperacao/recuperar.ts`.
- **Resumos por entidade/estante** (estilo GraphRAG) em `cerebro/auto/`: gasta o limite do Gemini (`cerebro:gerar` e `cerebro:indexar`).
- **`revisao: pendente`** (5 arquivos de conhecimento) ainda não é tratado pelo código.
- **`avaliar:treino`** com leitura das respostas, antes e depois de cada uma das mudanças acima (exigência do projeto para mudança de busca).
- Dois achados da cobertura que merecem atenção: perguntas sobre "Câmara" caem sem área e recebem o primeiro trecho irrelevante do cérebro ("Painel do setor"); perguntas de RH que citam "convenção" recebem uma lista de 8 aditivos de CCT.
