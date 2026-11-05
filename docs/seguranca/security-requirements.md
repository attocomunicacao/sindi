# Requisitos de segurança

Atualização do usuário: retirar cotas de mensagens da aplicação e adicionar métricas públicas sem dados pessoais. Preservar origem, validação e timeouts. Falha na coleta não pode bloquear chat; informar ausência de configuração no painel. Cotas do Gemini continuam válidas.

Validar entrada, origem e papéis; segredos no servidor; limites atômicos compartilhados; bloquear geração com configuração ausente; não renderizar HTML gerado; não registrar conversas; expiração dos contadores. Sem autorização diferenciada porque não há login. Não usar dados internos. Nova conversa apaga somente a conversa na aba.

Antes de publicar: testar Gemini e Redis reais, rever política de dados e plano de hospedagem, atribuir responsável, executar scanners e testes, avaliar alertas. Não tratar resultado de scanner personalizado como substituto de Gitleaks/Semgrep/OWASP ZAP.
