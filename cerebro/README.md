# Cérebro da SINDI

Esta pasta é o que **ensina** a SINDI. O modelo de linguagem é pequeno e roda neste computador; ele não foi treinado com fatos do sindicato. Tudo o que a SINDI
sabe e o jeito como responde estão nestes arquivos Markdown, que ela relê em até 5 segundos depois de qualquer edição, sem reiniciar nada.

```
cerebro/
  instrucoes/     como a SINDI se comporta
    identidade-e-regras.md   regras-base, enviadas em toda conversa (curtas)
    exemplos.md              exemplos de pergunta e resposta (ensino por exemplo)
  conectores/     uma área por arquivo: palavras que identificam a área, estantes da biblioteca onde procurar e como responder
  conhecimento/   fatos e orientações escritos pela equipe (FAQ, diretoria, setor, glossário, ferramentas, limites, comercial, RH, custos)
  auto/           resumos GERADOS a partir dos dados coletados (não editar: npm run cerebro:gerar recria)
  avaliacao/      perguntas de teste (não viram conhecimento)
```

## O caminho de uma pergunta

```
pergunta
  1. proteções por regra (fora do modelo): dados pessoais · caso jurídico individual · saudação · fora do escopo
  2. conector: qual área? (palavras-gatilho, sem modelo)                         → cerebro/conectores/
  3. fontes:  orçamento · relatório (indicadores, publicações, projetos) · documento citado (NR, artigo, cláusula, indicador)
              · conhecimento (busca por palavras + significado)                  → cerebro/conhecimento/ e cerebro/auto/
              · biblioteca, nas estantes do conector (notícias, artigos, cartilhas, projetos)   → /base
  4. modelo:  regras + exemplos (iguais sempre, lidos do cache) + orientação do conector + até 2 fontes + pergunta
  5. verificação: e-mail, site, telefone, valor, número e lei da resposta precisam estar nas fontes; senão o modelo reescreve
  6. resposta + referências (links das fontes usadas)
```

Detalhes do desenho, das medições e do modelo em `docs/ia/21-fluxo-e-modelo-reduzido.md`. O mapa das áreas e das perguntas de treinamento está em
`docs/ia/22-conectores-e-treinamento.md`.

## O que editar para quê

| Quero… | Edito… | Depois |
|---|---|---|
| Corrigir ou acrescentar um fato | `conhecimento/*.md` (uma ideia por `## Seção`, com a fonte) | `npm run cerebro:indexar` |
| Dar uma resposta de referência a uma pergunta | `conhecimento/faq.md` ou o arquivo do tema: `## Pergunta?`, linha `Variações: forma 2 \| forma 3`, resposta | `npm run cerebro:indexar` |
| Mudar como uma área responde (tom, formato, tamanho) | `conectores/NN-area.md`, seção `## Como responder` e a chave `palavras:` | nada (relê sozinha) |
| Fazer uma pergunta cair na área certa | `gatilhos:` do conector | nada |
| Mudar a regra geral de comportamento | `instrucoes/identidade-e-regras.md` | `npm run modelo:criar` (só para o uso direto no Ollama) |
| Conferir se melhorou | — | `npm run avaliar:treino` e `npm run cerebro:avaliar` |

## Formato dos arquivos de conhecimento

```
---
titulo: Nome do arquivo
fonte: https://link-oficial        (vira a referência das respostas)
atualizado: 2026-10-13
tipo: curado                       (ou autogerado)
prioridade: 2                      (0,5 a 3; arquivos mais confiáveis pontuam mais)
revisao: pendente                  (anotação para a equipe: conteúdo ainda não validado pelo sindicato)
gatilhos: palavra, outra palavra   (termos que ajudam a achar o arquivo)
---
```

Cada seção `## Título` vira um trecho independente (até ~1.700 caracteres). Por isso:
- **Escreva o título como o usuário perguntaria** e, se quiser, acrescente `Variações:` com outras formas da pergunta (a linha ajuda a busca e não vai ao modelo).
- **Uma ideia por seção**, com a resposta completa. Seções curtas (até ~600 caracteres) dão respostas mais rápidas e mais fiéis.
- Marque como "(orientação geral)" o que não for fato do sindicato nem texto de lei.
- Não use "como visto acima": cada seção precisa fazer sentido sozinha.

## Proteções contra invenção

O modelo é pequeno: escreve bem frases curtas e copia bem, mas interpreta mal e inventa quando precisa resumir. Por isso:
- **Antes do modelo:** dados pessoais são removidos; caso jurídico individual, saudação e fora do escopo são decididos por regra; os números dos indicadores chegam
  como frases prontas ("abriu 16.439 vagas", "caiu em relação ao valor anterior"), para o modelo não ter de interpretar sinal nem variação.
- **Sem fonte:** a SINDI diz que não conseguiu confirmar e indica o contato. Só as áreas de orientação (comercial, RH, custos) e os pedidos de redação respondem com método geral.
- **Depois do modelo:** a verificação de fatos reprova e-mail, site, telefone, valor em reais, número de lei e **qualquer número** (percentual, decimal ou de três dígitos
  ou mais) que não esteja nas fontes nem na pergunta; o modelo reescreve e, se falhar de novo, responde só com o contato oficial.
- **Limite que continua:** a verificação não pega afirmação sem número (uma definição errada, um número certo atribuído ao assunto errado). Para esses casos, escreva a
  resposta de referência em `conhecimento/` e acrescente a pergunta em `avaliacao/`.

## Conjuntos de avaliação

| Arquivo | Para quê | Comando |
|---|---|---|
| `avaliacao/treino-v1.md` | Perguntas da comunicação do sindicato (versão 1.0): resposta final, tempo e área | `npm run avaliar:treino` |
| `avaliacao/perguntas-ouro.md` | Trava de regressão da publicação do `auto/` (confere a evidência) | `npm run cerebro:avaliar` |
| `avaliacao/perguntas-ouro-ampliado.md` | 62 perguntas por categoria; confere a evidência | `npm run cerebro:avaliar -- --arquivo=perguntas-ouro-ampliado.md` |
| `avaliacao/parafrases-reserva.md` e `-2.md` | **Reservados**: nunca copiar para o cérebro. Medem a busca | `npm run cerebro:comparar -- --arquivo=parafrases-reserva-2.md` |
| `avaliacao/adversariais.md` | Fora de escopo, sem fonte, jurídico, injeção, dados pessoais (resposta final) | `npm run cerebro:avaliar -- --arquivo=adversariais.md --modelo --so-resposta` |

Quando a SINDI errar uma resposta: (1) corrija ou acrescente o fato em `conhecimento/`; (2) acrescente a pergunta em `avaliacao/` com `espera:`; (3) rode a avaliação.
Assim cada erro vira um teste permanente.

## Rotina de manutenção

```
npm run dados:sync        # atualiza a biblioteca (o coletor contínuo já faz isso)
npm run cerebro:gerar     # recria cerebro/auto/*.md a partir dos dados
npm run cerebro:indexar   # recalcula os vetores da busca por significado
npm run cerebro:avaliar   # perguntas de ouro (evidência)
npm run avaliar:treino    # perguntas de treinamento (resposta final e tempo)
npm run modelo:medir      # velocidade de leitura e escrita do modelo neste computador
```

## O que é "treinar" aqui, e o que não é

- **Conhecimento (fatos): arquivos + biblioteca.** O fato fica onde pode ser corrigido, datado e citado. Treinar o modelo com fatos os "grava" nos pesos, não se
  atualiza quando a convenção muda e não permite citar a fonte.
- **Comportamento (tom, formato, recusas): regras, exemplos e conectores.** É o ensino que funciona num modelo pequeno sem placa de vídeo.
- **Ajuste fino (LoRA):** só faria sentido para tom e formato, com centenas de pares de pergunta e resposta revisados, e exige placa de vídeo para treinar.
  As perguntas de `avaliacao/` e as respostas de `conhecimento/` são a base para isso, se um dia for decidido.
