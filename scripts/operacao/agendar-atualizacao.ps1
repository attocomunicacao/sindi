# Cria (ou recria) a tarefa agendada "SINDI-Atualizacao-Diaria": atualiza todas as bibliotecas (npm run dados:sync) todo dia no horário
# indicado e também ao entrar no Windows, recuperando execuções perdidas com o computador desligado. Não exige administrador.
# Uso: powershell -ExecutionPolicy Bypass -File scripts/operacao/agendar-atualizacao.ps1 [-Hora 06:00]   |   remover: -Remover
param([string]$Hora = '06:00', [switch]$Remover)
$ErrorActionPreference = 'Stop'
$nome = 'SINDI-Atualizacao-Diaria'
if ($Remover) { Unregister-ScheduledTask -TaskName $nome -Confirm:$false; Write-Output 'Tarefa removida.'; return }
$raiz = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$node = (Get-Command node.exe).Source
New-Item -ItemType Directory -Path (Join-Path $raiz '.data/dados') -Force | Out-Null
$acao = New-ScheduledTaskAction -Execute 'cmd.exe' -WorkingDirectory $raiz `
  -Argument "/c `"`"$node`" --import tsx scripts/dados/dados-sync.ts >> .data\dados\agendada.log 2>&1`""
$gatilhos = @((New-ScheduledTaskTrigger -Daily -At $Hora), (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME))
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 3)
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilhos -Settings $config -Force `
  -Description 'Atualiza as bibliotecas da SINDI (notícias, leis, dados do setor) e reindexa a busca.' | Out-Null
Write-Output "Tarefa '$nome' criada: diariamente às $Hora e ao entrar no Windows. Registro em .data/dados/agendada.log"
