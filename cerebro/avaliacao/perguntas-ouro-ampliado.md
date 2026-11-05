# Perguntas de ouro — conjunto ampliado

Perguntas com a resposta esperada, **extraídas do conteúdo real do cérebro em 2026-10-13** (nenhum valor foi inventado: cada `espera:` aparece nos arquivos curados ou autogerados). Complementa `perguntas-ouro.md`, que continua sendo o conjunto mínimo que o `publicar.ts` usa como trava de regressão.

Formato: `## pergunta`, `espera: a | b` (todos precisam aparecer), `nao: x | y` (nenhum pode aparecer) e `categoria:` (para o relatório). Uso:

```
npm run cerebro:avaliar -- --arquivo=perguntas-ouro-ampliado.md
```

Este modo confere a **evidência** entregue (resposta direta ou trechos). Para conferir a resposta final do modelo, acrescente `--modelo` com o chat em execução. Uma falha aqui é informação, não erro do teste: significa que a SINDI hoje não chega a esse fato. Antes de "consertar" uma pergunta, confirme o fato na fonte oficial.

### Diretoria

## Quem é o diretor financeiro?
espera: Maurice Braunstein
categoria: diretoria

## Quem é o diretor de comunicação?
espera: Danilo Padilha
categoria: diretoria

## Quem é o diretor administrativo?
espera: Edmilson Formentini
categoria: diretoria

## Quem é o diretor do trabalho temporário?
espera: Alessandro Ávila
categoria: diretoria

## Quem é o diretor ESG?
espera: André Vicente
categoria: diretoria

## Quem é o diretor de inovação e tecnologia?
espera: Carlos Henrique
categoria: diretoria

## Quem é o diretor institucional?
espera: José Augusto
categoria: diretoria

## Quem é o diretor de controle de acesso e bombeiro civil?
espera: Amauri Soares
categoria: diretoria

## Quem são os diretores suplentes?
espera: Maria Olinda | Paulo Icó
categoria: diretoria

## Quem compõe o conselho fiscal?
espera: Daniel Longato de Moura | Jacob Luiz Magnus | Pierre Rafiki Orfali
categoria: diretoria

## Quem preside a FENASERHTT?
espera: Vander Morales
categoria: diretoria

### Contribuições

## Quanto paga a contribuição associativa uma empresa com capital social de até R$ 500.000?
espera: 431,00
categoria: contribuicoes

## Qual a contribuição associativa para capital social acima de R$ 6.000.000?
espera: 2.589,00
categoria: contribuicoes

## Qual a contribuição confederativa para empresa sem colaboradores?
espera: 143,00
categoria: contribuicoes

## Qual a contribuição confederativa para capital social acima de R$ 3.850.000?
espera: 6.710,00
categoria: contribuicoes

## Em que dia vence a contribuição negocial?
espera: dia 10
categoria: contribuicoes

## Qual o teto da contribuição negocial por CNPJ?
espera: 1.600 | 2.000,00
categoria: contribuicoes

## Quanto custa por trabalhador a contribuição negocial?
espera: 1,25
categoria: contribuicoes

## Como funciona o pagamento por cartão de crédito das contribuições?
espera: setor financeiro
categoria: contribuicoes

## A contribuição associativa vale para empresa filiada?
espera: apenas a empresas associadas
categoria: contribuicoes

## Quando foi aprovada a contribuição patronal em vigor?
espera: 09 de Dezembro de 2025
categoria: contribuicoes

### Convenções coletivas

## Qual o piso do porteiro na convenção Portaria?
espera: 1.912,07
categoria: convencoes

## Qual o reajuste da convenção Geral em 2025?
espera: 6,87%
categoria: convencoes

## Qual a correção salarial dos bombeiros civis em setembro de 2025?
espera: 5,50%
categoria: convencoes

## Qual o piso do bombeiro civil aeródromo líder ou técnico em prevenção e combate ao incêndio?
espera: 3.828,40
categoria: convencoes

## Qual o piso do correspondente no país com 220 horas?
espera: 1.742,36
categoria: convencoes

## Qual o piso do leiturista informatizado com entrega simultânea?
espera: 2.132,84
categoria: convencoes

## Qual o reajuste da convenção dos leituristas em 2025?
espera: 4,87%
categoria: convencoes

## Qual o piso do demonstrador, degustador ou promotor de trade marketing?
espera: 1.699,23
categoria: convencoes

## Quais categorias têm convenção coletiva no site?
espera: Portaria | Poupatempo | Leiturista | Bombeiros
categoria: convencoes

### Institucional

## Há quantos anos o SINDEPRESTEM atua?
espera: 35 anos
categoria: institucional

## Qual a visão do SINDEPRESTEM?
espera: principal liderança sindical patronal
categoria: institucional

## Qual o telefone da comunicação?
espera: 99205-3371
categoria: institucional

## O que a empresa filiada não faz que a associada faz?
espera: assembleias
categoria: institucional

## O que a empresa associada tem de benefício além da assessoria jurídica?
espera: clipping | certidão negativa
categoria: institucional

## Qual o nome completo do SINDEPRESTEM?
espera: Sindicato das Empresas de Terceirização e Trabalho Temporário do Estado de São Paulo
categoria: institucional

### Setor e trabalho temporário

## Qual a prorrogação permitida do trabalho temporário?
espera: 180 | 90
categoria: temporario

## Qual lei alterou a Lei 6.019/74?
espera: 13.429
categoria: temporario

## Quem pode prestar o trabalho temporário?
espera: Ministério do Trabalho
categoria: temporario

## Qual a diferença entre terceirização e trabalho temporário?
espera: prazo | prestadora
categoria: temporario

## Para que serve o trabalho temporário segundo o sindicato?
espera: sazonais | substituição
categoria: temporario

### Glossário

## O que é DSR?
espera: descanso semanal remunerado
categoria: glossario

## O que é PCMSO?
espera: Programa de Controle Médico de Saúde Ocupacional
categoria: glossario

## O que é BDI?
espera: benefícios e despesas indiretas
categoria: glossario

## Quanto é o adicional noturno na tabela de referência?
espera: 20%
categoria: glossario

## Quanto são os encargos sociais da tabela de referência?
espera: 84,24
categoria: glossario

## Qual a faixa do ISS no orçamento?
espera: 2% a 5%
categoria: glossario

## O que é o saldo do CAGED?
espera: admissões menos desligamentos
categoria: glossario

### Orçamento e ferramentas

## Quais funções ficam sob consulta no orçamento?
espera: bombeiro civil | eletricista
categoria: orcamento

## Quantas horas noturnas o orçamento usa por padrão?
espera: 180
categoria: orcamento

## O orçamento é uma proposta comercial?
espera: estimativa
nao: proposta vinculante
categoria: orcamento

## Quais PDFs a ferramenta de orçamento gera?
espera: relatório de custo
categoria: orcamento

## O que o painel do setor mostra?
espera: Selic | IPCA
categoria: orcamento

### Limites e privacidade

## A SINDI grava minhas conversas?
espera: não é gravada
categoria: limites

## A SINDI faz modo de conversa por voz?
espera: voz
categoria: limites

## A SINDI pode dar parecer jurídico?
espera: Setor Jurídico
categoria: limites

## Quais documentos a SINDI não consegue ler?
espera: digitalizad
categoria: limites

## Como falar com o jurídico?
espera: juridico@sindeprestem.com.br
categoria: limites

### Documentos

## Quais cartilhas existem sobre ESG?
espera: ESG
categoria: documentos

## Quantos documentos há na página Jurídico?
espera: 45
categoria: documentos

## Com que frequência o painel é atualizado?
espera: 30 minutos
categoria: documentos

## Quais fontes alimentam o painel?
espera: IBGE | Banco Central | Câmara
categoria: documentos
