[CmdletBinding()]
param(
    [string]$HostAddress = '127.0.0.1',
    [int]$Port = 5173,
    [switch]$Expose
)

. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DependenciesInstalled

if ($Expose) { $HostAddress = '0.0.0.0' }
Write-Host "Démarrage du serveur de développement : http://localhost:$Port" -ForegroundColor Cyan
Invoke-Npm -Arguments (@('run', 'dev', '--', '--host', $HostAddress, '--port', "$Port") + $args)
