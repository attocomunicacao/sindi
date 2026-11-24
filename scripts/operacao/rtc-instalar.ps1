# Instala a calculadora oficial da Receita Federal (RTC: CBS/IBS) ao lado do SINDI. Roda uma vez (e de novo para atualizar a versão fixada abaixo).
#   powershell -File scripts/operacao/rtc-instalar.ps1
# O que faz: confere o JDK 25 (instala pelo winget se faltar), clona os repositórios da Receita em .tools/rtc (pasta fora do git) na versão FIXADA
# (os repositórios não publicam releases, então o commit é o que garante o mesmo comportamento) e gera o banco SQLite com o Flyway (cerca de 3 minutos).
# Licença dos projetos: MIT (Receita Federal do Brasil). Ver NOTICE-RTC.md.
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$rtc = Join-Path $raiz '.tools\rtc'
$repos = @(
  @{ nome = 'calculadora-rtc-regime-regular'; commit = 'f1eebd7' },     # 1.7.2, 18/11/2026
  @{ nome = 'calculadora-rtc-simples-nacional'; commit = 'a926d5a' }
)

function Achar-Java {
  $candidato = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -Filter 'jdk-25*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  if ($candidato) { return $candidato.FullName }
  if ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\java.exe")) { return $env:JAVA_HOME }
  return $null
}

$java = Achar-Java
if (-not $java) {
  Write-Host 'JDK 25 não encontrado: instalando o Eclipse Temurin 25 pelo winget...'
  winget install EclipseAdoptium.Temurin.25.JDK --silent --accept-package-agreements --accept-source-agreements
  $java = Achar-Java
  if (-not $java) { throw 'Não foi possível instalar o JDK 25. Instale o Temurin 25 (https://adoptium.net) e rode de novo.' }
}
$env:JAVA_HOME = $java
$env:Path = "$java\bin;$env:Path"
Write-Host "JDK: $java"

New-Item -ItemType Directory -Force $rtc | Out-Null
foreach ($r in $repos) {
  $pasta = Join-Path $rtc $r.nome
  if (-not (Test-Path $pasta)) { git clone "https://github.com/ReceitaFederal/$($r.nome).git" $pasta }
  git -C $pasta fetch --quiet origin
  git -C $pasta checkout --quiet $r.commit
  Write-Host "$($r.nome) em $($r.commit)"
}

$regime = Join-Path $rtc 'calculadora-rtc-regime-regular'
$simples = Join-Path $rtc 'calculadora-rtc-simples-nacional'
$banco = Join-Path $regime 'calculadora\db\calculadora-pro.db'
if (-not (Test-Path $banco)) {
  Write-Host 'Gerando o banco de dados (Flyway), alguns minutos...'
  New-Item -ItemType Directory -Force (Join-Path $regime 'calculadora\db') | Out-Null
  Push-Location $regime
  .\mvnw.cmd flyway:migrate "-Dflyway.configFiles=flyway\flyway-pro.conf" --batch-mode --errors
  Pop-Location
}
# O Simples Nacional usa o mesmo banco e a mesma pasta flyway do regime regular (README do projeto).
New-Item -ItemType Directory -Force (Join-Path $simples 'calculadora\db') | Out-Null
Copy-Item $banco (Join-Path $simples 'calculadora\db') -Force
Copy-Item (Join-Path $regime 'flyway') (Join-Path $simples 'flyway') -Recurse -Force

Write-Host 'Pronto. Para ligar: powershell -File scripts/operacao/rtc-subir.ps1'
