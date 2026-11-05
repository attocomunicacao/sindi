# Endereço fixo do protótipo SINDI

Atualização de voz e compartilhamento em 10/10/2026: banner público em /social/sindi-share-v1.jpg, 1200 × 630, JPEG, com logo original do site do SINDEPRESTEM e paleta preto/vermelho/amarelo/branco. Gerador reproduzível em scripts/operacao/create-share-banner.mjs. Metadados Open Graph e Twitter usam URLs absolutas do domínio fixo. Leitores WhatsApp/facebookexternalhit/Facebot podem consultar página e imagem; demais robôs continuam bloqueados, e meta noindex permanece. Não foi enviada mensagem pelo WhatsApp. Cache de prévias já coletadas pelo aplicativo pode atrasar a atualização; apagar o link do campo e colar novamente pode refazer a prévia, sem garantia de invalidação remota.

Atualização feita no servidor de origem, compartilhada por Cloudflare e Vercel, sem novo upload da aplicação ao Vercel. Processo Next.js atual: PID 14076; substitui os IDs abaixo. Túnel Cloudflare preservado.

Publicado e verificado em 10/10/2026: https://sindi-prototipo.vercel.app

Conta CLI: attocomunicacao. Equipe: atto-comunicacao, plano Hobby existente. Projeto: sindi-prototipo (prj_iaHbUjHv9yMxchYaPlrCm1qKJEKy). Deploy final: dpl_14tVG5uZTonDFCv6ivsZnyBtpvEy. Usuário esclareceu que é protótipo ainda não institucional. Não houve ativação de planos pagos, compra de domínio ou alteração de DNS próprio.

## Funcionamento

Navegador → endereço fixo Vercel → Cloudflare Quick Tunnel → Next.js em 127.0.0.1:3100 → Ollama em 127.0.0.1:11434. Vercel recebe apenas deployment/vercel-proxy/vercel.json e um arquivo público de verificação; nenhum .env, segredo, snapshot, relatório ou código do servidor é enviado. Rewrite cobre página inicial, recursos e APIs. Cache-Control no-store evita cache do conteúdo encaminhado. A API aceita mesma origem ou a única origem HTTPS definida pelo servidor em SINDI_PUBLIC_ORIGIN; não confia em x-forwarded-host para permitir pedidos.

Origem pública de produção: https://sindi-prototipo.vercel.app. Aliases provisórios não são permitidos pelo chat. O alias de produção curto foi confirmado acessível sem autenticação; os URLs de deployment/alias provisório exigem autenticação Vercel. Não foi removida a proteção do projeto. Para testar URLs protegidos, usar a autenticação existente com vercel curl, sem divulgar credenciais ou bypass tokens.

## Operação e reinício

Computador, Ollama, servidor e túnel precisam permanecer ativos. A URL Vercel permanece fixa, mas o endereço trycloudflare muda quando o túnel é recriado. Não há serviço de reinício automático configurado nesta revisão.

Antes de iniciar a SINDI em uma nova sessão de PowerShell:

```powershell
$env:SINDI_PUBLIC_ORIGIN = 'https://sindi-prototipo.vercel.app'
npm run start -- --hostname 127.0.0.1 --port 3100
```

Use a versão de produção; execute npm run build quando houver mudanças. Não inicie um segundo servidor se a porta já estiver ocupada.

Depois, iniciar o túnel para a aplicação, nunca para a porta do Ollama:

```powershell
.\.tools\cloudflared.exe tunnel --url http://127.0.0.1:3100 --no-autoupdate
```

Se o túnel ganhar novo endereço, atualizar somente destination em deployment/vercel-proxy/vercel.json, preservando /$1 no final. Conferir o destino HTTPS e testar a aplicação antes de publicar o proxy:

```powershell
vercel deploy --prod --project sindi-prototipo --scope atto-comunicacao --yes --cwd deployment/vercel-proxy
```

Verificar página inicial, chat streaming, /uso, /base e rejeição de Origin externo pelo domínio fixo. Um simples redirecionamento não substitui o proxy: mudaria o endereço do navegador. Não há garantia de disponibilidade dos Quick Tunnels. Não expor Ollama diretamente.

Nesta execução, Next.js PID 14076 e cloudflared PID 17268; IDs podem mudar. Logs operacionais em .data/sindi-production.*.log e .data/cloudflared-current.*.log. Antes de parar processos, identificar o processo correspondente à aplicação/túnel; não encerrar todos os processos Node.

## Evidências e limites

24 testes aprovados, lint, typecheck e build concluídos. Gitleaks: zero achados em src e proxy público. Semgrep: 74 regras, zero achados nos dois arquivos TypeScript alterados. npm audit de produção: zero vulnerabilidades.

Domínio final: POST sintético respondeu 200, 75 deltas NDJSON, primeiro texto em 1.777 ms, total 6.639 ms, resposta completa e registro agregado confirmados. Origem externa: 403. /uso e /base: 200. Navegador: pergunta enviada e resposta renderizada, sem erros ou avisos no console. São amostras de modelo aquecido, não garantias de tempo real. Não avaliados microfone/áudio real em celulares, carga simultânea, reinício físico, uptime ou nova execução ZAP. Respostas do modelo continuam sujeitas a erros.

Fontes: https://vercel.com/docs/routing/rewrites e https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/ .

Temas claro e escuro publicados em 10/10/2026. Botão fixo no canto inferior direito; preferência local no navegador (sindi-theme), sem guardar conversa. Alternância e persistência após recarga verificadas visualmente no domínio Vercel. Typecheck e testes aprovados; lint, build, auditoria de dependências e análise estática sem achados. Banner retorna HTTP 200/image/jpeg nos dois endereços. Cloudflare adiciona regras próprias ao robots.txt; as regras específicas de prévia do WhatsApp permanecem no resultado.


Recuperação em 11/10/2026: serviços estavam desligados e o Quick Tunnel anterior não resolvia DNS (502 DNS_HOSTNAME_NOT_FOUND). Reiniciados Ollama PID 10696, Next.js PID 15904 e cloudflared PID 12476. Novo destino https://opera-anne-fda-emails.trycloudflare.com, proxy publicado no deploy dpl_6VGHzctAAhXETNWSpePJRjBC3bN5. Página e chat sintético verificados no domínio fixo. A disponibilidade continua dependente do computador e dos processos locais; não há reinício automático configurado.
