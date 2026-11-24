# SINDI

Assistente virtual do SINDEPRESTEM para empresas de terceirização, trabalho temporário e prestação de serviços. Next.js, TypeScript, Tailwind, shadcn/ui e Lucide,
com o modelo de linguagem numa **cascata de APIs gratuitas** (Gemini, Groq, OpenRouter, Mistral, Cloudflare) e um **modelo local de emergência** (Ollama): quando um provedor esgota o limite gratuito, o próximo responde, sem aviso ao usuário. Sem login e sem histórico de conversas; há uma cota de mensagens por pessoa e por dia. Nos níveis gratuitos os provedores podem usar as perguntas para melhorar seus produtos, por isso a SINDI remove dados pessoais antes de enviar.

A SINDI não é um modelo treinado com fatos do sindicato: ela consulta uma biblioteca (documentos coletados + conhecimento escrito pela equipe), entrega ao modelo
só os trechos que respondem à pergunta e confere a resposta antes de mostrar. O fluxo, o modelo e as medições estão em
[`docs/desenvolvimento/guia-do-desenvolvedor.md`](docs/desenvolvimento/guia-do-desenvolvedor.md) (histórico das medições de 13/10/2026 em `docs/historico/`).

## Estrutura

```
cerebro/        o que ensina a SINDI (Markdown; relido em até 5 s); o grafo dele aparece em /cerebro e no Obsidian (.data/obsidian/SINDI)
  instrucoes/   regras-base e exemplos enviados em toda conversa
  conectores/   uma área por arquivo: gatilhos, estantes da biblioteca e como responder
  conhecimento/ fatos e orientações escritos pela equipe
  auto/         resumos gerados dos dados coletados (não editar)
  avaliacao/    perguntas de teste
src/
  app/          páginas e rotas /api (finas)
  componentes/  interface por assunto (ui/, chat/, orcamento/, ...)
  lib/          base, infra, http, ia, chat, seguranca, recuperacao, cerebro, grafo,
                biblioteca, dados, agentes, pdf, ferramentas, rtc, orcamento, tributos, custos, danfse
                (mapa e regra de dependência no guia do desenvolvedor)
scripts/
  cerebro/      gerar, indexar, avaliar e comparar a busca
  avaliacao/    perguntas de treinamento contra o chat em execução
  dados/        coleta de dados públicos
  operacao/     publicar, parar, agendar a atualização, verificar, instalar e ligar as calculadoras da Receita (rtc-*.ps1)
  rtc/          conferência com as calculadoras oficiais da Receita (npm run rtc:conferir)
  (raiz)        coleta do espelho antigo do site (legado)
deployment/     repasse do endereço fixo na Vercel
docs/           produto, ia, operacao, seguranca, desenvolvimento, historico (índice em docs/README.md)
tests/          node:test via tsx
.data/ .tools/  dados locais, registros e ferramentas (fora do versionamento)
```

## Executar no computador

1. Crie ao menos uma chave gratuita: Gemini (https://aistudio.google.com/apikey), Groq (https://console.groq.com/keys), OpenRouter, Mistral ou Cloudflare Workers AI (instruções em `env.example`). Quanto mais provedores, mais respostas por dia.
   Opcional: `winget install Ollama.Ollama` e `ollama pull qwen2.5:3b` para o modelo local de emergência.
2. Copie `env.example` para `.env.local` (privado, nunca versionado) e preencha `GEMINI_API_KEY`.
3. Instale, indexe a busca por significado e rode:
   ```
   npm ci
   npm run cerebro:indexar
   npm run dev
   ```
4. Abra http://localhost:3000

Sem `GEMINI_API_KEY` o chat responde que o serviço de IA não está configurado; a busca continua só por palavras.

## Modelo, limites e cota

| Uso | Variável | Padrão |
|---|---|---|
| Respostas com fatos (legislação, relatórios, sindicato, comercial, RH, custos) | `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
| Saudação, recusas e encaminhamentos (opcional) | `GEMINI_MODEL_RAPIDO` | vazio (usa o principal) |
| Busca por significado no cérebro | `GEMINI_EMBED_MODEL` | `gemini-embedding-001` |

Cada provedor gratuito tem limites por minuto e por dia; a cascata (`SINDI_CASCATA`) pula quem esgotou e o painel `/uso` mostra quem respondeu. A estimativa com uma API paga (Claude Haiku) para funcionários e associados está na página oculta `/custos`. Para não esgotar os limites, a SINDI aplica também uma **cota de mensagens**:
`SINDI_COTA_IP_DIA` (padrão 20) por pessoa e `SINDI_COTA_GLOBAL_DIA` (padrão 300) no total, por dia, no horário de São Paulo; `0` desliga. Resposta vinda da memória não
gasta cota. Sem Redis (Upstash) a contagem fica na memória do processo. Outros ajustes: `SINDI_MAX_FONTES`, `SINDI_CONCORRENCIA`, `SINDI_FILA_MAX` (todos em `env.example`).

**Privacidade:** no nível gratuito o Google pode usar o conteúdo enviado para melhorar seus produtos. A SINDI remove dados pessoais e segredos antes do envio e a tela avisa o usuário.

## Ensinar a SINDI

Tudo em [`cerebro/`](cerebro/README.md): corrigir um fato (`conhecimento/`), mudar como uma área responde (`conectores/`), mudar a regra geral (`instrucoes/`).
Depois: `npm run cerebro:indexar` e `npm run avaliar:treino`. O mapa das áreas e das perguntas de treinamento está em
[`docs/ia/22-conectores-e-treinamento.md`](docs/ia/22-conectores-e-treinamento.md).

## Comandos

A lista completa (desenvolvimento, verificações, cérebro, coleta, publicação) fica em um só lugar: a seção Comandos de [`CLAUDE.md`](CLAUDE.md). Guia para mexer no código: [`docs/desenvolvimento/guia-do-desenvolvedor.md`](docs/desenvolvimento/guia-do-desenvolvedor.md).

## Chat e consumo

Cota de mensagens por pessoa e por dia (ver acima). Perguntas de até 1.500 caracteres; ao modelo vão a pergunta atual e as duas últimas trocas, encurtadas. Poucas gerações
ao mesmo tempo por processo e uma fila curta; acima disso o pedido é recusado. O texto aparece conforme o modelo escreve (NDJSON); o botão **Parar** (ou Esc) cancela a leitura no
navegador e a geração no servidor. Se a verificação de fatos reprova a resposta, o modelo reescreve (a tela apaga a tentativa anterior).

O painel público `/uso` mostra 7 ou 30 dias de requisições, respostas, erros, duração média e tokens informados pelos provedores, e quantas respostas cada provedor da cascata escreveu. Só números agregados: sem mensagens,
IPs ou credenciais. Localmente os agregados ficam em `.data/usage.json`; na Vercel, em Upstash Redis, se configurado. Respostas vindas da memória de respostas
contam como requisição, sem tokens.

## Publicação

O endereço público fixo é um repasse na Vercel para um túnel Cloudflare que sai deste computador e chega à aplicação (o modelo é uma API externa; nada
local precisa ficar aberto além da aplicação). O computador precisa ficar
ligado. Roteiro, verificação e limites em [`docs/operacao/23-publicacao.md`](docs/operacao/23-publicacao.md).

## Privacidade e limites

Não envie dados pessoais ou confidenciais: CPF, cartão e senha detectados são removidos antes de chegar ao modelo, e nada da conversa é gravado. A SINDI pode errar;
as respostas trazem as referências para conferência. Casos jurídicos concretos são encaminhados ao Setor Jurídico do SINDEPRESTEM. Segurança em
[`SECURITY.md`](SECURITY.md) e [`docs/seguranca/`](docs/seguranca).
