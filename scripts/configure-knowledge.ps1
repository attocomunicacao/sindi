$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$sindiSecretInput = Read-Host 'Cole a Secret key do projeto SINDI (Settings > API Keys). Ela ficará somente neste computador' -AsSecureString
$sindiSecretPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sindiSecretInput)
try {
  $sindiSecretValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($sindiSecretPtr)
  if ($sindiSecretValue -notmatch '^(sb_secret_|eyJ)' -or $sindiSecretValue -match '\s') { throw 'Formato de chave inválido' }
  [IO.File]::WriteAllText((Join-Path (Get-Location) '.env.knowledge.local'), "SUPABASE_SECRET_KEY=$sindiSecretValue`n", [Text.UTF8Encoding]::new($false))
  Write-Host 'Chave salva. Não compartilhe esse arquivo. Execute npm run knowledge:sync.'
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($sindiSecretPtr)
  $sindiSecretValue = $null
}
