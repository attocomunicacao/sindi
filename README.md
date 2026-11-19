# SINDI

Assistente virtual do SINDEPRESTEM para empresas de terceirização, trabalho temporário e prestação de serviços. Next.js, TypeScript, Tailwind, shadcn/ui e Lucide,
com modelo de linguagem pela **API gratuita do Gemini**. Sem login e sem histórico de conversas; há uma cota de mensagens por pessoa e por dia. No nível gratuito o Google pode usar as perguntas para melhorar seus produtos, por isso a SINDI remove dados pessoais antes de enviar.

A SINDI não é um modelo treinado com fatos do sindicato: ela consulta uma biblioteca (documentos coletados + conhecimento escrito pela equipe), entrega ao modelo
só os trechos que respondem à pergunta e confere a resposta antes de mostrar. O fluxo, o modelo e as medições estão em
[`docs/ia/21-fluxo-e-modelo-reduzido.md`](docs/ia/21-fluxo-e-modelo-reduzido.md).

## Estrutura

```
cerebro/        o que ensina a SINDI (Markdown; relido em até 5 s)
  instrucoes/   regras-base e exemplos enviados em toda conversa
  conectores/   uma área por arquivo: gatilhos, estantes da biblioteca e como responder
  conhecimento/ fatos e orientações escritos pela equipe
  auto/         resumos gerados dos dados coletados (não editar)
  avaliacao/    perguntas de teste
src/
  app/          páginas (/, /base, /painel, /orcamento, /uso) e rotas /api
  lib/cerebro/  conectores, instruções, busca no cérebro, embeddings, avaliação
  lib/biblioteca/ estantes de /base e a pesquisa que o chat faz nelas
  lib/knowledge/ orquestração da busca, verificação de fatos, proteções
  lib/dados/    coletores de fontes públicas, SQLite, painel
  lib/orcamento/ cálculo e PDF do orçamento de terceirização
scripts/
  modelo/       criar e medir os modelos locais
  cerebro/      gerar, indexar, avaliar e comparar a busca
  avaliacao/    perguntas de treinamento contra o chat em execução
  dados/        coleta de dados públicos
  operacao/     publicar e parar o endereço público
  (raiz)        coleta do espelho do site, usada pela tarefa agendada SINDI-Knowledge
modelo/         Modelfiles gerados (não editar)
deployment/     repasse do endereço fixo na Vercel
docs/           produto, ia, operacao, seguranca, imagens (índice em docs/README.md)
tests/          node:test via tsx
.data/ .tools/  dados locais, registros e ferramentas (fora do versionamento)
```

## Executar no computador

1. Crie uma chave gratuita do Gemini em https://aistudio.google.com/apikey.
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

O nível gratuito do Gemini tem limites por minuto e por dia (por modelo; veja os seus no AI Studio). Para não esgotá-los, a SINDI aplica uma **cota de mensagens**:
`SINDI_COTA_IP_DIA` (padrão 20) por pessoa e `SINDI_COTA_GLOBAL_DIA` (padrão 300) no total, por dia, no horário de São Paulo; `0` desliga. Resposta vinda da memória não
gasta cota. Sem Redis (Upstash) a contagem fica na memória do processo. Outros ajustes: `SINDI_MAX_FONTES`, `SINDI_CONCORRENCIA`, `SINDI_FILA_MAX` (todos em `env.example`).

**Privacidade:** no nível gratuito o Google pode usar o conteúdo enviado para melhorar seus produtos. A SINDI remove dados pessoais e segredos antes do envio e a tela avisa o usuário.

## Ensinar a SINDI

Tudo em [`cerebro/`](cerebro/README.md): corrigir um fato (`conhecimento/`), mudar como uma área responde (`conectores/`), mudar a regra geral (`instrucoes/`).
Depois: `npm run cerebro:indexar` e `npm run avaliar:treino`. O mapa das áreas e das perguntas de treinamento está em
[`docs/ia/22-conectores-e-treinamento.md`](docs/ia/22-conectores-e-treinamento.md).

## Comandos

| Comando | Para quê |
|---|---|
| `npm run dev` / `build` / `start` | Aplicação |
| `npm run lint` / `typecheck` / `test` / `check` | Verificações (com `npm run build` e `npm audit --audit-level=high`); `check` roda as três |
| `npm run test:e2e` | Testes de ponta a ponta e de acessibilidade (Playwright + axe), em desktop e celular; a primeira vez pede `npx playwright install chromium` |
| `npm run verificar:funcional` | Percorre páginas, rotas, PDFs e ferramentas no servidor em execução (`-- --chat` inclui uma pergunta real) |
| `npm run avaliar:treino` | Responde as perguntas de `cerebro/avaliacao/treino-v1.md` no chat em execução: tempo, área, resposta |
| `npm run cerebro:gerar` / `indexar` / `avaliar` / `comparar` | Resumos automáticos, vetores (usa `GEMINI_API_KEY`), perguntas de ouro, comparação da busca |
| `npm run dados:sync` / `dados:watch` | Coleta de dados públicos (uma vez / contínua) |
| `npm run knowledge:sync` / `knowledge:watch` | Espelho do site (base antiga) |
| `powershell -File scripts/operacao/publicar.ps1` | Sobe o servidor de produção, o túnel e atualiza o endereço público |
| `powershell -File scripts/operacao/parar.ps1` | Encerra a publicação |

## Chat e consumo

Cota de mensagens por pessoa e por dia (ver acima). Perguntas de até 1.500 caracteres; ao modelo vão a pergunta atual e as duas últimas trocas, encurtadas. Poucas gerações
ao mesmo tempo por processo e uma fila curta; acima disso o pedido é recusado. O texto aparece conforme o modelo escreve (NDJSON); o botão **Parar** (ou Esc) cancela a leitura no
navegador e a geração no servidor. Se a verificação de fatos reprova a resposta, o modelo reescreve (a tela apaga a tentativa anterior).

O painel público `/uso` mostra 7 ou 30 dias de requisições, respostas, erros, duração média e tokens informados pelo Gemini. Só números agregados: sem mensagens,
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
