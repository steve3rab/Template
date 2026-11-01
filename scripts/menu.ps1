[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# UTF-8 console + BOM-compatible source for Windows PowerShell 5.1.
try {
    [Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {
    # Keep the menu usable in hosts that do not expose console encoding controls.
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot

function Show-Menu {
    Clear-Host
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor DarkCyan
    Write-Host '             TEMPLATE - MENU DES COMMANDES' -ForegroundColor Cyan
    Write-Host '============================================================' -ForegroundColor DarkCyan
    Write-Host "Projet : $projectRoot" -ForegroundColor DarkGray
    Write-Host ''
    Write-Host '  DEMARRAGE' -ForegroundColor Yellow
    Write-Host '  1.  Installer / preparer le projet (sans lancer de tests)'
    Write-Host '  2.  Demarrer le frontend et le backend'
    Write-Host '  3.  Demarrer le frontend uniquement'
    Write-Host '  4.  Demarrer le backend uniquement'
    Write-Host ''
    Write-Host '  QUALITE ET TESTS' -ForegroundColor Yellow
    Write-Host '  5.  Verifier les types TypeScript'
    Write-Host '  6.  Verifier ESLint'
    Write-Host '  7.  Verifier le formatage Prettier'
    Write-Host '  8.  Lancer les tests unitaires'
    Write-Host '  9.  Lancer les tests d''integration'
    Write-Host ' 10.  Lancer les tests E2E (Playwright)'
    Write-Host ' 11.  Lancer tous les tests Vitest'
    Write-Host ' 12.  Lancer toutes les verifications (check complet)'
    Write-Host ''
    Write-Host '  BUILD ET BASE DE DONNEES' -ForegroundColor Yellow
    Write-Host ' 13.  Construire le frontend'
    Write-Host ' 14.  Construire le backend'
    Write-Host ' 15.  Generer le client Prisma'
    Write-Host ' 16.  Appliquer les migrations de base de donnees'
    Write-Host ''
    Write-Host '  0.  Quitter' -ForegroundColor DarkGray
    Write-Host ''
}

function Invoke-NpmCommand {
    param(
        [Parameter(Mandatory = $true)][string[]]$NpmArguments,
        [Parameter(Mandatory = $true)][string]$Description,
        [switch]$ConfirmFirst
    )

    if ($ConfirmFirst) {
        $answer = Read-Host 'Cette action peut prendre du temps. Continuer ? (O/N)'
        if ($answer -notin @('O', 'o', 'Oui', 'oui', 'Y', 'y', 'Yes', 'yes')) {
            Write-Host 'Action annulee.' -ForegroundColor Yellow
            return
        }
    }

    $npmCommand = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
    if (-not $npmCommand) {
        Write-Host 'Erreur : npm.cmd est introuvable. Vérifiez l installation de Node.js et le PATH.' -ForegroundColor Red
        [void](Read-Host 'Appuyez sur Entree pour revenir au menu')
        return
    }

    Write-Host ''
    Write-Host "> $Description" -ForegroundColor Cyan
    Write-Host ("Commande : npm " + ($NpmArguments -join ' ')) -ForegroundColor DarkGray
    Write-Host ''

    Push-Location $projectRoot
    try {
        & $npmCommand.Source @NpmArguments
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            Write-Host "Echec : la commande s'est terminee avec le code $exitCode." -ForegroundColor Red
        } else {
            Write-Host 'Termine avec succes.' -ForegroundColor Green
        }
    }
    catch {
        Write-Host "Erreur : $($_.Exception.Message)" -ForegroundColor Red
    }
    finally {
        Pop-Location
    }

    Write-Host ''
    [void](Read-Host 'Appuyez sur Entree pour revenir au menu')
}

function Invoke-ProjectScript {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptName,
        [Parameter(Mandatory = $true)][string]$Description
    )

    $scriptPath = Join-Path $PSScriptRoot $ScriptName
    Write-Host ''
    Write-Host "> $Description" -ForegroundColor Cyan
    try {
        & $scriptPath
    }
    catch {
        Write-Host "Erreur : $($_.Exception.Message)" -ForegroundColor Red
    }
    Write-Host ''
    [void](Read-Host 'Appuyez sur Entree pour revenir au menu')
}

while ($true) {
    Show-Menu
    $choice = Read-Host 'Choisissez une commande (0-16)'

    switch ($choice) {
        '0' { Clear-Host; Write-Host 'A bientot !' -ForegroundColor Cyan; break }
        '1' { Invoke-ProjectScript -ScriptName 'setup.ps1' -Description 'Preparation du projet (aucun test ne sera lance)' }
        '2' { Invoke-ProjectScript -ScriptName 'dev-all.ps1' -Description 'Demarrage du frontend et du backend' }
        '3' { Invoke-ProjectScript -ScriptName 'dev.ps1' -Description 'Demarrage du frontend' }
        '4' { Invoke-ProjectScript -ScriptName 'backend.ps1' -Description 'Demarrage du backend' }
        '5' { Invoke-NpmCommand -NpmArguments @('run', 'typecheck') -Description 'Verification TypeScript' }
        '6' { Invoke-NpmCommand -NpmArguments @('run', 'lint') -Description 'Verification ESLint' }
        '7' { Invoke-NpmCommand -NpmArguments @('run', 'format:check') -Description 'Verification Prettier' }
        '8' { Invoke-NpmCommand -NpmArguments @('run', 'test:unit') -Description 'Tests unitaires' -ConfirmFirst }
        '9' { Invoke-NpmCommand -NpmArguments @('run', 'test:integration') -Description 'Tests d''integration' -ConfirmFirst }
        '10' { Invoke-NpmCommand -NpmArguments @('run', 'test:e2e') -Description 'Tests E2E Playwright' -ConfirmFirst }
        '11' { Invoke-NpmCommand -NpmArguments @('run', 'test') -Description 'Tous les tests Vitest' -ConfirmFirst }
        '12' { Invoke-NpmCommand -NpmArguments @('run', 'check') -Description 'Verification complete : types, lint, format, tests et builds' -ConfirmFirst }
        '13' { Invoke-NpmCommand -NpmArguments @('run', 'build') -Description 'Build du frontend' }
        '14' { Invoke-NpmCommand -NpmArguments @('run', 'build:server') -Description 'Build du backend' }
        '15' { Invoke-NpmCommand -NpmArguments @('run', 'db:generate') -Description 'Generation du client Prisma' }
        '16' { Invoke-NpmCommand -NpmArguments @('run', 'db:deploy') -Description 'Application des migrations de base de donnees' -ConfirmFirst }
        default {
            Write-Host 'Choix invalide. Entrez un nombre entre 0 et 16.' -ForegroundColor Yellow
            Start-Sleep -Seconds 2
        }
    }

    if ($choice -eq '0') { break }
}
