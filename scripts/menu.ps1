[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$scriptRoot = $PSScriptRoot

function Invoke-Script {
    param([string]$Name, [string[]]$Arguments = @())
    & (Join-Path $scriptRoot $Name) @Arguments
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        Write-Warning "Le script s'est terminé avec le code $LASTEXITCODE."
    }
}

do {
    Clear-Host
    Write-Host 'Template React — outils de développement' -ForegroundColor Cyan
    Write-Host ''
    Write-Host '  1. Installer les dépendances'
    Write-Host '  2. Lancer le serveur de développement'
    Write-Host '  3. Construire pour la production'
    Write-Host '  4. Lancer les tests unitaires'
    Write-Host '  5. Lancer les tests avec couverture'
    Write-Host '  6. Lancer les tests E2E'
    Write-Host '  7. Exécuter tous les contrôles qualité'
    Write-Host '  8. Construire l’image Docker'
    Write-Host '  9. Nettoyer les fichiers générés'
    Write-Host ' 10. Prévisualiser le build de production'
    Write-Host '  0. Quitter'
    Write-Host ''

    $choice = Read-Host 'Choisissez une action'
    try {
        switch ($choice) {
            '1' { Invoke-Script 'setup.ps1' }
            '2' { Invoke-Script 'dev.ps1' }
            '3' { Invoke-Script 'build.ps1' }
            '4' { Invoke-Script 'test.ps1' }
            '5' { Invoke-Script 'test.ps1' @('-Coverage') }
            '6' { Invoke-Script 'test.ps1' @('-E2E') }
            '7' { Invoke-Script 'check.ps1' }
            '8' { Invoke-Script 'docker.ps1' @('-Action', 'Build') }
            '9' { Invoke-Script 'clean.ps1' }
            '10' { Invoke-Script 'preview.ps1' }
            '0' { break }
            default { Write-Warning 'Choix non reconnu.' }
        }
    }
    catch {
        Write-Error $_
    }

    if ($choice -ne '0') { [void](Read-Host 'Appuyez sur Entrée pour continuer') }
} while ($choice -ne '0')
