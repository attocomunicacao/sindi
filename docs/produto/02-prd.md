# SINDI — requisitos propostos

Status: proposta para revisão.

Atualização aprovada: sem cotas de mensagens impostas pela SINDI; gráfico público em /uso. Substitui as propostas anteriores de limite por visitante/minuto/dia e teto de 500 tokens. Permanecem entrada validada, timeout e memória de seis trocas. Consumo agregado desde o início da coleta, em arquivo local ou Redis compartilhado. Nenhum erro de métricas bloqueia o chat.

## Funcionalidades

- Chat responsivo em uma página; envio por botão ou Enter, Shift+Enter para quebra de linha.
- Tom profissional (padrão), acolhedor ou técnico.
- Resposta em português (padrão) ou inglês. Preservar termos técnicos e explicar quando necessário.
- Conversa somente em memória da aba; recarregar ou Nova conversa elimina o histórico.
- Usar no máximo as últimas 6 trocas (12 mensagens) como contexto; informar essa janela na interface.
- Entrada de até 1.500 caracteres; resposta limitada a aproximadamente 500 tokens, ajustável após testes.
- Estados de carregamento, erro, limite atingido e serviço indisponível; impedir envios simultâneos.
- Proposta inicial: até 10 envios por visitante/dia e 3 por minuto. Valores dependem da cota real da conta e do volume esperado. A cota do provedor é compartilhada por todo o projeto.
- Limites aplicados no servidor com armazenamento compartilhado ou proteção equivalente da plataforma; contadores em memória de funções não garantem limites globais. Sem login, identificação por visitante/IP tem limitações e não garante identidade individual.

## Conhecimento

Base institucional curta, revisada, com URLs oficiais. Sem pesquisa automática em tempo real na primeira versão. Não afirmar que a SINDI conhece integralmente o site ou que notícias e documentos estão sempre atualizados.

Temas: serviços e associação, localização de documentos coletivos, terceirização e trabalho temporário, conteúdos e eventos do setor, redação e tradução relacionadas à atividade sindical.

Para cláusulas, valores, vigência de CCT e situações jurídicas individuais, orientar consulta ao documento oficial e ao atendimento jurídico. Não inventar dados nem apresentar opiniões como posição oficial da entidade.

## Tecnologia e dependências

Next.js, TypeScript, Tailwind, shadcn/ui e Lucide conforme o guia. Integração de IA no servidor com AI SDK e provedor Google direto, caso aprovado, para usar a cota gratuita Gemini sem depender de créditos intermediários. Modelo selecionado pela disponibilidade e cota efetiva no AI Studio. Sem Supabase para esta versão.

Gemini: https://ai.google.dev/gemini-api/docs/pricing
Limites: https://ai.google.dev/gemini-api/docs/rate-limits
Vercel: https://vercel.com/docs/limits/fair-use-guidelines

Dependências externas: projeto Gemini no nível gratuito, chave privada via variável de ambiente, projeto Vercel com plano compatível, GitHub para versionamento e CI. Não habilitar faturamento da IA nem contratar serviços sem autorização.

## Segurança e aceite

- Chaves somente no servidor, .env ignorados, .env.example sem segredos.
- Validar tamanho, papéis e quantidade das mensagens; cliente não define instruções de sistema.
- Aviso breve de que não devem ser enviados dados pessoais ou informações confidenciais. No nível gratuito Gemini, conteúdo pode ser usado para melhorar produtos do Google.
- Não registrar conteúdo de conversas em logs da aplicação.
- Validar origem das requisições e limitar abuso no servidor; bloquear geração quando limite for atingido.
- Testar conversa em PT/EN, mudança de tom, memória limitada, limpeza, falhas e limites. Testar teclado, celular, contraste e foco.
- Executar lint, TypeScript, build, npm audit, Gitleaks e Semgrep; documentar verificações indisponíveis. Configurar CI e Dependabot. Testar aplicação publicada antes de liberar uso.

Design detalhado dispensado pelo usuário; documentação técnica, segurança e validação continuam exigidas. Publicação somente após verificações e resolução das dependências.
