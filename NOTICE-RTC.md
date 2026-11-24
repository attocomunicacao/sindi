# Aviso sobre a Calculadora RTC da Receita Federal

O SINDI usa, como serviços locais opcionais, as calculadoras oficiais da Receita Federal do Brasil para a Reforma Tributária do Consumo (CBS, IBS e Imposto Seletivo, LC 214/2025):

- https://github.com/ReceitaFederal/calculadora-rtc-regime-regular (versão 1.7.2, commit `f1eebd7`)
- https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional (commit `a926d5a`)
- https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse (commit `8d79e6b`, referência de conformidade do gerador de DANFSe)

Os projetos são distribuídos sob a **licença MIT** (Receita Federal do Brasil), segundo o rótulo do GitHub. O código deles **não é copiado para este repositório**: eles são clonados em `.tools/rtc/` (pasta fora do git) por `scripts/operacao/rtc-instalar.ps1`, na versão fixada, e executados como serviços em `127.0.0.1`. O SINDI guarda apenas respostas de exemplo (`tests/fixtures/rtc/`) e a especificação OpenAPI dos serviços, para testes de conformidade.

Os resultados são **estimativas** para apoio ao orçamento e à análise de tributos: a própria calculadora marca como `CALCULO_SIMULADO` os cálculos com alíquotas informadas pelo usuário (as alíquotas de referência só estão publicadas para 2026), e a Receita informa que a calculadora não substitui os sistemas de autorização de documentos fiscais. Confirme com um profissional habilitado antes de uso comercial.
