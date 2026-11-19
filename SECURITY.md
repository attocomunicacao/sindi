# Segurança

Atualização autorizada: cotas internas de mensagens removidas. Painel /uso público apenas com agregados de consumo, sem conteúdo, IP ou chave. Métricas persistidas localmente em .data ou em Redis para hospedagem compartilhada. Falha na coleta não bloqueia geração. Validação de entrada e origem permanecem.

Segredos ficam em variáveis de ambiente privadas. Conversas existem apenas na aba e são processadas pelo modelo local (Ollama) no servidor da aplicação, sem envio a provedores de IA externos. Não inserir dados pessoais ou confidenciais.

Em incidente: desabilitar o endpoint ou retirar o deploy, revogar chaves comprometidas, gerar substitutas, atualizar variáveis e verificar o uso registrado em /uso. Não incluir segredos no relatório. Canal responsável de segurança ainda deve ser designado pelo SINDEPRESTEM antes da publicação.

Limitação: chat público sem autenticação não diferencia colaboradores, associados e visitantes. Não pode fornecer dados internos nem garantir limites por pessoa. Origem validada reduz abuso por navegadores, mas não autentica requisições externas.

## Migração para Ollama
A geração é local, sem transmissão de conversas a terceiros. O endpoint Ollama é configurado somente no servidor. Não expor a porta 11434 à internet. A publicação na Vercel depende de um proxy remoto protegido ainda não configurado. Métricas locais funcionam também em npm start; armazenamento efêmero da Vercel continua bloqueado sem Redis.
