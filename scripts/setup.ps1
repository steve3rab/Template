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

$envFile = Join-Path $script:ProjectRoot '.env'
$envExample = Join-Path $script:ProjectRoot '.env.example'
if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
    Copy-Item $envExample $envFile
    Write-Host 'Fichier .env local créé depuis .env.example. Adaptez les valeurs pour votre environnement.' -ForegroundColor Yellow
}

Invoke-Npm -Arguments @('run', 'db:generate')
Invoke-Npm -Arguments @('run', 'db:deploy')

if ($InstallPlaywrightBrowsers) {
    Invoke-Npm -Arguments @('exec', '--', 'playwright', 'install', 'chromium')
}

Write-Host 'Installation terminée.' -ForegroundColor Green
