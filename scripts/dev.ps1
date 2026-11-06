[CmdletBinding()]
param(
    [string]$HostAddress = '127.0.0.1',
    [ValidateRange(1, 65535)][int]$Port = 5173,
    [switch]$Expose,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$ViteArguments
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DependenciesInstalled
if ($Expose) { $HostAddress = '0.0.0.0' }

Write-Host "Démarrage du serveur de développement : http://localhost:$Port" -ForegroundColor Cyan
$arguments = @('run', 'dev', '--', '--host', $HostAddress, '--port', "$Port") + @($ViteArguments)
Invoke-Npm -Arguments $arguments
