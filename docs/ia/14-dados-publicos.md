# Dados públicos coletados (painel e chat)

Coleta local de dados públicos de fontes oficiais, armazenados em arquivos neste computador. Nenhum serviço externo é usado para guardar os dados.

## Fontes da primeira etapa

| Fonte | Como é lida | O que entra |
|---|---|---|
| SINDEPRESTEM | Cópia dos documentos coletados por `knowledge:sync` (sem releitura do site), classificados por seção, mais leitura diária das páginas de convenções, jurídico e cartilhas para rotular cada PDF com o título oficial | Ver seção abaixo |
| IBGE | API SIDRA e API de notícias | Desocupação (PNAD), IPCA mensal e 12 meses, volume de serviços (PMS), notícias |
| Banco Central | API SGS, série 432 | Meta Selic (data de início da vigência e meta anterior) |
| Câmara dos Deputados | API de dados abertos | Proposições sobre terceirização, trabalho temporário, jornada, 6x1, contribuição sindical, reforma trabalhista; situação e último andamento |
| Senado Federal | API de dados abertos (`/processo`) | Mesmas palavras-chave; situação e data |
| TST | Página de notícias e artigos (HTML, `robots.txt` respeitado) | Notícias e decisões divulgadas |
| WEC | Sitemaps do WordPress por tipo (news, press_release, publication, event, opinion_piece) | Notícias e publicações em inglês |
| Ministério do Trabalho e Emprego | HTML do portal gov.br (`robots.txt` respeitado): listagem de notícias paginada e árvore `/assuntos` por fila de rastreamento gradual | Notícias, NRs, normas, serviços |
| Novo CAGED | FTP oficial do MTE (`CAGEDMOV` mensal, `.7z`), baixado com `curl` e extraído com o `tar` do Windows; somado em fluxo e apagado | Saldo mensal: Brasil, São Paulo, seção N (serviços administrativos e complementares) e locação de mão de obra temporária (CNAE 7820-5) |
| Constituição Federal | Página única do Planalto (windows-1252), verificada 1 vez por dia com requisição condicional | Um documento por artigo, incluindo o ADCT |
| Regimentos | PDFs oficiais cujo link é lido das páginas www2.camara.leg.br e www25.senado.leg.br, verificados 1 vez por semana | Regimento Interno da Câmara, do Senado e Regimento Comum, um documento por artigo |

Portal do Ministério: o rastreamento cobre `/assuntos` e a seção da Comissão Tripartite Paritária Permanente (Normas Regulamentadoras vigentes, NR-1 a NR-38). Páginas que entregam PDF têm o texto extraído. Arquivos anexos (PDFs, planilhas) ligados a essas páginas não são baixados.

Fora do escopo atual: jurisprudência completa do TST; anexos do portal do Ministério; ajustes posteriores do CAGED (declarações fora do prazo e exclusões).

O saldo do CAGED é o do arquivo `CAGEDMOV` do mês, a mesma base do número divulgado pelo Ministério (conferido: agosto/2026 = 165.827 e julho/2026 = 58.568, iguais às manchetes do MTE). Revisões posteriores não são aplicadas.

A Câmara bloqueia robôs de IA por nome em `robots.txt` no portal; por isso só a API aberta é usada, nunca o portal.

## SINDEPRESTEM por seção

Cada documento recebe `meta.section`. Totais atuais: notícias ~3.900 (desde 2020), convenções coletivas 142 PDFs (Geral, Portaria, Poupatempo, Promoção e merchandising, Leiturista, Promotores de crédito, Bombeiros; São Paulo e Jundiaí; 2001 a 2027), jurídico 45 PDFs, cartilhas 9 PDFs, artigos 26 (posts assinados pelo presidente), institucional, contribuições e filiação, contato.

- Os PDFs ficam com o título que a página oficial dá ao link (ex.: "Convenção Coletiva - Portaria - 2025/2026"). Títulos genéricos (errata, comunicado) ganham a categoria lida no próprio documento; títulos repetidos recebem o código do arquivo. Cartilhas, que a página não rotula, recebem o título lido no início do PDF.
- **Sem texto extraível:** 3 cartilhas e 3 PDFs jurídicos são imagens digitalizadas. Ficam listados e com link, mas sem texto até haver reconhecimento óptico (OCR).
- Na planilha: abas Institucional, Convenções, Jurídico, Cartilhas, Artigos e Notícias SINDEPRESTEM.
- No painel: "Notícias do SINDEPRESTEM" e "Artigos recentes".
- No chat: "O que é o SINDEPRESTEM?" cita Sobre/Missão/Visão/Valores da página oficial; contatos vêm da página de contato; listas de convenções (por categoria e ano), cartilhas, documentos jurídicos, notícias e artigos trazem título e link; perguntas sobre uma cláusula (piso, reajuste...) trazem trechos literais da convenção mais recente da categoria, com link e aviso para conferir o documento e os aditivos.

## Armazenamento

- `.data/dados/sindi-dados.sqlite`: fonte de verdade. SQLite local (módulo `node:sqlite`, sem dependência), com busca de texto integral (FTS5) e hash por documento para detectar alterações.
- `.data/dados/sindi-dados.xlsx`: planilha gerada automaticamente a cada coleta (abas Indicadores, uma por fonte e Coletas). Células de texto levam um trecho de 3.000 caracteres; o texto integral fica no SQLite. A pasta `.data/` não é versionada.

## Frequência e carga nas fontes

- Ciclo a cada 30 minutos (`DADOS_INTERVAL_MINUTES` altera). Só páginas novas são baixadas: o ciclo custa uma página de índice por fonte mais os artigos novos; indicadores e proposições usam APIs.
- Intervalo mínimo entre requisições ao mesmo domínio (0,4 s em APIs, 1 s em HTML), 3 tentativas com espera crescente em 429/5xx, `robots.txt` respeitado em HTML, somente HTTPS, User-Agent identificável.
- A maioria dos indicadores (IPCA, PNAD, PMS) é divulgada uma vez por mês: ciclos mais curtos não os atualizam mais cedo. Intervalos abaixo de 30 minutos só valem para notícias e tramitação, e aumentam a carga proporcionalmente.
- Um único processo escritor (`sync.lock`). Uma fonte com falha não interrompe as outras; cada coleta fica em `runs`.

## Uso

```
npm run dados:sync                 # uma coleta (recente)
npm run dados:sync -- --full       # preenche também o histórico (mais requisições)
npm run dados:sync -- --only=ibge,camara
npm run dados:watch                # a cada 30 min, em primeiro plano
powershell -File scripts/dados/start-dados.ps1   # a cada 30 min, em segundo plano (log em .data/dados/worker.log)
```

## Na SINDI

- `/api/painel` (somente leitura) alimenta a faixa de indicadores no topo do chat e a página `/painel` (indicadores, projetos em pauta, notícias, situação das fontes). Só dados públicos agregados; nada do chat é gravado.
- Chat: perguntas sobre Selic, IPCA, desemprego e volume de serviços recebem o número oficial direto, sem o modelo. Perguntas sobre projetos na Câmara/Senado e novidades do TST/WEC/IBGE recebem uma lista com links gerada dos dados coletados. Demais perguntas que citam essas fontes usam trechos como evidência, com citação.
- A SINDI não determina vigência jurídica nem situação atual de projetos: cada resposta aponta para o link oficial.
