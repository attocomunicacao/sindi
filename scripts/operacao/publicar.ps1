# Publica a SINDI a partir deste computador: servidor de produção local + túnel Cloudflare + endereço fixo na Vercel.
#
#   Navegador -> https://sindi-prototipo.vercel.app (Vercel, só repassa) -> túnel Cloudflare (saída) -> Next.js em 127.0.0.1:3100 -> Ollama em 127.0.0.1:11434
#
# O túnel aponta para a aplicação, nunca para o Ollama. Nenhuma porta é aberta no roteador. O endereço do túnel rápido muda a cada início; este script
# grava o novo destino em deployment/vercel-proxy/vercel.json e republica o repasse, para que o endereço público continue o mesmo.
#
# Uso:   powershell -ExecutionPolicy Bypass -File scripts/operacao/publicar.ps1 [-SemBuild] [-SemVercel] [-SemAquecer] [-Modelo sindi]
# Parar: powershell -ExecutionPolicy Bypass -File scripts/operacao/parar.ps1
param([switch]$SemBuild, [switch]$SemVercel, [switch]$SemAquecer, [string]$Modelo = 'sindi', [string]$Origem = 'https://sindi-prototipo.vercel.app', [int]$Porta = 3100)
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

Passo 'Ollama e modelo'
try { Invoke-RestMethod 'http://127.0.0.1:11434/api/version' -TimeoutSec 5 | Out-Null } catch { throw 'O Ollama não respondeu em 127.0.0.1:11434. Abra o Ollama e rode de novo.' }
$instalados = (Invoke-RestMethod 'http://127.0.0.1:11434/api/tags').models.name
if (-not ($instalados -contains "${Modelo}:latest" -or $instalados -contains $Modelo)) {
  if ($Modelo -ne 'sindi') { throw "O modelo $Modelo não está instalado no Ollama." }
  npm run modelo:criar; if ($LASTEXITCODE) { throw 'Não foi possível criar o modelo sindi.' }
}

if (-not $SemBuild) { Passo 'Build de produção'; npm run build; if ($LASTEXITCODE) { throw 'O build falhou; nada foi publicado.' } }

Passo 'Encerrando a publicação anterior (se houver)'
& (Join-Path $PSScriptRoot 'parar.ps1') -Silencioso -Porta $Porta
if (Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue) { throw "A porta $Porta continua ocupada por outro programa; nada foi publicado." }

Passo "Servidor da SINDI em 127.0.0.1:$Porta"
$node = (Get-Command node.exe).Source
# Token de uso único para o aquecimento (não é segredo de terceiros; só separa essas chamadas das métricas públicas).
$token = -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
Iniciar $node @('node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', "$Porta") (Join-Path $estado 'next.stdout.log') (Join-Path $estado 'next.stderr.log') `
  @{ SINDI_PUBLIC_ORIGIN = $Origem; OLLAMA_MODEL = $Modelo; NODE_ENV = 'production'; SINDI_AQUECIMENTO_TOKEN = $token }
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
  $arquivo = 'deployment/vercel-proxy/vercel.json'
  $json = [IO.File]::ReadAllText((Resolve-Path $arquivo), [Text.UTF8Encoding]::new($false))
  $novo = [regex]::Replace($json, 'https://[a-z0-9-]+\.trycloudflare\.com', $endereco)
  [IO.File]::WriteAllText((Resolve-Path $arquivo), $novo, [Text.UTF8Encoding]::new($false))
  vercel deploy --prod --project sindi-prototipo --scope atto-comunicacao --yes --cwd deployment/vercel-proxy
  if ($LASTEXITCODE) { throw 'O repasse na Vercel não foi publicado. O túnel está no ar; rode de novo quando a Vercel CLI estiver autenticada.' }
  Start-Sleep -Seconds 5
  $resposta = Invoke-WebRequest "$Origem/" -UseBasicParsing -TimeoutSec 30
  Write-Host "Endereço público: $Origem (HTTP $($resposta.StatusCode))" -ForegroundColor Green
} else { Write-Host "Endereço temporário: $endereco" -ForegroundColor Green }
if (-not $SemAquecer) {
  Passo 'Preparando as respostas das perguntas frequentes (em segundo plano)'
  Iniciar $node @('--import', 'tsx', 'scripts/operacao/aquecer.ts', "--base=http://127.0.0.1:$Porta") (Join-Path $estado 'aquecer.log') (Join-Path $estado 'aquecer.erros.log') @{ SINDI_AQUECIMENTO_TOKEN = $token }
  Write-Host "Andamento em .data/operacao/aquecer.log (cerca de 20 a 30 minutos). Enquanto isso, a SINDI já responde normalmente."
}
Write-Host "`nMantenha este computador ligado, sem suspender, com o Ollama aberto. Para encerrar: scripts/operacao/parar.ps1"
