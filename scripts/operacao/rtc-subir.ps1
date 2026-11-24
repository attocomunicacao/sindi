# Liga (ou desliga) as calculadoras oficiais da Receita Federal, só nesta máquina (127.0.0.1):
#   powershell -File scripts/operacao/rtc-subir.ps1            # liga
#   powershell -File scripts/operacao/rtc-subir.ps1 -Parar     # desliga
# Regime regular (CBS/IBS) na porta 8081 e Simples Nacional na 8082. Depois de ligar, ponha no arquivo de variáveis do servidor:
#   SINDI_RTC_REGIME_URL=http://127.0.0.1:8081/api   SINDI_RTC_SIMPLES_URL=http://127.0.0.1:8082/api   (e reinicie o site)
# Cada serviço é uma JVM (cerca de 0,5 a 1 GB de memória cada).
param([switch]$Parar, [switch]$SemSimples)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$rtc = Join-Path $raiz '.tools\rtc'
$servicos = @(
  @{ nome = 'regime-regular'; pasta = 'calculadora-rtc-regime-regular'; porta = 8081 }
)
if (-not $SemSimples) { $servicos += @{ nome = 'simples-nacional'; pasta = 'calculadora-rtc-simples-nacional'; porta = 8082 } }

function Parar-Porta($porta) {
  Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

if ($Parar) {
  foreach ($s in $servicos) { Parar-Porta $s.porta; Write-Host "$($s.nome) desligado" }
  return
}

$java = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -Filter 'jdk-25*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if (-not $java) { throw 'JDK 25 não encontrado. Rode scripts/operacao/rtc-instalar.ps1 primeiro.' }
$env:JAVA_HOME = $java.FullName
$env:Path = "$($java.FullName)\bin;$env:Path"

foreach ($s in $servicos) {
  $pasta = Join-Path $rtc $s.pasta
  if (-not (Test-Path (Join-Path $pasta 'calculadora\db\calculadora-pro.db'))) { throw "Banco do $($s.nome) não encontrado. Rode scripts/operacao/rtc-instalar.ps1." }
  if (Get-NetTCPConnection -LocalPort $s.porta -State Listen -ErrorAction SilentlyContinue) { Write-Host "$($s.nome) já está ligado na porta $($s.porta)"; continue }
  $log = Join-Path $rtc "$($s.nome).log"
  Start-Process -FilePath (Join-Path $pasta 'mvnw.cmd') -WorkingDirectory $pasta -WindowStyle Hidden `
    -ArgumentList 'spring-boot:run', '"-Dspring-boot.run.profiles=offline"', "`"-Dspring-boot.run.jvmArguments=-Dserver.port=$($s.porta)`"" `
    -RedirectStandardOutput $log -RedirectStandardError "$log.erro"
  Write-Host "$($s.nome): iniciando na porta $($s.porta) (log em $log)"
}
foreach ($s in $servicos) {
  $url = "http://127.0.0.1:$($s.porta)/api/versao"
  $ok = $false
  for ($i = 0; $i -lt 60 -and -not $ok; $i++) {
    try { $ok = (Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3).StatusCode -eq 200 } catch { Start-Sleep -Seconds 3 }
  }
  Write-Host ("{0}: {1}" -f $s.nome, $(if ($ok) { 'no ar' } else { 'não respondeu (veja o log)' }))
}
