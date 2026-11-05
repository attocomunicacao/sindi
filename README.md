# SINDI

Assistente virtual do SINDEPRESTEM para empresas de terceirização, trabalho temporário e prestação de serviços. Next.js, TypeScript, Tailwind, shadcn/ui e Lucide,
com modelo de linguagem **local** (Ollama) neste computador. Sem login, sem histórico de conversas, sem chamadas a provedores de IA externos.

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

1. Instale e abra o Ollama: https://ollama.com/download/windows
2. Baixe as bases e crie os modelos da SINDI:
   ```
   ollama pull qwen2.5:3b
   ollama pull qwen2.5:1.5b
   ollama pull nomic-embed-text
   npm ci
   npm run modelo:criar
   ```
3. `npm run dev` e abra http://localhost:3000

Sem `.env.local` valem os padrões de [`.env.example`](.env.example). Nenhuma chave é necessária.

## Modelos e consumo

| Modelo | Base | Usado para | Memória |
|---|---|---|---|
| `sindi` | qwen2.5:3b | respostas com fatos (legislação, relatórios, sindicato, comercial, RH, custos) | ≈ 2,2 GB |
| `sindi-rapido` | qwen2.5:1.5b | saudação, recusas e encaminhamentos | ≈ 1,2 GB |
| `nomic-embed-text` | — | busca por significado no cérebro | ≈ 0,4 GB |

Padrões pensados para rodar só no processador: contexto de 4.096 tokens, threads = núcleos lógicos menos 4, até 2 fontes por resposta, limite de palavras por área,
modelos descarregados após 20 minutos sem uso. Ajustes por variável de ambiente (`SINDI_NUM_THREAD`, `SINDI_NUM_CTX`, `SINDI_KEEP_ALIVE`, `SINDI_MAX_FONTES`,
`SINDI_MODELO_RAPIDO`, `OLLAMA_MODEL`). `OLLAMA_MODEL=sindi-rapido` usa só o modelo pequeno: mais rápido e mais leve, mas, medido, troca e inventa fatos.

## Ensinar a SINDI

Tudo em [`cerebro/`](cerebro/README.md): corrigir um fato (`conhecimento/`), mudar como uma área responde (`conectores/`), mudar a regra geral (`instrucoes/`).
Depois: `npm run cerebro:indexar` e `npm run avaliar:treino`. O mapa das áreas e das perguntas de treinamento está em
[`docs/ia/22-conectores-e-treinamento.md`](docs/ia/22-conectores-e-treinamento.md).

## Comandos

| Comando | Para quê |
|---|---|
| `npm run dev` / `build` / `start` | Aplicação |
| `npm run lint` / `typecheck` / `test` | Verificações (com `npm run build` e `npm audit --audit-level=high`) |
| `npm run modelo:criar` / `modelo:medir` | Cria os modelos `sindi` e `sindi-rapido` / mede leitura e escrita neste computador |
| `npm run avaliar:treino` | Responde as perguntas de `cerebro/avaliacao/treino-v1.md` no chat em execução: tempo, área, resposta |
| `npm run cerebro:gerar` / `indexar` / `avaliar` / `comparar` | Resumos automáticos, vetores, perguntas de ouro, comparação da busca |
| `npm run dados:sync` / `dados:watch` | Coleta de dados públicos (uma vez / contínua) |
| `npm run knowledge:sync` / `knowledge:watch` | Espelho do site (base antiga) |
| `powershell -File scripts/operacao/publicar.ps1` | Sobe o servidor de produção, o túnel e atualiza o endereço público |
| `powershell -File scripts/operacao/parar.ps1` | Encerra a publicação |

## Chat e consumo

Sem cota de mensagens da aplicação. Perguntas de até 1.500 caracteres; ao modelo vão a pergunta atual e as duas últimas trocas, encurtadas. Uma geração por vez
por processo; pedidos cancelados na fila não iniciam geração. O texto aparece conforme o modelo escreve (NDJSON); o botão **Parar** (ou Esc) cancela a leitura no
navegador e a geração no servidor. Se a verificação de fatos reprova a resposta, o modelo reescreve (a tela apaga a tentativa anterior).

O painel público `/uso` mostra 7 ou 30 dias de requisições, respostas, erros, duração média e tokens informados pelo Ollama. Só números agregados: sem mensagens,
IPs ou credenciais. Localmente os agregados ficam em `.data/usage.json`; na Vercel, em Upstash Redis, se configurado. Respostas vindas da memória de respostas
contam como requisição, sem tokens.

## Publicação

O endereço público fixo é um repasse na Vercel para um túnel Cloudflare que sai deste computador e chega à aplicação (nunca ao Ollama). O computador precisa ficar
ligado, com o Ollama aberto. Roteiro, verificação e limites em [`docs/operacao/23-publicacao.md`](docs/operacao/23-publicacao.md).

## Privacidade e limites

Não envie dados pessoais ou confidenciais: CPF, cartão e senha detectados são removidos antes de chegar ao modelo, e nada da conversa é gravado. A SINDI pode errar;
as respostas trazem as referências para conferência. Casos jurídicos concretos são encaminhados ao Setor Jurídico do SINDEPRESTEM. Segurança em
[`SECURITY.md`](SECURITY.md) e [`docs/seguranca/`](docs/seguranca).
