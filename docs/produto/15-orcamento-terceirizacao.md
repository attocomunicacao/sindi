# Orçamento de terceirização

Ferramenta da SINDI (`/orcamento`) para o empresário que contrata mão de obra terceirizada estimar o custo mensal e anual de postos de trabalho (ex.: 3 auxiliares de limpeza diurno e 3 noturno) e baixar dois PDFs: o **orçamento** e o **relatório de custo detalhado**.

## Base de cálculo
A tabela de preços e a lógica vêm da planilha de referência (abas Resumo, Inserção de dados e Encargos Sociais). `scripts/dados/extrair-tabela-orcamento.py` gera `src/lib/orcamento/tabela.json`; `src/lib/orcamento/calculo.ts` e `encargos.ts` reimplementam as fórmulas.

Custo por funcionário/mês = salário + periculosidade (30%) + insalubridade (% do salário mínimo) + adicional noturno (20% do salário-hora × horas noturnas, mais DSR 8/22) + horas extras
→ **encargos sociais** (84,2359% da folha: grupos A 36,8%, B 26,91%, C 10,64%, D 9,89%, com base legal)
→ + benefícios (cesta básica, vale-refeição, vale-transporte líquido de 6%, assistência social familiar, seguro de vida) + PCMSO/PPR + uniformes + EPIs (+ insumos e equipamentos opcionais).
Preço = custo ÷ (1 − (BDI 3% + lucro 3% + ISS + PIS + COFINS + CSLL + IRPJ)): tributos e margem incidem sobre o faturamento, como no Resumo da planilha.

Verificação: com os dados do exemplo da planilha, encargos (84,2359%), folha, benefícios e PCMSO/PPR conferem exatamente; o total difere só pelos 3 ajustes abaixo (testado em `tests/orcamento.test.ts`).

## Ajustes em relação à planilha (também listados no relatório de custo)
1. Kit de uniforme da função "auxiliar de limpeza com periculosidade" e do operador de máquina: na planilha a quantidade estava zerada.
2. EPIs só entram para as funções orçadas (a planilha somava R$ 17,00 de protetores auriculares sem funcionário).
3. Horas extras: DSR pela razão 8/22 sobre o valor das horas (a fórmula original reaproveitava a do adicional noturno).

## Pontos de atenção
- Os valores são os da planilha (ex.: salário mínimo R$ 1.212, auxiliar de limpeza R$ 1.384,65); **confirmar vigência** e a convenção coletiva da categoria. As funções de limpeza seguem a convenção de asseio e conservação, não a do SINDEPRESTEM (a CCT Geral do SINDEPRESTEM exclui essas empresas).
- Funções sem salário na planilha ficam "sob consulta": auxiliar de atendimento, fiscal de piso, oficial de manutenção/hidráulica, bombeiro civil, eletricista, limpador de vidros, mensageiro.
- Turno noturno: 180 horas noturnas por funcionário/mês (valor do exemplo de portaria da planilha), editável por posto.
- Kits de EPI seguem a planilha, que soma três calçados por funcionário por mês para limpeza; vale revisar.

## Segurança e privacidade
O cálculo roda no servidor com a tabela fixa (o navegador só envia função, quantidade, turno e opções). A API valida o corpo (zod), exige a mesma origem do chat, limita o tamanho (64 KB) e não grava nem registra dados. Os PDFs são gerados na hora (`pdf-lib`).

## Uso
`/orcamento` (formulário com cálculo ao vivo); no chat, "preciso de um orçamento para 3 auxiliares de limpeza diurno e 3 noturno" devolve a estimativa e o link da ferramenta com os postos preenchidos.
