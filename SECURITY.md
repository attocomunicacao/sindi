# Segurança

Atualização autorizada: cotas internas de mensagens removidas. Painel /uso público apenas com agregados de consumo, sem conteúdo, IP ou chave. Métricas persistidas localmente em .data ou em Redis para hospedagem compartilhada. Falha na coleta não bloqueia geração. Validação de entrada e origem permanecem. A cota de mensagens (por IP e global, por dia) protege os limites do provedor; o IP é guardado só como hash, com validade de dois dias.

Segredos ficam em variáveis de ambiente privadas. Conversas existem apenas na aba, mas cada pergunta é enviada à API do Gemini (Google) para gerar a resposta. No nível gratuito o Google pode usar esse conteúdo para melhorar seus produtos. A SINDI remove dados pessoais e segredos antes do envio (`redigirDadosSensiveis`), a tela avisa para não enviar dados pessoais ou confidenciais e a chave (`GEMINI_API_KEY`) existe só no servidor.

Em incidente: desabilitar o endpoint ou retirar o deploy, revogar chaves comprometidas, gerar substitutas, atualizar variáveis e verificar o uso registrado em /uso. Não incluir segredos no relatório. Canal responsável de segurança ainda deve ser designado pelo SINDEPRESTEM antes da publicação.

Limitação: chat público sem autenticação não diferencia colaboradores, associados e visitantes. Não pode fornecer dados internos nem garantir limites por pessoa. Origem validada reduz abuso por navegadores, mas não autentica requisições externas.

## Serviço de IA
A geração e a busca por significado usam a API do Gemini no nível gratuito, sem Ollama nem modelo local. Nenhum plano pago ou faturamento deve ser habilitado sem autorização. Métricas locais funcionam também em npm start; armazenamento efêmero da Vercel continua bloqueado sem Redis, e sem Redis a cota fica na memória de cada processo.

## Proteções de rotas e coleta
- `/api/atualizar` (dispara a coleta de dados) só responde no próprio computador: Host local e nenhum cabeçalho de repasse (Cloudflare, Vercel). O Host sozinho não basta.
- PDFs (`/api/orcamento/pdf`, `/api/painel/pdf`, `/api/biblioteca/pdf/[id]`) têm limite por minuto por visitante (`src/lib/limite.ts`); o PDF do painel fica pronto por 5 minutos e a cópia em disco dos PDFs da biblioteca tem validade (7 dias) e teto de arquivos e de bytes.
- A coleta de dados públicos (`politeFetch`) segue redirecionamentos à mão, validando cada destino (https, sem credenciais, porta 443, fora da rede interna e de IPs literais) e lê o corpo com teto de 30 MB mesmo sem `content-length`. Limite: não há proteção contra DNS que aponte um nome público para um endereço interno.
- Endereços de documentos coletados só são guardados se forem http, https ou ftp, sem credenciais, e todo link externo da biblioteca e do painel passa por `linkSeguro` (esquemas como `javascript:` viram `#`).
- A leitura do Supabase usa só a chave publicável; a Secret key fica restrita ao coletor que grava. `/api/knowledge` público devolve apenas `available` e `phase`.

## Testes de ataque
`tests/ataques.test.ts` e `tests/ataques-interface.test.tsx` tentam, em cada execução, o que um atacante tentaria: corpos gigantes e aninhados, `__proto__`, fuzz do orçamento, texto hostil no PDF, injeção de prompt, dados pessoais e chaves no pedido (e no histórico), logs com segredo, redirecionamentos a endereços internos em qualquer notação, truques de nome de domínio, origem e Host forjados, giro de IP para escapar da cota, cabeçalhos e nonce da CSP, XSS no Markdown e nos links das fontes. O que cada um protege está no nome do teste.

Detecção de dados sensíveis (`redigirDadosSensiveis`): CPF formatado, rotulado ou só com 11 dígitos válidos, documento rotulado, cartão (Luhn), senha/token rotulados e chaves de formato conhecido (Google, OpenAI/Anthropic, GitHub, Slack, AWS, JWT). **Não** detecta e-mail, telefone, endereço nem nome de pessoa: a SINDI não os trata como segredo, e a tela pede para não enviar dados pessoais. As perguntas anteriores também são redigidas antes da busca, inclusive a busca por significado, que usa o provedor de IA.

Limite conhecido (marcado como pendente no teste): um nome de domínio público que o DNS aponte para um endereço interno (ex.: `localtest.me`) não é bloqueado na coleta, porque só o nome é validado, não o endereço resolvido.
