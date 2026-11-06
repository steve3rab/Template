[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
Set-Location $script:ProjectRoot

try {
    [Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
}
catch {
    # Certains terminaux intégrés ne permettent pas de modifier leur encodage.
}

function New-MenuItem {
    param(
        [string]$Key,
        [string]$Label,
        [ValidateSet('Npm', 'Script')][string]$Kind,
        [string]$Target,
        [string[]]$Arguments = @(),
        [switch]$ConfirmFirst
    )
    [pscustomobject]@{
        Key = $Key
        Label = $Label
        Kind = $Kind
        Target = $Target
        Arguments = $Arguments
        ConfirmFirst = [bool]$ConfirmFirst
    }
}

function Show-MenuHeader {
    param([string]$Title)
    Clear-Host
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor DarkCyan
    Write-Host '               TEMPLATE | OUTILS DE DEVELOPPEMENT' -ForegroundColor Cyan
    Write-Host '============================================================' -ForegroundColor DarkCyan
    Write-Host $Title -ForegroundColor Yellow
    Write-Host "Projet : $script:ProjectRoot" -ForegroundColor DarkGray
    $nodeLabel = if (Get-Command node -ErrorAction SilentlyContinue) { (& node --version 2>$null) } else { 'absent' }
    $npmLabel = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { (& npm.cmd --version 2>$null) } else { 'absent' }
    Write-Host "Node : $nodeLabel | npm : $npmLabel" -ForegroundColor DarkGray
    Write-Host ''
}

function Invoke-MenuAction {
    param([Parameter(Mandatory = $true)]$Item)

    Write-Host ''
    Write-Host ("> " + $Item.Label) -ForegroundColor Cyan
    if ($Item.ConfirmFirst) {
        $answer = (Read-Host 'Cette opération peut être longue ou modifier des données. Continuer ? (O/N)').Trim()
        if ($answer -notin @('O', 'o', 'Oui', 'oui', 'Y', 'y', 'Yes', 'yes')) {
            Write-Host 'Opération annulée.' -ForegroundColor Yellow
            [void](Read-Host 'Entrée pour revenir au menu')
            return
        }
    }
    try {
        if ($Item.Kind -eq 'Npm') {
            $npmArguments = @($Item.Arguments)
            Invoke-Npm -Arguments $npmArguments -Description $Item.Label
        }
        else {
            $scriptPath = Join-Path $PSScriptRoot $Item.Target
            if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
                throw "Script introuvable : $scriptPath"
            }
            $scriptArguments = @($Item.Arguments)
            & $scriptPath @scriptArguments
        }
    }
    catch {
        Write-Host ''
        Write-Host "ÉCHEC : $($_.Exception.Message)" -ForegroundColor Red
        Write-Host 'Les références fichier/ligne éventuelles sont affichées dans la sortie ci-dessus.' -ForegroundColor Yellow
    }
    Write-Host ''
    [void](Read-Host 'Entrée pour revenir au menu')
}

function Invoke-MenuCategory {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][object[]]$Items
    )

    while ($true) {
        Show-MenuHeader -Title $Title
        foreach ($item in $Items) {
            Write-Host (" {0,2}. {1}" -f $item.Key, $item.Label)
        }
        Write-Host ''
        Write-Host '  0. Retour au menu principal' -ForegroundColor DarkGray
        Write-Host ''
        $choice = (Read-Host 'Votre choix').Trim()
        if ($choice -eq '0') { return }

        $selected = $Items | Where-Object { $_.Key -eq $choice } | Select-Object -First 1
        if ($null -eq $selected) {
            Write-Host 'Choix invalide.' -ForegroundColor Yellow
            Start-Sleep -Seconds 1
            continue
        }
        Invoke-MenuAction -Item $selected
    }
}

$startupItems = @(
    (New-MenuItem '1' 'Installer / préparer le projet (npm ci, Prisma, migrations)' Script 'setup.ps1' -ConfirmFirst),
    (New-MenuItem '2' 'Démarrer frontend + backend dans deux fenêtres' Script 'dev-all.ps1'),
    (New-MenuItem '3' 'Arrêter frontend + backend lancés par le menu' Script 'stop-dev-all.ps1'),
    (New-MenuItem '4' 'Démarrer le frontend uniquement' Script 'dev.ps1'),
    (New-MenuItem '5' 'Démarrer le backend uniquement' Script 'backend.ps1'),
    (New-MenuItem '6' 'Construire puis prévisualiser le frontend' Script 'preview.ps1')
)
$qualityItems = @(
    (New-MenuItem '1' 'Contrôle complet (types, lint, format, couverture, builds)' Script 'check.ps1' -ConfirmFirst),
    (New-MenuItem '2' 'Vérifier TypeScript' Npm '' @('run', 'typecheck')),
    (New-MenuItem '3' 'Vérifier ESLint' Npm '' @('run', 'lint')),
    (New-MenuItem '4' 'Corriger automatiquement ESLint' Npm '' @('run', 'lint:fix')),
    (New-MenuItem '5' 'Vérifier Prettier' Npm '' @('run', 'format:check')),
    (New-MenuItem '6' 'Formater les fichiers avec Prettier' Npm '' @('run', 'format')),
    (New-MenuItem '7' 'Construire le frontend' Npm '' @('run', 'build')),
    (New-MenuItem '8' 'Construire le backend' Npm '' @('run', 'build:server'))
)
$testItems = @(
    (New-MenuItem '1' 'Tests unitaires frontend' Script 'test.ps1' @('-Mode', 'Unit')),
    (New-MenuItem '2' 'Tests d’intégration backend' Script 'test.ps1' @('-Mode', 'Integration')),
    (New-MenuItem '3' 'Tous les tests Vitest' Script 'test.ps1' @('-Mode', 'All')),
    (New-MenuItem '4' 'Couverture frontend + backend avec seuils' Script 'test.ps1' @('-Mode', 'Coverage') -ConfirmFirst),
    (New-MenuItem '5' 'Tests E2E Playwright' Script 'test.ps1' @('-Mode', 'E2E') -ConfirmFirst),
    (New-MenuItem '6' 'Installer Chromium pour Playwright' Npm '' @('exec', '--', 'playwright', 'install', 'chromium')),
    (New-MenuItem '7' 'Test de charge k6 — profil smoke local' Script 'test.ps1' @('-Mode', 'LoadSmoke')),
    (New-MenuItem '8' 'Test de charge k6 — profil stress, BASE_URL requis' Script 'test.ps1' @('-Mode', 'LoadStress') -ConfirmFirst)
)
$databaseItems = @(
    (New-MenuItem '1' 'Générer les clients Prisma SQLite + PostgreSQL' Npm '' @('run', 'db:generate')),
    (New-MenuItem '2' 'Vérifier l’état des migrations SQLite' Npm '' @('run', 'db:status')),
    (New-MenuItem '3' 'Appliquer les migrations existantes' Npm '' @('run', 'db:deploy') -ConfirmFirst),
    (New-MenuItem '4' 'Créer une migration en développement' Npm '' @('run', 'db:migrate')),
    (New-MenuItem '5' 'Vérifier la parité des schémas SQLite/PostgreSQL' Npm '' @('run', 'db:check-schema-parity')),
    (New-MenuItem '6' 'Créer / réinitialiser les comptes de test (mot de passe demandé)' Script 'seed-test-users.ps1')
)
$dockerItems = @(
    (New-MenuItem '1' 'Construire l’image Docker locale' Script 'docker.ps1' @('-Action', 'Build')),
    (New-MenuItem '2' 'Démarrer le conteneur en arrière-plan' Script 'docker.ps1' @('-Action', 'Run')),
    (New-MenuItem '3' 'Afficher l’état du conteneur' Script 'docker.ps1' @('-Action', 'Status')),
    (New-MenuItem '4' 'Afficher les journaux du conteneur' Script 'docker.ps1' @('-Action', 'Logs')),
    (New-MenuItem '5' 'Arrêter le conteneur' Script 'docker.ps1' @('-Action', 'Stop'))
)
$maintenanceItems = @(
    (New-MenuItem '1' 'Nettoyer les builds, rapports et résultats de tests' Script 'clean.ps1'),
    (New-MenuItem '2' 'Supprimer aussi node_modules (confirmation demandée)' Script 'clean.ps1' @('-Dependencies', '-Confirm'))
)

while ($true) {
    Show-MenuHeader -Title 'MENU PRINCIPAL'
    Write-Host '  DÉMARRAGE' -ForegroundColor Yellow
    Write-Host '  1. Démarrer, arrêter et prévisualiser'
    Write-Host '  QUALITÉ ET BUILD' -ForegroundColor Yellow
    Write-Host '  2. TypeScript, ESLint, Prettier et builds'
    Write-Host '  TESTS ET CHARGE' -ForegroundColor Yellow
    Write-Host '  3. Unitaires, intégration, couverture, E2E et k6'
    Write-Host '  BASE DE DONNÉES' -ForegroundColor Yellow
    Write-Host '  4. Prisma, migrations, parité et comptes de test'
    Write-Host '  DOCKER' -ForegroundColor Yellow
    Write-Host '  5. Build, démarrage, état, journaux et arrêt'
    Write-Host '  MAINTENANCE' -ForegroundColor Yellow
    Write-Host '  6. Nettoyage des artefacts'
    Write-Host ''
    Write-Host '  0. Quitter' -ForegroundColor DarkGray
    Write-Host ''
    $choice = (Read-Host 'Choisissez une rubrique').Trim()

    switch ($choice) {
        '1' { Invoke-MenuCategory -Title 'DÉMARRAGE' -Items $startupItems }
        '2' { Invoke-MenuCategory -Title 'QUALITÉ ET BUILD' -Items $qualityItems }
        '3' { Invoke-MenuCategory -Title 'TESTS ET CHARGE' -Items $testItems }
        '4' { Invoke-MenuCategory -Title 'BASE DE DONNÉES' -Items $databaseItems }
        '5' { Invoke-MenuCategory -Title 'DOCKER' -Items $dockerItems }
        '6' { Invoke-MenuCategory -Title 'MAINTENANCE' -Items $maintenanceItems }
        '0' { Clear-Host; Write-Host 'À bientôt !' -ForegroundColor Cyan; return }
        default {
            Write-Host 'Choix invalide. Entrez un nombre entre 0 et 6.' -ForegroundColor Yellow
            Start-Sleep -Seconds 1
        }
    }
}
