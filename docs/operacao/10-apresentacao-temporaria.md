# Apresentação com link temporário

Endereço fixo publicado posteriormente: https://sindi-prototipo.vercel.app. Acesso por Vercel → túnel abaixo → computador. Operação atual, origem autorizada e comandos de reinício em [13-endereco-fixo-vercel.md](13-endereco-fixo-vercel.md). Os IDs de servidor abaixo são da publicação anterior.

Versão atualizada aberta e verificada em 10/10/2026: https://course-describe-gains-opening.trycloudflare.com. Substitui o link anterior, cujo túnel foi encerrado. Painel público: /uso. Este endereço só funciona enquanto o túnel atual permanecer ativo.

Produção atual: Next.js em 127.0.0.1:3100, processo 7360; cloudflared processo 17268. Processos iniciados em segundo plano, sem janelas. Logs operacionais em .data/sindi-production.*.log e .data/cloudflared-current.*.log. Não contêm conteúdo de conversas adicionado pela aplicação. IDs valem somente nesta execução; antes de parar, conferir processo e caminho.

Verificação pública desta revisão: página HTTPS 200, /uso 200, chamada sintética ao modelo com 39 deltas NDJSON, primeiro delta em 1.743 ms e total 3.608 ms, conclusão e registro agregado confirmados. Origem externa rejeitada com 403; microfone restrito à própria origem, câmera e geolocalização desabilitadas. Interface pública inspecionada no navegador. Gitleaks em src: zero achados. Demais checks da revisão em docs/12-conversa-por-voz.md. Tempos são uma amostra de modelo aquecido, não garantia; áudio real em celulares permanece pendente.

Vercel: CLI autenticada como attocomunicacao; equipe atto-comunicacao no plano Hobby, sem projeto vinculado nesta pasta. Não foi feito deploy Vercel, contratado plano ou alterado DNS. Um endereço fixo pode usar túnel nomeado + domínio próprio no Cloudflare. Vercel também oferece domínio do projeto .vercel.app, mas exige conexão remota protegida para o Ollama e revisão da elegibilidade do plano para uso institucional. Não apontar um túnel público diretamente ao Ollama.

1. Deixe o Ollama aberto com qwen2.5:3b instalado.
2. Abra PowerShell nesta pasta e execute `npm run start -- --hostname 127.0.0.1 --port 3100` (se não estiver ativo). A versão de produção precisa de `npm run build` após alterações.
3. Em outro terminal, execute `.\.tools\cloudflared.exe tunnel --url http://127.0.0.1:3100`.
4. Use somente o endereço HTTPS trycloudflare.com exibido por esse terminal. Para encerrar o acesso, pare o túnel com Ctrl+C.

A porta 11434 do Ollama permanece local. Não apontar o túnel para ela. O servidor público é a aplicação SINDI, com validação de payload/origem e métricas agregadas locais. Ninguém precisa instalar algo no celular. O endereço muda ao reiniciar o túnel e não tem garantia de disponibilidade. Não há autenticação dos visitantes, conforme escopo; qualquer pessoa com o link pode usar o chat. É uma apresentação temporária, não operação pública permanente.

O computador precisa estar ligado, conectado, sem suspensão e com ambos os processos ativos. Uma resposta é gerada por vez neste processo da SINDI; visitantes simultâneos podem esperar. Reiniciar o computador encerra o servidor e o túnel; estes comandos não instalam serviço de inicialização automática.

Ferramentas oficiais portáteis estão em .tools (ignoradas pelo Git). Resultados de segurança em .data (ignorados pelo Git). A conta Cloudflare foi criada pelo usuário, mas o Quick Tunnel não depende do login nem altera DNS/planos da conta.
