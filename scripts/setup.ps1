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

Write-Host 'Installation du navigateur Chromium pour les tests E2E...' -ForegroundColor Cyan
Invoke-Npm -Arguments @('exec', '--', 'playwright', 'install', 'chromium')

# Les tests sont exécutés même si une suite échoue, afin de produire un récapitulatif complet.
$testResults = @()

function Invoke-TestSuite {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    Write-Host ""
    Write-Host "===== $Label =====" -ForegroundColor Cyan
    $captured = [System.Collections.Generic.List[string]]::new()

    Push-Location $script:ProjectRoot
    try {
        & npm @Arguments 2>&1 | ForEach-Object {
            $line = "$_"
            Write-Host $line
            $captured.Add($line)
        }
        $exitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    $failed = $exitCode -ne 0
    $details = @()
    if ($failed) {
        # Garder les lignes contenant les fichiers, numéros de ligne et messages d'erreur.
        $pattern = '(?i)(FAIL\s+|failed|AssertionError|TypeError|ReferenceError|SyntaxError|Error:|TimeoutError|Test Files|Tests\s+\d|\.(?:test|spec)\.[jt]sx?:\d+|\.(?:test|spec)\.[jt]sx?)'
        $details = @($captured | Where-Object { $_ -match $pattern } | Select-Object -Unique)
        if ($details.Count -eq 0) {
            $details = @($captured | Select-Object -Last 12)
        }
    }

    $script:testResults += [pscustomobject]@{
        Label = $Label
        Failed = $failed
        ExitCode = $exitCode
        Details = $details
    }

    if ($failed) {
        Write-Host "Échec de '$Label' (code $exitCode). La suite suivante sera quand même exécutée." -ForegroundColor Yellow
    } else {
        Write-Host "$Label : OK" -ForegroundColor Green
    }
}

Invoke-TestSuite -Label 'Tests unitaires' -Arguments @('run', 'test:unit')
Invoke-TestSuite -Label 'Tests d’intégration API' -Arguments @('run', 'test:integration')
Invoke-TestSuite -Label 'Tests E2E' -Arguments @('run', 'test:e2e')

Write-Host ""
Write-Host '================ RÉSUMÉ DES TESTS ================' -ForegroundColor Cyan
$failedSuites = @($testResults | Where-Object { $_.Failed })

if ($failedSuites.Count -eq 0) {
    Write-Host 'Toutes les suites de tests ont réussi.' -ForegroundColor Green
    Write-Host 'Installation terminée.' -ForegroundColor Green
    exit 0
}

foreach ($result in $testResults) {
    if ($result.Failed) {
        Write-Host ""
        Write-Host "ÉCHEC — $($result.Label) (code $($result.ExitCode))" -ForegroundColor Red
        @($result.Details) | ForEach-Object {
            Write-Host "  $_" -ForegroundColor Red
        }
    } else {
        Write-Host "OK — $($result.Label)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "$($failedSuites.Count) suite(s) en échec. Consultez les fichiers et lignes ci-dessus." -ForegroundColor Red
exit 1
