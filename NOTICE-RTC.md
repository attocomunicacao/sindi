# Aviso sobre a Calculadora RTC da Receita Federal

O SINDI usa, como serviços locais opcionais, as calculadoras oficiais da Receita Federal do Brasil para a Reforma Tributária do Consumo (CBS, IBS e Imposto Seletivo, LC 214/2025):

- https://github.com/ReceitaFederal/calculadora-rtc-regime-regular (versão 1.7.2, commit `f1eebd7`)
- https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional (versão 1.0.2, commit `a926d5a`)
- https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse (versão 1.0.0, commit `8d79e6b`; compilado em WASM e executado no Node só como referência de conformidade do porte do DANFSe, nunca em produção)

Como cada um é usado: o regime regular e o Simples Nacional conferem, ao centavo, a conta que o site faz sozinho (`npm run rtc:conferir`); o gerador de DANFSe confere o texto do PDF que o porte em TypeScript (`src/lib/danfse`) produz. Os serviços Java só respondem em `127.0.0.1` (variáveis `SINDI_RTC_REGIME_URL` e `SINDI_RTC_SIMPLES_URL`); sem eles, o site continua usando a própria conta. Para compilar o Go, o instalador baixa o Go 1.27.4 do go.dev (SHA-256 conferido) em `.tools/go`, sem instalar nada no Windows.

Os projetos são distribuídos sob a **licença MIT** (Receita Federal do Brasil), segundo o rótulo do GitHub. O código deles **não é copiado para este repositório**: eles são clonados em `.tools/rtc/` (pasta fora do git) por `scripts/operacao/rtc-instalar.ps1`, na versão fixada, e executados como serviços em `127.0.0.1`. O SINDI guarda apenas respostas de exemplo (`tests/fixtures/rtc/`) e a especificação OpenAPI dos serviços, para testes de conformidade.

Os resultados são **estimativas** para apoio ao orçamento e à análise de tributos: a própria calculadora marca como `CALCULO_SIMULADO` os cálculos com alíquotas informadas pelo usuário (as alíquotas de referência só estão publicadas para 2026), e a Receita informa que a calculadora não substitui os sistemas de autorização de documentos fiscais. Confirme com um profissional habilitado antes de uso comercial.
