# Implementação

Atualização autorizada: cotas internas removidas; sem teto de 500 tokens ou corte de resposta. Painel público /uso e GET /api/usage, com dados diários de requisições, erros, duração e usage do Gemini. Arquivo .data local (servidor único) ou Redis compartilhado. Falha na coleta não bloqueia geração. Substitui a arquitetura de limitadores descrita anteriormente.

Escopo aprovado em 09/10/2026; 5–10 participantes no teste. Figma/FigJam dispensados.

App Router Next.js. Cliente envia até 13 mensagens: seis trocas anteriores e pergunta atual. Schema valida alternância de papéis, tamanho, idioma e tom. Instruções institucionais somente no servidor. AI SDK generateText + Google; sem retries automáticos para preservar cota. Perguntas e respostas renderizadas com react-markdown e remark-gfm: negrito, listas, links Markdown e URLs automáticas. HTML bruto ignorado; links restritos a HTTP, HTTPS e mailto; imagens externas não carregadas. Até 500 tokens de saída. Timeout 25 segundos.

Redis REST com incremento atômico e expiração para limites compartilhados. Contadores em memória somente em desenvolvimento. Falha de Redis bloqueia geração. Sem provisionamento externo realizado.

Variáveis: chave Google, modelo, URL/token Redis e limite diário global. Sem banco de conversas, Supabase, login ou anexos. Gemini real e Redis real ainda dependem das contas do usuário. Testes de validação e proteção não substituem teste integrado com chave real.

Hospedagem pretendida Vercel. Hobby institucional requer resolver elegibilidade. Cloudflare é alternativa futura que exige adapter de runtime e tratamento de IP específico; não é troca automática de configuração.
