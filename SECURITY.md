# Segurança

Atualização autorizada: cotas internas de mensagens removidas. Painel /uso público apenas com agregados de consumo, sem conteúdo, IP ou chave. Métricas persistidas localmente em .data ou em Redis para hospedagem compartilhada. Falha na coleta não bloqueia geração. Validação de entrada e origem permanecem. A cota de mensagens (por IP e global, por dia) protege os limites do provedor; o IP é guardado só como hash, com validade de dois dias.

Segredos ficam em variáveis de ambiente privadas. Conversas existem apenas na aba, mas cada pergunta é enviada à API do Gemini (Google) para gerar a resposta. No nível gratuito o Google pode usar esse conteúdo para melhorar seus produtos. A SINDI remove dados pessoais e segredos antes do envio (`redigirDadosSensiveis`), a tela avisa para não enviar dados pessoais ou confidenciais e a chave (`GEMINI_API_KEY`) existe só no servidor.

Em incidente: desabilitar o endpoint ou retirar o deploy, revogar chaves comprometidas, gerar substitutas, atualizar variáveis e verificar o uso registrado em /uso. Não incluir segredos no relatório. Canal responsável de segurança ainda deve ser designado pelo SINDEPRESTEM antes da publicação.

Limitação: chat público sem autenticação não diferencia colaboradores, associados e visitantes. Não pode fornecer dados internos nem garantir limites por pessoa. Origem validada reduz abuso por navegadores, mas não autentica requisições externas.

## Serviço de IA
A geração e a busca por significado usam a API do Gemini no nível gratuito, sem Ollama nem modelo local. Nenhum plano pago ou faturamento deve ser habilitado sem autorização. Métricas locais funcionam também em npm start; armazenamento efêmero da Vercel continua bloqueado sem Redis, e sem Redis a cota fica na memória de cada processo.
