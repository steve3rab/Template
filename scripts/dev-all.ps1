[CmdletBinding()]
param(
    [int]$FrontendPort = 5173,
    [int]$BackendPort = 3001,
    [switch]$SeedTestUsers
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DependenciesInstalled

if ($SeedTestUsers) {
    if ($env:NODE_ENV -eq 'production') {
        throw 'La création des comptes de test est interdite lorsque NODE_ENV=production.'
    }

    $securePassword = Read-Host 'Mot de passe commun des comptes de test (12 à 128 caractères)' -AsSecureString
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    try {
        $testPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
        if ($testPassword.Length -lt 12 -or $testPassword.Length -gt 128) {
            throw 'Le mot de passe doit contenir entre 12 et 128 caractères.'
        }

        $previousAllowSeed = $env:ALLOW_TEST_USER_SEED
        $previousTestPassword = $env:TEST_USERS_PASSWORD
        try {
            $env:ALLOW_TEST_USER_SEED = 'true'
            $env:TEST_USERS_PASSWORD = $testPassword
            Write-Host 'Préparation de la base et des comptes de test...' -ForegroundColor Cyan
            Invoke-Npm -Arguments @('run', 'db:generate')
            Invoke-Npm -Arguments @('run', 'db:deploy')
            Invoke-Npm -Arguments @('run', 'db:seed:test-users')
        }
        finally {
            if ($null -eq $previousAllowSeed) {
                Remove-Item Env:ALLOW_TEST_USER_SEED -ErrorAction SilentlyContinue
            }
            else {
                $env:ALLOW_TEST_USER_SEED = $previousAllowSeed
            }

            if ($null -eq $previousTestPassword) {
                Remove-Item Env:TEST_USERS_PASSWORD -ErrorAction SilentlyContinue
            }
            else {
                $env:TEST_USERS_PASSWORD = $previousTestPassword
            }

            $testPassword = $null
        }
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
        $securePassword.Dispose()
    }
}

Write-Host 'Démarrage du frontend et du backend dans deux fenêtres PowerShell.' -ForegroundColor Cyan
$frontend = Join-Path $PSScriptRoot 'dev.ps1'
$backend = Join-Path $PSScriptRoot 'backend.ps1'
$frontendCommand = "& '$frontend' -Port $FrontendPort"
$backendCommand = "`$env:APP_ORIGIN = 'http://127.0.0.1:$FrontendPort'; & '$backend' -Port $BackendPort"
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $backendCommand)
Start-Sleep -Milliseconds 700
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $frontendCommand)
Write-Host "Frontend : http://localhost:$FrontendPort" -ForegroundColor Green
Write-Host "Backend  : http://localhost:$BackendPort/api/health" -ForegroundColor Green

if (-not $SeedTestUsers) {
    Write-Host 'Comptes de test non modifiés. Pour les créer ou les réinitialiser, relancez avec -SeedTestUsers.' -ForegroundColor Yellow
}
