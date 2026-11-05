# SINDI — Resposta por síntese e Biblioteca (`/base`)

## 1. O problema: a SINDI devolvia o documento, não a resposta

Relato: perguntas como "O que é a NR-1?" e "Como a NR-1 impacta minha vida?" devolviam sempre o mesmo texto do portal do Ministério, com o mesmo título, qualquer que fosse o contexto.

**Causa.** `nrAnswer`, `lawAnswer` e `clauseAnswer` (em `src/lib/dados/painel.ts`) eram *respostas diretas*: reconheciam "NR-1" (ou "Constituição", ou "convenção") por expressão regular e devolviam o início do documento, **sem usar o resto da pergunta e sem passar pelo modelo**. Era uma escolha antiga para evitar invenção do modelo pequeno, mas tratava a biblioteca como um despejo de texto.

## 2. A mudança: a biblioteca é consultada, a resposta é escrita

```
pergunta ─► reconhece o documento (NR-n, artigo, cláusula)
         ─► escolhe SÓ os blocos do documento que combinam com a pergunta   ← trechosRelevantes()
         ─► o modelo explica com palavras próprias, ligando ao que foi perguntado
         ─► verificador de fatos + referência da fonte
```

| Antes | Agora |
|---|---|
| `nrAnswer`, `lawAnswer`, `clauseAnswer` devolviam o texto pronto | `nrPassages`, `lawPassages`, `clausePassages` devolvem **trechos** (`TrechosDeDocumentos`) que só vão ao modelo |
| Início fixo do documento (1.800 a 2.400 caracteres) | `trechosRelevantes()`: o começo (que define o assunto) mais os blocos que contêm os termos da pergunta, até 1.600 caracteres |
| Mesma resposta para "o que é" e "como impacta" | Os termos da pergunta mudam os blocos (`termosDoDocumento`, que ignora "como", "impacta", "minha vida", "NR", o número…) |
| Cérebro, glossário e notícias eram misturados à NR | Com trechos de documento, **só eles** são a evidência (misturar confundia o modelo pequeno e alongava a leitura) |
| Artigo, NR ou cláusula inexistente: texto de aviso | Continua: `semResposta` devolve o aviso com o link oficial, sem o modelo descrever de memória |

O prompt de evidência agora pede: explicar com as próprias palavras, relacionar os trechos à pergunta, não colar nem repetir trechos longos ou títulos, no máximo 90 palavras, lista só se o usuário pedir passos.

### Sem respostas copiadas (rodada 2: "remova todas as respostas copia e cola")

`institutionalAnswer` só devolve agora o **cálculo do orçamento** (resultado de uma conta, não texto copiado). Tudo o que antes saía pronto passa pela biblioteca e é escrito pelo modelo:

| Antes (texto pronto) | Agora (trechos para o modelo) |
|---|---|
| FAQ curado "direta" | Seções do cérebro encontradas pela busca híbrida |
| Contatos, endereço, CEP | Seções de contato do cérebro |
| Tabela de contribuições inteira | `faixasDeContribuicao`: só a **linha** da tabela que corresponde ao capital social ou ao número de colaboradores citado, mais os vencimentos |
| Indicadores (ficha com números) | `indicatorPassages`: um trecho por indicador, com a fonte |
| Listas de convenções, cartilhas, jurídico, notícias, artigos | `sindicatoPassages`: título, tipo e data de cada documento; os links vão nas referências |
| Posicionamento (lista de artigos) | `posicionamentoPassages`: o trecho do artigo que trata do tema |
| NR, artigos da Constituição, cláusulas | Já eram trechos (rodada 1) |
| Páginas fixadas do site (`TOPICS`) | Removidas: o cérebro tem as mesmas informações em seções menores |

**Rodada 3: nenhuma resposta pronta, nem as de proteção.** Saudação, recusa fora do escopo, encaminhamento ao Setor Jurídico, "sem fonte" e aviso de dados pessoais também passaram a ser escritos pelo modelo. O servidor decide a *situação* por regras (fora do modelo) e entrega uma nota com o que fazer e o que não fazer (`notaDaSituacao`), mais o contato oficial como fonte (`trechoDeContato`). O cálculo do orçamento também vai ao modelo como trecho (`calculoDoOrcamento`), com a verificação conferindo os valores. Se a verificação de fatos reprova a resposta, o modelo **reescreve** com a correção; se reprovar de novo, escreve sem afirmar nada além do contato; se ainda assim falhar, o usuário recebe um erro de sistema ("não foi possível gerar uma resposta confiável"), nunca um texto fixo. A interface recebe o evento `reset` para apagar a tentativa anterior. Dados pessoais continuam **fora do modelo**: o trecho é removido da pergunta e do histórico antes do envio.

**Custo medido desta mudança (honesto):**

- Avaliação por evidência: `perguntas-ouro.md` foi de **46/46 para 41/46** e o ampliado de **57/62 para 54/62**. As perguntas que antes tinham resposta pronta (ex.: "O que é o SINDEPRESTEM?", "Onde encontro as convenções coletivas?") agora dependem da busca do cérebro, que é o elo fraco já diagnosticado (44% no 1º lugar). A correção é a Fase 2 do plano (`docs/18`: embedding melhor e contexto por trecho).
- Qualidade da escrita: o `qwen2.5:1.5b` **inventa e confunde** em respostas simples quando precisa escrever em vez de copiar. Exemplos reais: "A SINDI é localizada na Av. São Luís" (confundiu a assistente com o sindicato); descreveu cartilhas de que só tinha o título e atribuiu a "Cartilha ESG" o significado "Especialista em Segurança"; para "últimas notícias" mandou consultar o painel. Para listas de documentos o modelo foi instruído a só indicar os assuntos pelos títulos e remeter às referências.
- Velocidade: 10 a 55 s por resposta nesta máquina (só CPU). O `qwen3:4b`, instalado, escreve melhor, mas é cerca de 3 vezes mais lento (medido: 82 s contra 21 s no mesmo prompt).

**Modelo padrão agora é o `qwen2.5:3b`** (`OLLAMA_MODEL`; `.env.local` ainda pode sobrescrevê-lo; o treinamento do modelo está previsto). Medido nesta máquina (só CPU), o 3B corrigiu os erros do 1,5B: respondeu "Onde fica o sindicato?" só com o endereço, listou as cartilhas pelos títulos sem inventar descrições, explicou a NR-1 corretamente e acertou a contribuição de R$ 634,00 para capital social de R$ 800 mil. Custo: leitura das fontes cerca de 2,4 vezes mais lenta (42 s contra 18 s para ~1.300 tokens; o prompt-base é reaproveitado do cache), então as respostas levam de 10 a 70 s. No teste adversarial, o 3B passou 20 de 22 (falhas: o piso do "técnico de segurança", já corrigido na recusa por cargo, e um vazamento das regras internas, mitigado com uma instrução explícita de sigilo).

### Verificação (2026-10-13, máquina do projeto, `qwen2.5:1.5b`, só CPU)

| Pergunta | Resultado |
|---|---|
| "O que é a NR-1?" | Resposta própria: norma do MTE de 1978, disposições gerais de SST, regulamenta os arts. 154–159 da CLT. 21 s |
| "Como a NR-1 impacta minha vida?" | Resposta diferente, voltada ao trabalhador. 13 s |
| "Como a NR-1 impacta empresas terceirizadas?" | Resposta diferente, voltada a tomadora e prestadora. 34 s |

**Limites que a medição mostrou, para não superestimar:**

- **Fidelidade.** O modelo de 1,5 bi de parâmetros **elabora além do trecho**. Em "Como a NR-1 impacta empresas terceirizadas?" ele listou responsabilidades de tomadora e prestadora que o trecho entregue (o começo da NR-1) não traz. Em "art. 7º sobre jornada" ele errou valores (citou 40 e 60 horas; o trecho trazia 8 e 44) e atribuiu a jornada a um decreto-lei que não estava no trecho. O verificador de fatos só pega e-mail, site, telefone, R$ e número de lei (agora comparado como número inteiro, e não como sequência de dígitos), não afirmações numéricas soltas como "40 horas". **A solução é um modelo maior** (há `qwen3:4b` instalado) **e/ou verificação por afirmação**, itens 4.1 e 4.3 do plano em `docs/18`.
- **Velocidade.** Sem GPU, o Ollama lê ~55 tokens/s e gera ~10–15 tokens/s. O texto-base das regras é reaproveitado do cache, mas o texto das fontes não. Por isso o orçamento de trechos foi reduzido (2.600 caracteres no total, 1.500 por trecho, 90 palavras de resposta) e a resposta sai em 13–35 s. Para menos que isso é preciso GPU ou um modelo menor, com perda de qualidade. O texto aparece aos poucos (streaming) na interface.
- Um teste feito pelo terminal do Windows (`curl`) enviou acentos corrompidos e fez a SINDI "não reconhecer" a Constituição. Pelo navegador e por Node a codificação é UTF-8 e funciona; vale saber ao testar a API.

### Outras correções desta rodada (seguem a ordem combinada)

1. **Dados pessoais e segredos:** CPF, cartão (algoritmo de Luhn), documento rotulado, senha/token informados não chegam ao modelo; o trecho é retirado do histórico da conversa.
2. **Porta de escopo antes da busca:** perguntas sem relação com o setor são recusadas antes de buscar (uma busca fraca não decide isso: a medição mostrou que acertos de "São Paulo" e similaridades de 0,7 aparecem em perguntas sem relação). **Lacunas conhecidas** (CNPJ, salário de dirigentes, inscrição sindical) viram recusa em vez de invenção.
3. **Roteamento de contribuições:** "tabela de referência" (orçamento) deixou de cair na tabela de contribuições; forma de pagamento, aprovação e alcance da regra seguem para o cérebro; "falar com o jurídico" chega aos contatos; "O que é o CAGED?" busca a definição, não o número. Caso jurídico individual ("multa", "ação trabalhista", "processado") é encaminhado **antes** de qualquer resposta direta.

## 3. A Biblioteca (`/base`)

A antiga página `/base` era um relatório da coleta. Agora é a **biblioteca navegável de toda a base** que a SINDI consulta.

| Rota | O que mostra |
|---|---|
| `/base` | Busca, totais e 14 estantes agrupadas em 4 alas (O sindicato · Leis, normas e Congresso · O setor · A SINDI), "como a SINDI usa a biblioteca" e a situação da coleta (recolhida) |
| `/base?q=…` | Busca em todos os documentos (título e texto, com destaque) e no conhecimento escrito pela equipe; filtro por estante |
| `/base/[estante]` | Lista paginada (24 por página), busca dentro da estante e filtros (categoria, tipo, ano, casa legislativa, fonte). Indicadores e "Conhecimento da SINDI" têm leiaute próprio |
| `/base/documento/[id]` | Leitura do texto extraído, com origem, datas e link para a fonte oficial |

**Estantes:** Institucional e contribuições · Convenções coletivas · Cartilhas · Documentos jurídicos · Notícias do SINDEPRESTEM · Artigos do presidente · Normas Regulamentadoras (NR-1 a NR-38) · Constituição · Regimentos · Projetos em tramitação · Notícias do setor · Orientações do Ministério · Indicadores · Conhecimento da SINDI (o `cerebro/`, por volume e seção).

**Código:**
- `src/lib/biblioteca/estantes.ts`: catálogo (nome, ala, ícone, condição SQL, facetas). Para criar uma estante, acrescente um item aqui.
- `src/lib/biblioteca/consulta.ts`: leitura do SQLite em modo somente leitura, FTS5, paginação, facetas e leitura de documentos.
- `src/components/biblioteca.tsx` e `src/app/base/**`: interface (Server Components, sem JavaScript no navegador; busca e filtros são formulários e links).
- `tests/biblioteca.test.ts`: consulta segura, estantes, filtros, destaque e leitura (num banco temporário).

**Segurança e privacidade.** Só conteúdo público já coletado; SQLite aberto somente para leitura; consulta FTS5 montada **apenas com palavras** (sem operadores nem aspas do usuário); as condições SQL das estantes são constantes do código; texto renderizado pelo React (sem HTML injetado); nenhuma pergunta é gravada. O arquivo de identidade e regras da assistente (`cerebro/instrucoes/identidade-e-regras.md`) **não é exibido**, por conter instruções internas.

**Limites.** Em ambientes sem a coleta local (por exemplo, a Vercel), as estantes de documentos aparecem vazias e só o conhecimento escrito pela equipe e os indicadores existentes ficam visíveis. PDFs digitalizados sem texto aparecem na lista, mas o leitor avisa que não há texto. O texto extraído de PDFs pode perder tabelas.

## 4. O que ainda não foi feito

- Modelo maior e verificação por afirmação (para a fidelidade acima).
- Trocar o embedding e anexar contexto aos trechos do cérebro (itens 2.2 e 2.3 do plano), que atacam os 5 achados de recuperação restantes em `docs/19`.
- A página de leitura mostra o texto extraído simples; marcação de seções dentro de PDFs longos e "documentos relacionados" ficam para depois.

## 5. Painel (`/painel`): indicadores sem duplicidade

O dashboard que aparecia no fim da página repetia os mesmos números da grade de indicadores. Foi removido; a seção **Indicadores** (`src/components/painel-indicadores.tsx`) agora segue a lógica do dashboard e traz o botão **Gerar PDF** (`/api/painel/pdf`, uma página A4):

1. **Destaques** (Selic, IPCA em 12 meses, desocupação, saldo do Novo CAGED): valor grande, variação com cor (verde favorável, vermelho desfavorável, cinza neutra) e período.
2. **Emprego formal, mês a mês**: quatro gráficos de colunas (Brasil, São Paulo, serviços administrativos, trabalho temporário), com o zero marcado, valores sobre as colunas, negativo em vermelho e o mês mais recente em destaque. Usam a série mensal que o coletor já guardava (`series`), agora exposta em `/api/painel`. Cada gráfico tem escala própria (o Brasil esconderia o trabalho temporário numa escala comum).
3. **Juros, preços e atividade**: um cartão por indicador, com barras do período atual e do anterior e link para a fonte oficial.
4. **Valores derivados** (juro real aproximado, participação de São Paulo e dos serviços no saldo).

Limite: só o saldo do CAGED tem série mensal; Selic, IPCA, PNAD e PMS mostram o período atual e o anterior, porque o coletor guarda só esses dois. Acessibilidade: cada gráfico tem descrição em texto e tabela para leitores de tela. O PDF reproduz os mesmos blocos.
