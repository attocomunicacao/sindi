# Publica a SINDI a partir deste computador: servidor de produção local + túnel Cloudflare + endereço fixo na Vercel.
#
#   Navegador -> https://sindi-prototipo.vercel.app (Vercel, função de repasse) -> túnel Cloudflare (saída) -> Next.js em 127.0.0.1:3100
#   -> provedores de IA em cascata (saída, chaves no arquivo de ambiente local) e, em último caso, o Ollama local (127.0.0.1:11434).
#
# O túnel aponta para a aplicação. Nenhuma porta é aberta no roteador. O endereço do túnel rápido muda a cada início; este script republica o repasse
# com o novo destino e um segredo novo como variáveis da implantação (nada disso vai para o git). O repasse assina cada pedido com o segredo e informa o IP do
# visitante; quem chama o túnel direto é contado pelo IP real (cf-connecting-ip), sem poder forjar outro.
#
# Uso:   powershell -ExecutionPolicy Bypass -File scripts/operacao/publicar.ps1 [-SemBuild] [-SemVercel] [-Aquecer]
# Parar: powershell -ExecutionPolicy Bypass -File scripts/operacao/parar.ps1
param([switch]$SemBuild, [switch]$SemVercel, [switch]$Aquecer, [string]$Origem = 'https://sindi-prototipo.vercel.app', [int]$Porta = 3100)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
$raiz = (Get-Location).Path
$estado = Join-Path $raiz '.data/operacao'; New-Item -ItemType Directory -Path $estado -Force | Out-Null
function Passo($texto) { Write-Host "`n== $texto" -ForegroundColor Cyan }
<#
  Inicia um programa em segundo plano, independente de quem rodou este script: pelo serviço de processos do Windows (Win32_Process.Create), o processo
  não pertence à janela nem à sessão que o criou, e continua no ar quando ela fecha. Com Start-Process ele era encerrado junto com o terminal ou a
  ferramenta que chamou o script, e o site caía. As variáveis de ambiente valem só para esse processo e têm prioridade sobre o .env.local.
#>
function Iniciar([string]$programa, [string[]]$argumentos, [string]$saida, [string]$erros, [hashtable]$ambiente = @{}) {
  $variaveis = ($ambiente.GetEnumerator() | ForEach-Object { "set `"$($_.Key)=$($_.Value)`"&& " }) -join ''
  $linha = "cmd.exe /d /c `"$variaveis`"$programa`" $($argumentos -join ' ') > `"$saida`" 2> `"$erros`"`""
  $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $linha; CurrentDirectory = $raiz }
  if ($r.ReturnValue -ne 0) { throw "Não foi possível iniciar $programa (código $($r.ReturnValue))." }
}

Passo 'Chave do serviço de IA'
# Só confere se existe uma fonte para a chave (variável de ambiente ou .env.local); o conteúdo do arquivo não é lido nem mostrado.
if (-not $env:GEMINI_API_KEY -and -not (Test-Path '.env.local')) { throw 'Defina ao menos uma chave de provedor (GEMINI_API_KEY, GROQ_API_KEY...) no arquivo de ambiente local (veja env.example) e rode de novo.' }

if (-not $SemBuild) { Passo 'Build de produção'; npm run build; if ($LASTEXITCODE) { throw 'O build falhou; nada foi publicado.' } }

Passo 'Encerrando a publicação anterior (se houver)'
& (Join-Path $PSScriptRoot 'parar.ps1') -Silencioso -Porta $Porta
if (Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue) { throw "A porta $Porta continua ocupada por outro programa; nada foi publicado." }

Passo 'Modelo local de emergência (Ollama)'
# Último degrau da cascata: só responde quando todos os provedores gratuitos falharem. Sem o Ollama instalado, a publicação segue sem ele.
$ollamaUrl = ''
$ollama = Get-Command ollama.exe -ErrorAction SilentlyContinue
if (-not $ollama -and (Test-Path "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe")) { $ollama = Get-Command "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" }
if ($ollama) {
  $noArLocal = $false; try { $noArLocal = (Invoke-WebRequest 'http://127.0.0.1:11434/api/version' -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { }
  if (-not $noArLocal) { Iniciar $ollama.Source @('serve') (Join-Path $estado 'ollama.stdout.log') (Join-Path $estado 'ollama.stderr.log') @{ OLLAMA_KEEP_ALIVE = '30m'; OLLAMA_HOST = '127.0.0.1:11434' }; Start-Sleep -Seconds 3 }
  $ollamaUrl = 'http://127.0.0.1:11434'
  Write-Host 'Ollama no ar em 127.0.0.1:11434.'
} else { Write-Host 'Ollama não instalado: a cascata funciona só com os provedores na nuvem (winget install Ollama.Ollama).' -ForegroundColor Yellow }

Passo "Servidor da SINDI em 127.0.0.1:$Porta"
$node = (Get-Command node.exe).Source
# Valores aleatórios criptográficos, novos a cada publicação: o token separa o aquecimento das métricas públicas; o segredo do repasse prova que o pedido veio
# pela Vercel (e que o IP informado por ela é confiável).
function Aleatorio([int]$bytes = 32) { $b = New-Object byte[] $bytes; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') }) }
$token = Aleatorio; $segredo = Aleatorio
Iniciar $node @('node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', "$Porta") (Join-Path $estado 'next.stdout.log') (Join-Path $estado 'next.stderr.log') `
  @{ SINDI_PUBLIC_ORIGIN = $Origem; NODE_ENV = 'production'; SINDI_AQUECIMENTO_TOKEN = $token; SINDI_REPASSE_SEGREDO = $segredo; SINDI_OLLAMA_URL = $ollamaUrl }
$pronto = $false
foreach ($i in 1..40) { Start-Sleep -Milliseconds 750; try { if ((Invoke-WebRequest "http://127.0.0.1:$Porta/" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200) { $pronto = $true; break } } catch { } }
if (-not $pronto) { throw "O servidor não respondeu na porta $Porta. Veja $estado/next.stderr.log" }
# Confere que quem responde é o servidor que acabou de subir (e não um antigo) e guarda o número dele.
$dono = (Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
Set-Content (Join-Path $estado 'next.pid') $dono

Passo 'Túnel Cloudflare (conexão só de saída)'
$cloudflared = if (Test-Path '.tools/cloudflared.exe') { (Resolve-Path '.tools/cloudflared.exe').Path } else { (Get-Command cloudflared.exe).Source }
$tunelDoProjeto = { Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" | Where-Object { $_.CommandLine -match [regex]::Escape("--url http://127.0.0.1:$Porta") } }
$endereco = $null
# O serviço de túneis rápidos às vezes demora a responder; até quatro tentativas.
foreach ($tentativa in 1..4) {
  Remove-Item (Join-Path $estado 'cloudflared.log') -ErrorAction SilentlyContinue
  Iniciar $cloudflared @('tunnel', '--url', "http://127.0.0.1:$Porta", '--no-autoupdate') (Join-Path $estado 'cloudflared.stdout.log') (Join-Path $estado 'cloudflared.log')
  foreach ($i in 1..45) {
    Start-Sleep -Seconds 1
    if (Test-Path (Join-Path $estado 'cloudflared.log')) { $achado = Select-String -Path (Join-Path $estado 'cloudflared.log') -Pattern 'https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1; if ($achado) { $endereco = $achado.Matches[0].Value; break } }
    if ($i -gt 5 -and -not (& $tunelDoProjeto)) { break }
  }
  if ($endereco) { break }
  & $tunelDoProjeto | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Write-Host "Tentativa $tentativa sem resposta do serviço de túneis; tentando de novo."
  Start-Sleep -Seconds 3
}
if (-not $endereco) { throw "O túnel não informou o endereço. Veja $estado/cloudflared.log" }
Set-Content (Join-Path $estado 'cloudflared.pid') ((& $tunelDoProjeto | Select-Object -First 1).ProcessId)
Set-Content (Join-Path $estado 'tunel.url') $endereco
Write-Host "Túnel: $endereco"
# O endereço leva alguns segundos para resolver no DNS.
$noAr = $false
foreach ($i in 1..30) { Start-Sleep -Seconds 2; try { if ((Invoke-WebRequest "$endereco/" -UseBasicParsing -TimeoutSec 10).StatusCode -eq 200) { $noAr = $true; break } } catch { } }
if (-not $noAr) { throw 'O túnel foi criado, mas a aplicação não respondeu por ele.' }

if (-not $SemVercel) {
  Passo 'Endereço fixo (Vercel repassa para o túnel)'
  # Destino e segredo vão como variáveis desta implantação (--env), não como arquivo versionado.
  vercel deploy --prod --project sindi-prototipo --scope atto-comunicacao --yes --cwd deployment/vercel-proxy --env "SINDI_TUNEL_URL=$endereco" --env "SINDI_REPASSE_SEGREDO=$segredo"
  if ($LASTEXITCODE) { throw 'O repasse na Vercel não foi publicado. O túnel está no ar; rode de novo quando a Vercel CLI estiver autenticada.' }
  Start-Sleep -Seconds 5
  $resposta = Invoke-WebRequest "$Origem/" -UseBasicParsing -TimeoutSec 30
  Write-Host "Endereço público: $Origem (HTTP $($resposta.StatusCode))" -ForegroundColor Green
} else { Write-Host "Endereço temporário: $endereco" -ForegroundColor Green }
# Opcional: cada pergunta preparada gasta o limite gratuito da API de IA e a memória de respostas some a cada reinício.
if ($Aquecer) {
  Passo 'Preparando as respostas das perguntas frequentes (em segundo plano)'
  Iniciar $node @('--import', 'tsx', 'scripts/operacao/aquecer.ts', "--base=http://127.0.0.1:$Porta") (Join-Path $estado 'aquecer.log') (Join-Path $estado 'aquecer.erros.log') @{ SINDI_AQUECIMENTO_TOKEN = $token }
  Write-Host "Andamento em .data/operacao/aquecer.log (uma pergunta a cada poucos segundos). Enquanto isso, a SINDI já responde normalmente."
}
Write-Host "`nMantenha este computador ligado, sem suspender. Para encerrar: scripts/operacao/parar.ps1"
