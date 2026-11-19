# Segurança

## Como reportar uma vulnerabilidade
**Contato de segurança: pendente.** O dono do repositório ainda precisa designar o canal (por exemplo, um e-mail do SINDEPRESTEM ou os avisos privados de segurança do GitHub em *Security > Report a vulnerability*) e preencher esta seção. Enquanto isso, não abra uma issue pública com detalhes de uma falha.

Ao reportar, descreva o que foi encontrado, como reproduzir e o impacto, **sem incluir segredos, dados pessoais nem conteúdo de conversas reais**. A resposta esperada: confirmação em até 5 dias úteis e correção ou plano em até 30 dias, conforme a gravidade (prazos a confirmar pelo dono).

## Escopo
Está no escopo: o site e a API (chat, orçamento, painel, biblioteca, rotas de PDF), a coleta de dados públicos, a base de conhecimento e a configuração de publicação (túnel, Vercel). Fora do escopo: os serviços de terceiros em si (Google, Vercel, Cloudflare, Supabase, Upstash) e ataques que exijam acesso físico ao computador que hospeda a SINDI.

## Resumo do modelo de segurança
- **Sem login e sem histórico de conversas.** O chat é público; há cota de mensagens por IP e global por dia (`src/lib/cota.ts`) e limite por minuto nas demais rotas. Painel `/uso` público só com agregados (sem conteúdo, IP ou chave); métricas em `.data` ou Redis.
- **Segredos só no servidor**, em variáveis de ambiente privadas (`.env.local`, nunca versionado). A chave do Gemini nunca vai ao navegador, à URL nem aos logs.
- **Privacidade da IA:** cada pergunta é enviada à API do Gemini (Google). No nível gratuito o Google pode usar esse conteúdo para melhorar seus produtos. A SINDI remove dados pessoais e segredos antes do envio (`redigirDadosSensiveis`), a tela avisa para não enviar dados pessoais ou confidenciais.
- **Validação de entrada e de origem** em toda rota (`src/lib/http/guarda.ts`). Uma falha na coleta não bloqueia a geração das respostas.

## Em caso de incidente
Desabilitar o endpoint ou retirar a publicação, revogar as chaves comprometidas, gerar substitutas, atualizar as variáveis de ambiente e conferir o uso registrado em `/uso`. Não incluir segredos no relatório.

## Limitações conhecidas
- O chat público sem autenticação não diferencia colaboradores, associados e visitantes: não pode fornecer dados internos nem garantir limites por pessoa. A origem validada reduz o abuso por navegadores, mas não autentica requisições externas; a cota por IP depende do cabeçalho de IP do repasse (`SINDI_IP_HEADER`).
- Há verificação automática de dependências (`npm audit` no CI) e de padrões inseguros (Semgrep), mas nenhum teste de intrusão externo.

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
