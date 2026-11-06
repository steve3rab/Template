[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-DependenciesInstalled

$blockedValues = @($env:NODE_ENV, $env:APP_ENV, $env:DEPLOYMENT_ENV, $env:ENVIRONMENT, $env:VERCEL_ENV, $env:RAILWAY_ENVIRONMENT)
if ($blockedValues | Where-Object { $_ -match '^(?i:production|prod|preproduction|pre-production|preprod|staging|stage)$' }) {
    throw 'La création des comptes de test est interdite en production, préproduction et staging.'
}

Write-Host 'Comptes concernés : client, vendeur et administrateur.' -ForegroundColor Yellow
Write-Host 'Leurs mots de passe seront remplacés et leurs sessions existantes révoquées.' -ForegroundColor Yellow
$securePassword = Read-Host 'Nouveau mot de passe commun (12 à 128 caractères)' -AsSecureString
$passwordPointer = [IntPtr]::Zero
try {
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    if ($password.Length -lt 12 -or $password.Length -gt 128) {
        throw 'Le mot de passe doit contenir entre 12 et 128 caractères.'
    }

    $previousPassword = $env:TEST_USERS_PASSWORD
    try {
        $env:TEST_USERS_PASSWORD = $password
        Invoke-Npm -Arguments @('run', 'db:seed:test-users') -Description 'Création / mise à jour des comptes de test locaux'
    }
    finally {
        if ($null -eq $previousPassword) {
            Remove-Item Env:TEST_USERS_PASSWORD -ErrorAction SilentlyContinue
        }
        else {
            $env:TEST_USERS_PASSWORD = $previousPassword
        }
        $password = $null
    }
}
finally {
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    $securePassword.Dispose()
}
