[CmdletBinding()]
param(
    [ValidateRange(1, 65535)][int]$Port = 4173,
    [switch]$Expose,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DependenciesInstalled

if (-not $SkipBuild) {
    Invoke-Npm -Arguments @('run', 'build')
}

$hostAddress = if ($Expose) { '0.0.0.0' } else { '127.0.0.1' }
Write-Host "Prévisualisation : http://localhost:$Port" -ForegroundColor Cyan
Invoke-Npm -Arguments @('run', 'preview', '--', '--host', $hostAddress, '--port', "$Port")
