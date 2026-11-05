# Encerra o servidor de produção, o túnel e o aquecimento iniciados por publicar.ps1. Os processos são achados pelo que fazem, não por um número guardado:
# o servidor `next start` que ouve na porta da SINDI, o cloudflared que aponta para essa porta e o aquecimento desta pasta. Nada mais é tocado
# (nem o servidor de desenvolvimento, nem outros programas Node).
param([switch]$Silencioso, [int]$Porta = 3100)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
function Encerrar($processo, $rotulo) { Stop-Process -Id $processo.ProcessId -Force -ErrorAction SilentlyContinue; if (-not $Silencioso) { Write-Host "Encerrado: $rotulo ($($processo.ProcessId))" } }

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -match 'aquecer\.ts' } | ForEach-Object { Encerrar $_ 'aquecimento' }
Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" | Where-Object { $_.CommandLine -match [regex]::Escape("--url http://127.0.0.1:$Porta") } | ForEach-Object { Encerrar $_ 'túnel' }
foreach ($conexao in @(Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue)) {
  $dono = Get-CimInstance Win32_Process -Filter "ProcessId = $($conexao.OwningProcess)" -ErrorAction SilentlyContinue
  if ($dono -and $dono.Name -eq 'node.exe' -and $dono.CommandLine -match 'next' -and $dono.CommandLine -match '\bstart\b' -and $dono.CommandLine -match "--port\s+$Porta\b") { Encerrar $dono "servidor na porta $Porta" }
}
Remove-Item '.data/operacao/*.pid' -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800
if (-not $Silencioso) { Write-Host 'Publicação encerrada. O endereço público deixa de responder até a próxima execução de publicar.ps1.' }
