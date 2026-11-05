$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Path '.data/knowledge' -Force | Out-Null
# Launch Node directly: npm.cmd's console wrapper can forward terminal close signals on Windows.
# Credentials are loaded by Node, never arguments.
$sindiNodePath = (Get-Command node.exe).Source
$sindiWorker = Start-Process -FilePath $sindiNodePath -ArgumentList @('--import', 'tsx', 'scripts/knowledge-sync.ts', '--watch') -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput '.data/knowledge/worker.log' -RedirectStandardError '.data/knowledge/worker-error.log'
exit $sindiWorker.ExitCode
