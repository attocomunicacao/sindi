# SINDI — Conectores e treinamento da versão 1.0

> Como os dois documentos da comunicação do SINDEPRESTEM (as perguntas de treinamento e o posicionamento em seis áreas) viraram arquivos que ensinam a SINDI.
> Escrito em 13/10/2026. As medições estão em `docs/ia/21-fluxo-e-modelo-reduzido.md`.

## 1. Do documento ao arquivo

| No documento da comunicação | Onde ficou | Tipo |
|---|---|---|
| Posicionamento: "ajuda o empresário a entender o que está mudando, identificar o que afeta sua empresa e organizar o que precisa fazer" | `cerebro/instrucoes/identidade-e-regras.md` | regras-base (toda conversa) |
| 1. Legislação trabalhista e segurança jurídica | `cerebro/conectores/02-legislacao-e-seguranca-juridica.md` | conector |
| 2. Inteligência de mercado e relatórios setoriais (**SINDI Relatórios**) | `cerebro/conectores/03-inteligencia-setorial-e-relatorios.md` | conector, com modo relatório |
| 3. Comercial, contratos e propostas (**SINDI Comercial**) | `cerebro/conectores/04-…` + `cerebro/conhecimento/comercial-propostas.md` | conector + orientação geral |
| 4. RH, recrutamento e qualificação (**SINDI RH**) | `cerebro/conectores/05-…` + `cerebro/conhecimento/rh-recrutamento.md` | conector + orientação geral |
| 5. Custos, tributação e planejamento | `cerebro/conectores/06-…` + `cerebro/conhecimento/custos-e-tributos.md` | conector + checklist |
| 6. Relacionamento com o Sindeprestem (**SINDI Responde**) | `cerebro/conectores/07-relacionamento-com-o-sindeprestem.md` | conector |
| "Perguntas para testar a segurança e a confiabilidade" | `cerebro/conectores/01-sobre-a-sindi-e-limites.md` + `cerebro/conhecimento/sindi-confiabilidade.md` | conector + respostas de referência |
| As perguntas de treinamento | `cerebro/avaliacao/treino-v1.md` | avaliação (`npm run avaliar:treino`) |
| "Notícias e boletins, Podprestem, cartilhas, atuação institucional" como fonte | A biblioteca (`/base`), pesquisada pelas estantes de cada conector | 4.022 notícias, 26 artigos, 10 cartilhas, 272 projetos de lei, NRs, indicadores |

## 2. O que é um conector

Um arquivo Markdown com quatro informações que o código usa e o resto para a equipe:

```
gatilhos   → palavras que identificam a área (a escolha é por contagem, sem chamar o modelo)
estantes   → onde a SINDI pesquisa na biblioteca para essa área
relatorio  → expressões que pedem um panorama (indicadores + publicações + projetos)
modo       → fontes (sem fonte não responde) ou orientacao (pode dar método geral)
palavras   → tamanho máximo da resposta
## Como responder → a única parte enviada ao modelo, junto com as fontes (até 420 caracteres)
```

O conector não guarda fatos. Ele decide **onde procurar** e **como responder**; os fatos vêm de `cerebro/conhecimento/` e da biblioteca. Formato completo e regras
dos gatilhos em `cerebro/conectores/README.md`.

### Exemplo: "O que o Sindeprestem está fazendo em relação à NR-1?"

Era o exemplo do documento de posicionamento. Antes, a SINDI devolvia o início do texto da NR-1 do portal do Ministério. Agora:

1. A pergunta é sobre a **atuação da entidade** e cita a NR-1 → pesquisa nas estantes de notícias, artigos e cartilhas, exigindo "NR-1" no texto.
2. Fontes entregues ao modelo: "NR-1: Palestras do Workshop disponíveis no Youtube", "Fenaserhtt participa de audiência no STF sobre regras da NR-1" (16/09/2026)
   e "NR-1 e riscos psicossociais: participe do nosso Workshop!" (10/03/2026), cada uma com a data.
3. O modelo redige com a orientação do conector (dizer a data, indicar onde acompanhar) e as referências levam às três publicações.

## 3. As perguntas de treinamento

`cerebro/avaliacao/treino-v1.md` tem, por pergunta, a **área** e o **resultado esperado** (`espera:` e `nao:`), que é o "próximo passo recomendado" do documento:
resposta de referência ou resultado esperado, fontes autorizadas e critério de avaliação.

| Bloco | Recebidas | No arquivo | Observação |
|---|---:|---:|---|
| Inteligência setorial | 20 | 20 | — |
| Comercial | 0 de 20 | — | **Não vieram no texto colado** (só a aba "Inteligência setorial" foi copiada). Seção reservada no arquivo |
| RH | 0 de 20 | — | **Não vieram.** Seção reservada no arquivo |
| Essenciais sobre o Sindeprestem | 10 | 10 | — |
| Segurança e confiabilidade | 10 | 10 | Com resposta de referência em `sindi-confiabilidade.md` |
| Perguntas-exemplo das seis áreas | 8 | 8 | Do documento de posicionamento |

Para acrescentar as 40 que faltam: copie o formato `## Pergunta?` / `categoria: comercial` / `espera: trecho | outro trecho` em `treino-v1.md` e rode
`npm run avaliar:treino -- --categoria=comercial`.

## 4. O que precisa de validação do Sindeprestem

O documento pede que "as respostas institucionais [sejam] validadas pelo Sindeprestem antes de serem incorporadas". Estes arquivos estão marcados com
`revisao: pendente` e foram escritos sem inventar fato institucional ou jurídico:

| Arquivo | O que contém | O que validar |
|---|---|---|
| `conhecimento/sindi-confiabilidade.md` | As dez respostas sobre limites da SINDI (descrevem o funcionamento real do sistema) | Redação e tom; a resposta sobre "serviços gratuitos" não afirma gratuidade e remete ao sindicato |
| `conhecimento/comercial-propostas.md` | Checklist de levantamento, estrutura de proposta, escopo (orientação geral de método) | Se o roteiro reflete a prática que o sindicato recomenda |
| `conhecimento/rh-recrutamento.md` | Seleção em volume, descrição de vaga, roteiro de entrevista, integração (orientação geral) | Idem; exigências legais ficaram de fora de propósito |
| `conhecimento/custos-e-tributos.md` | Itens de custo e tributos que a ferramenta de orçamento considera | Se a lista está completa para o setor; não há alíquotas além das da ferramenta |
| `conhecimento/trabalho-temporario-contratacao.md` | Documentos a pedir à empresa de trabalho temporário, o que o contrato precisa ter, responsabilidade subsidiária da tomadora e o caso de falência — tudo da Lei nº 6.019/1974 com a redação da Lei nº 13.429/2017, citando os artigos | A lista "(orientação geral)" do que pedir antes de contratar e se o Jurídico quer acrescentar algo que não está na lei |
| `conhecimento/glossario.md` → FENASERHTT | Nome por extenso (tirado de notícia do sindicato de 24/09/2025) e relação com o SINDEPRESTEM | A descrição da diferença de atuação entre as duas entidades |
| `conhecimento/faq.md` → duas seções novas | Onde consultar publicações; como acompanhar mudanças regulatórias | Endereços das páginas e canais que o sindicato quer indicar |

## 5. Lacunas de conteúdo encontradas (a SINDI responde "não consegui confirmar" ou com material antigo)

| Pergunta | O que falta na biblioteca |
|---|---|
| Quais cursos, eventos e iniciativas estão disponíveis aos associados? | Uma agenda atual. Hoje a resposta vem da lista de benefícios e de notícias de eventos passados |
| Quais são as principais pautas defendidas em Brasília? | Uma página-resumo das pautas. As notícias tratam uma pauta por vez |
| Quais serviços da SINDI estão disponíveis gratuitamente? | A decisão do sindicato sobre o que é gratuito e o que será Premium |
| Quais segmentos de serviços apresentam maior crescimento? | Indicador por segmento. A coleta tem o volume de serviços agregado (IBGE/PMS) e o CAGED em quatro recortes |
| Indicadores de empregabilidade dos jovens | Não há indicador de jovens na coleta; só notícias, a maioria de 2022 |
| Compare os indicadores de emprego nos últimos 12 meses | A série mensal do CAGED guardada tem 3 meses (06 a 08/2026); os demais indicadores têm só o período atual e o anterior |
| Transcrições do Podprestem, conteúdo de cursos e palestras | Não coletados. Só as notícias que anunciam os episódios e eventos |

Cada lacuna se resolve com conteúdo, não com modelo: uma seção em `cerebro/conhecimento/` (com a fonte) ou um novo coletor em `src/lib/dados/collectors/`.

## 6. O que ficou para a Premium (conforme o documento)

Nada disto foi implementado, por decisão do próprio posicionamento: trabalhar com informações próprias de cada empresa, relatórios personalizados por perfil
(segmento, localização, interesses), cálculo tributário e simulação financeira, análise de contratos e automação de processos. A versão atual não coleta nem guarda
dados de empresas; o "resumo do mês" é o mesmo para todos (indicadores, publicações e projetos recentes).
