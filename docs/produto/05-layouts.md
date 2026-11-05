# Layout

## Princípios
Minimalista, corporativo, direto. Sem textos de apoio desnecessários. Animações leves (entrada de 350–500 ms, sem movimento contínuo exceto o indicador de resposta) e desativadas com `prefers-reduced-motion`. Somente português.

## Referências (tier list de 10)
Busca em roundups públicos de interfaces de chat (Eleken, Arounda, Lazarev, Kaily) e julgamento de projeto. A classificação é uma avaliação nossa, não um ranking publicado.

| Tier | Referência | O que foi aproveitado |
|---|---|---|
| S | Claude | coluna única estreita, mensagens bem espaçadas, paleta suave |
| S | Notion AI | espaço em branco generoso, poucos elementos, sugestões discretas |
| S | Microsoft Copilot | separação nítida entre pergunta e resposta, tom sóbrio |
| A | Mistral Le Chat | chat minimalista, campo de entrada como único foco |
| A | Meta AI | blocos de mensagem bem separados |
| A | IBM watsonx / Carbon | tom institucional, hierarquia tipográfica rígida |
| A | Stripe Docs | tipografia limpa, filetes finos em vez de caixas |
| B | Intercom Fin | sugestões como ações rápidas |
| B | Linear | cabeçalho enxuto, navegação com indicador de página atual |
| B | Perplexity | fontes citadas junto da resposta |

## Estrutura
1. Cabeçalho fixo: logotipo SINDEPRESTEM (em chip claro nos dois temas), SINDI, navegação (Orçamento, Painel, Fontes, Uso), nova conversa e tema.
2. Faixa de indicadores (dados públicos já existentes).
3. Coluna do assistente (máx. 48 rem). Vazio: filete dourado, SINDI, uma linha de descrição e três sugestões em lista. Com conversa: pergunta à direita em bloco neutro, resposta à esquerda com filete dourado.
4. Campo de mensagem fixo no rodapé da coluna, botão circular Enviar e uma linha de aviso.
5. Páginas internas reutilizam o mesmo cabeçalho.

## Cores
Grafite `#2D2727`, dourado `#EBB92E` e vermelho `#B61323` (logotipo e site do SINDEPRESTEM). Todas as cores vêm de tokens em `globals.css` (escalas `slate`/`amber` redefinidas, mais `canvas`, `surface`, `primary`); o tema escuro inverte os tokens, sem regras por classe. Contraste de todo texto verificado ≥ 4,5:1 nos dois temas.

## Biblioteca (/base)
Acervo apresentado como índice formal, sem ícones decorativos nem cartões coloridos: filete dourado, título "Biblioteca", busca, e estantes agrupadas por ala em linhas separadas por filetes finos (número de ordem, nome, descrição e contagem à direita; cabeçalho de ala com linha grafite). "Como a SINDI usa o acervo" é uma lista numerada de quatro etapas. Estantes e resultados usam o mesmo padrão: filtros como texto com sublinhado dourado no item ativo, itens em linhas, etiquetas com filete lateral. Documentos em PDF do SINDEPRESTEM abrem o PDF original embutido.

## Orçamento (/orcamento)
Mesmo padrão da Biblioteca: filete dourado e título, seções numeradas (01 Seus dados, 02 Postos, 03 Materiais, 04 Tributos) com linha grafite, postos separados por filetes (sem cartões), resumo lateral sóbrio com linha grafite no topo e botões de PDF.

## Marca da SINDI (cabeçalho)
O cabeçalho é único, no layout raiz, e fica montado entre páginas; por isso a marca troca de glifo em vez de reiniciar. É um balão de conversa fixo no canto esquerdo (sem o texto SINDI; o link tem o nome acessível "SINDI, início") que guarda o glifo da página, como uma ferramenta que se troca. Todos os glifos têm quatro elementos e ocupam a mesma altura (caixa de 80×32 unidades, com margem interna de cerca de 11 no balão; os glifos de 56 de largura ficam centralizados):
| Página | Glifo |
|---|---|
| Início | as quatro figuras do logotipo, com a geometria extraída do PNG oficial (IoU de 99,3% nas três preenchidas; contorno a menos de 3,5 px de 1555): grafite, vermelho, dourado e só contorno |
| Orçamento | moeda dourada e barras de crescimento |
| Painel | quatro painéis (indicador alto, dois cartões e uma faixa) |
| Biblioteca | quatro livros, o último inclinado |
| Uso | medidor com ponteiro |
Animação: o balão é fixo (sem animação de contorno); na entrada e em toda troca o glifo antigo cai (0,3 s) e o novo sobe em sequência (0,5 s). Hover: os elementos saltam em onda. Sem movimento com `prefers-reduced-motion`. Navegação: Início, Orçamento, Painel, Biblioteca, Uso; "Nova conversa" aparece só na página inicial. O logotipo original segue em `public/brand/sindeprestem-logo.png`.

## Carregamento
`src/app/loading.tsx` (padrão do Next para qualquer página lenta): o cabeçalho permanece e o conteúdo mostra uma barra dourada de progresso e um esqueleto no desenho de índice das páginas (título e cinco linhas). Aparece só se a página demorar mais de 150 ms, para não piscar nas rápidas. Anunciado a leitores de tela como "Carregando…". Sem movimento com `prefers-reduced-motion`.

## Faixa de indicadores (tela inicial)
Linha compacta, sem link extra (o Painel fica na navegação), sempre em uma linha a partir de 1024 px, com os 4 indicadores principais (Selic, IPCA 12m, Desocupação, CAGED Brasil, rótulos curtos). Rótulo 14 px, valor 16 px em negrito, variação curta com ícone (a frase completa fica para leitores de tela); quebra de linha em telas estreitas, sem rolagem lateral. Mais legível que os 12 px anteriores, sem disputar o foco com a SINDI.
