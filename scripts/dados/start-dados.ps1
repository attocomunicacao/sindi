# Inicia o coletor de dados públicos (a cada 30 minutos) em segundo plano, sem janela.
# Saída em .data/dados/worker.log. Para parar: Stop-Process -Id (Get-Content .data/dados/sync.lock)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
New-Item -ItemType Directory -Path '.data/dados' -Force | Out-Null
$node = (Get-Command node.exe).Source
Start-Process -FilePath $node -ArgumentList @('--import', 'tsx', 'scripts/dados/dados-sync.ts', '--watch') -WorkingDirectory (Get-Location).Path -WindowStyle Hidden `
  -RedirectStandardOutput '.data/dados/worker.log' -RedirectStandardError '.data/dados/worker-error.log'
Write-Output 'Coletor de dados iniciado. Acompanhe em .data/dados/worker.log'
