[CmdletBinding()]
param(
    [string]$HostAddress = '127.0.0.1',
    [ValidateRange(1, 65535)][int]$Port = 3001
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DependenciesInstalled

$previousPort = $env:PORT
$previousHost = $env:HOST
try {
    $env:PORT = "$Port"
    $env:HOST = $HostAddress
    Write-Host "API : http://localhost:$Port/api/health" -ForegroundColor Cyan
    Invoke-Npm -Arguments @('--workspace', '@template/api', 'run', 'dev')
}
finally {
    if ($null -eq $previousPort) { Remove-Item Env:PORT -ErrorAction SilentlyContinue } else { $env:PORT = $previousPort }
    if ($null -eq $previousHost) { Remove-Item Env:HOST -ErrorAction SilentlyContinue } else { $env:HOST = $previousHost }
}
