[CmdletBinding()]
param(
    [switch]$InstallPlaywrightBrowsers
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

Test-ExternalCommand -Name 'node'
Test-ExternalCommand -Name 'npm.cmd'
Assert-Toolchain

# Prisma replaces generated native engine files during generate. Windows refuses
# that rename while a project Node process still has the engine loaded.
try {
    $projectNodeProcesses = @(
        Get-CimInstance -ClassName Win32_Process -Filter "Name = 'node.exe'" |
            Where-Object {
                $_.CommandLine -and
                $_.CommandLine.IndexOf($script:ProjectRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
            }
    )
}
catch {
    throw "Impossible de vérifier les processus Node.js du projet. Fermez les serveurs et tests, puis relancez. Détail : $($_.Exception.Message)"
}

if ($projectNodeProcesses.Count -gt 0) {
    Write-Host ''
    Write-Host 'Préparation interrompue : des processus Node.js de ce projet sont encore actifs.' -ForegroundColor Yellow
    foreach ($process in $projectNodeProcesses) {
        Write-Host ("  PID {0} : {1}" -f $process.ProcessId, $process.CommandLine) -ForegroundColor DarkYellow
    }
    throw 'Fermez les serveurs frontend/backend et les tests de ce projet. Utilisez .\scripts\stop-dev-all.ps1 si les serveurs ont été lancés par le menu.'
}

Write-Host 'Installation déterministe des dépendances depuis package-lock.json...' -ForegroundColor Cyan
Invoke-Npm -Arguments @('ci', '--legacy-peer-deps', '--no-audit', '--no-fund')

$envFile = Join-Path $script:ProjectRoot '.env'
$envExample = Join-Path $script:ProjectRoot '.env.example'
if (-not (Test-Path -LiteralPath $envFile) -and (Test-Path -LiteralPath $envExample)) {
    Copy-Item -LiteralPath $envExample -Destination $envFile
    Write-Host 'Fichier .env local créé depuis .env.example. Vérifiez ses valeurs avant utilisation.' -ForegroundColor Yellow
}

Invoke-Npm -Arguments @('run', 'db:generate')
Invoke-Npm -Arguments @('run', 'db:deploy')
Invoke-Npm -Arguments @('run', 'db:status')
Invoke-Npm -Arguments @('run', 'db:check-schema-parity')

if ($InstallPlaywrightBrowsers) {
    Write-Host 'Installation de Chromium pour Playwright...' -ForegroundColor Cyan
    Invoke-Npm -Arguments @('exec', '--', 'playwright', 'install', 'chromium')
}

Write-Host 'Préparation terminée. Aucun serveur ni test n’a été lancé.' -ForegroundColor Green
