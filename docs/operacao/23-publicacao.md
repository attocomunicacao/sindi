# Publicação da SINDI (modelo local, site público)

> Vigente desde 13/10/2026. Substitui os roteiros manuais de `10-apresentacao-temporaria.md` e `13-endereco-fixo-vercel.md` por um comando.

**Endereço público:** https://sindi-prototipo.vercel.app

## Como funciona

```
navegador ──► https://sindi-prototipo.vercel.app      Vercel: só repassa (deployment/vercel-proxy/vercel.json); não recebe código, dados nem segredos
          ──► túnel Cloudflare (trycloudflare.com)    conexão de SAÍDA deste computador; nenhuma porta aberta no roteador
          ──► SINDI (Next.js) em 127.0.0.1:3100       valida origem e mensagem, busca na biblioteca, verifica a resposta, mede só agregados
          ──► Ollama em 127.0.0.1:11434               nunca exposto: só a aplicação fala com ele
```

Por que esta combinação: o modelo roda neste computador, então o site precisa de um caminho até ele. O túnel resolve isso sem abrir porta e sem expor o Ollama;
como o endereço do túnel rápido muda a cada início, a Vercel dá o endereço fixo. Tudo no plano gratuito já existente, sem domínio próprio.

| Alternativa | Por que não agora |
|---|---|
| Túnel Cloudflare **nomeado** com domínio próprio (ex.: `sindi.sindeprestem.com.br`) | É a opção mais estável (endereço fixo sem a Vercel no meio, com garantia de serviço), mas exige um domínio gerenciado na Cloudflare e decisão do sindicato. É o próximo passo recomendado para uso institucional |
| Hospedar a aplicação inteira na Vercel ou na Cloudflare | A aplicação lê a biblioteca em SQLite e fala com o Ollama por `localhost`; fora deste computador exigiria expor o Ollama por outro túnel e levar o banco junto |
| Abrir a porta do Ollama ou da aplicação na internet | Proibido pelas regras do projeto: sem autenticação e sem a validação da aplicação |

## Publicar ou reiniciar (um comando)

Com o Ollama aberto, na pasta do projeto:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/operacao/publicar.ps1
```

O script: confere o Ollama e os modelos (`sindi`, `sindi-rapido`); faz o build; encerra a publicação anterior; inicia o servidor de produção em `127.0.0.1:3100`
com a origem pública autorizada; abre o túnel (até quatro tentativas); grava o novo destino no repasse; publica o repasse na Vercel; e confere o endereço público.

| Opção | Efeito |
|---|---|
| `-SemBuild` | Reinicia sem recompilar (quando o código não mudou) |
| `-SemVercel` | Só o túnel: mostra um endereço temporário `trycloudflare.com`, sem atualizar o endereço fixo |
| `-Modelo sindi-rapido` | Usa só o modelo pequeno (mais rápido e leve; menos fiel às fontes) |
| `-SemAquecer` | Não prepara as respostas das perguntas frequentes (sem ele, o script as prepara em segundo plano, em 20 a 30 minutos; andamento em `.data/operacao/aquecer.log`) |

Para encerrar: `powershell -ExecutionPolicy Bypass -File scripts/operacao/parar.ps1`. O endereço público passa a devolver erro até a próxima publicação.

Registros em `.data/operacao/` (`next.*.log`, `cloudflared.log`, `tunel.url`, `*.pid`). Não contêm conversas.

**Depois de reiniciar o computador** é preciso rodar o script de novo: não há início automático configurado. Mudanças em `cerebro/` (regras, conectores,
conhecimento) valem na hora, sem republicar; mudanças de código exigem o script com build.

## O que precisa ficar ligado

Este computador, sem suspender, com internet; o Ollama aberto; o servidor e o túnel iniciados pelo script. Uma resposta é gerada por vez: quem pergunta ao mesmo
tempo espera na fila. Não há login: qualquer pessoa com o link usa o chat. É um protótipo de demonstração, não uma operação com garantia de disponibilidade
(o túnel rápido da Cloudflare não tem garantia de serviço).

## Verificação desta publicação (13/10/2026)

| Verificação | Resultado |
|---|---|
| `npm run lint`, `npm run typecheck`, `npm run build` | sem erros; o build emite um aviso do Turbopack (acesso dinâmico a arquivo em `src/lib/biblioteca/pesquisa.ts`), sem efeito no funcionamento |
| `npm test` | 88 testes, 0 falhas |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilidades em produção |
| `npm audit --audit-level=high` (com ferramentas de desenvolvimento) | 5 altas, todas na cadeia do `eslint-config-next` (`braces`), que não vai para produção; a correção oferecida é uma troca de versão com quebra |
| Gitleaks em `src`, `cerebro`, `scripts`, `deployment`, `docs`, `tests` | nenhum segredo |
| Páginas `/`, `/uso`, `/base`, `/painel`, `/orcamento` pelo endereço público | HTTP 200 |
| `POST /api/chat` com `Origin` de outro site | HTTP 403 |
| Pergunta pelo endereço público, com streaming ("Qual o prazo máximo do trabalho temporário?") | resposta correta com referências, 71 trechos de texto. Logo após reiniciar (modelo ainda fora da memória): 1ª palavra em 21,7 s, total 28,7 s; com o modelo carregado, na publicação anterior do mesmo dia: 7,3 s e 15,3 s |
| A mesma pergunta de novo | 0,4 a 0,9 s (memória de respostas) |
| 48 perguntas de treinamento contra o servidor de produção | mediana 22,3 s; detalhes em `docs/ia/21-fluxo-e-modelo-reduzido.md`, seção 5 |

**Não verificado nesta rodada:** nova varredura ZAP e Semgrep (as anteriores estão em `docs/seguranca/verification.md` e são de versões anteriores do código);
uso por várias pessoas ao mesmo tempo; teste em celular; comportamento após reinício do computador; disponibilidade ao longo de dias.

## Correção de 14/10/2026: servidor antigo que ficava no ar

O script iniciava o servidor e o túnel com `Start-Process`. Esses processos ficavam presos à janela (ou à ferramenta) que rodou o script: quando ela
fechava, o Windows os encerrava e o site caía; quando ela ficava aberta, o servidor antigo continuava ocupando a porta 3100 e uma nova publicação não
conseguia substituí-lo (o site seguia com o build anterior, e páginas inexistentes davam erro 500 em vez de 404).

Agora `publicar.ps1` inicia servidor, túnel e aquecimento pelo serviço de processos do Windows (independentes de quem rodou o script), confere que
quem responde na porta é o servidor recém-iniciado e recusa continuar se a porta estiver ocupada por outro programa. `parar.ps1` acha os processos pelo
que fazem (o `next start` na porta da SINDI, o cloudflared que aponta para ela e o aquecimento), sem depender de números guardados, e não toca no
servidor de desenvolvimento.

Verificado depois da correção: páginas principais 200; endereço inexistente 404; origem externa 403; servidor e túnel continuam no ar depois que o
comando de publicação termina.
