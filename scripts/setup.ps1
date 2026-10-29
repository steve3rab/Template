[CmdletBinding()]
param(
    [switch]$InstallPlaywrightBrowsers
)

. (Join-Path $PSScriptRoot 'common.ps1')

Test-ExternalCommand -Name 'node'
Test-ExternalCommand -Name 'npm'

$nodeVersion = (& node --version).Trim()
Write-Host "Node.js détecté : $nodeVersion" -ForegroundColor Cyan
Write-Host 'Installation des dépendances du projet...' -ForegroundColor Cyan

Invoke-Npm -Arguments @('install', '--legacy-peer-deps', '--no-audit', '--no-fund')

if ($InstallPlaywrightBrowsers) {
    Invoke-Npm -Arguments @('exec', '--', 'playwright', 'install', 'chromium')
}

Write-Host 'Installation terminée.' -ForegroundColor Green
