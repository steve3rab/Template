[CmdletBinding()]
param(
    [string]$HostAddress = '127.0.0.1',
    [int]$Port = 3001
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DependenciesInstalled

Write-Host "Démarrage de l'API : http://localhost:$Port/api/health" -ForegroundColor Cyan
$env:PORT = "$Port"
$env:HOST = $HostAddress
Invoke-Npm -Arguments @('--workspace', '@template/api', 'run', 'dev')