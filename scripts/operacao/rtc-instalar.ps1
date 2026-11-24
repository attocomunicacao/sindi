# Instala a calculadora oficial da Receita Federal (RTC: CBS/IBS) ao lado do SINDI. Roda uma vez (e de novo para atualizar a versão fixada abaixo).
#   powershell -File scripts/operacao/rtc-instalar.ps1
# O que faz: compila o gerador de DANFSe da Receita em WASM (Go em .tools/go, sem .exe); confere o JDK 25 (instala pelo winget se faltar), clona os repositórios da Receita em .tools/rtc (pasta fora do git) na versão FIXADA
# (os repositórios não publicam releases, então o commit é o que garante o mesmo comportamento) e gera o banco SQLite com o Flyway (cerca de 3 minutos).
# Licença dos projetos: MIT (Receita Federal do Brasil). Ver NOTICE-RTC.md.
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$rtc = Join-Path $raiz '.tools\rtc'
$repos = @(
  @{ nome = 'calculadora-rtc-regime-regular'; commit = 'f1eebd7' },     # 1.7.2, 18/11/2026
  @{ nome = 'calculadora-rtc-simples-nacional'; commit = 'a926d5a' },
  @{ nome = 'calculadora-rtc-gerador-danfse'; commit = '8d79e6b' }      # Go 1.0.0: só referência de conformidade do DANFSe (npm run rtc:conferir:danfse)
)
# Go na versão que o go.mod do gerador exige, baixado do go.dev com checagem do SHA-256. Nada é instalado no Windows: fica em .tools/go.
$go = @{ versao = '1.27.4'; sha256 = '178ab98950ac69ab25069307dc6ade79f3816e414cce95b4da166a115cde1e7e' }

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

# Gerador de DANFSe oficial (Go), compilado para WASM e executado dentro do Node: só serve de referência para o porte em TypeScript. Não vira .exe porque o
# Windows pode bloquear executáveis novos (política de controle de aplicativos).
$goRaiz = Join-Path $raiz '.tools\go'
if (-not (Test-Path (Join-Path $goRaiz 'bin\go.exe'))) {
  Write-Host "Baixando o Go $($go.versao) (go.dev)..."
  $baixados = Join-Path $raiz '.tools\baixados'
  New-Item -ItemType Directory -Force $baixados | Out-Null
  $zip = Join-Path $baixados "go$($go.versao).zip"
  Invoke-WebRequest -UseBasicParsing -Uri "https://go.dev/dl/go$($go.versao).windows-amd64.zip" -OutFile $zip
  if ((Get-FileHash $zip -Algorithm SHA256).Hash.ToLower() -ne $go.sha256) { Remove-Item $zip; throw 'O SHA-256 do Go não confere.' }
  $extraido = Join-Path $baixados 'go-extraido'
  if (Test-Path $extraido) { Remove-Item $extraido -Recurse -Force }
  Expand-Archive $zip -DestinationPath $extraido
  Move-Item (Join-Path $extraido 'go') $goRaiz
}
$danfse = Join-Path $rtc 'calculadora-rtc-gerador-danfse'
$saida = Join-Path $rtc 'danfse-wasm'
if (-not (Test-Path (Join-Path $saida 'danfse.wasm'))) {
  New-Item -ItemType Directory -Force $saida | Out-Null
  $env:GOROOT = $goRaiz; $env:GOPATH = Join-Path $raiz '.tools\gopath'
  $env:GOOS = 'js'; $env:GOARCH = 'wasm'; $env:CGO_ENABLED = '0'
  Push-Location $danfse
  & (Join-Path $goRaiz 'bin\go.exe') build '-ldflags=-s -w' -o (Join-Path $saida 'danfse.wasm') ./cmd/danfse-wasm
  Pop-Location
  Remove-Item Env:GOOS, Env:GOARCH
  Copy-Item (Join-Path $goRaiz 'lib\wasm\wasm_exec.js') $saida -Force
}
Write-Host 'DANFSe oficial (WASM) pronto em .tools\rtc\danfse-wasm.'
Write-Host 'Pronto. Para ligar: powershell -File scripts/operacao/rtc-subir.ps1'
