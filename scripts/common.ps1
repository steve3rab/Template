Set-StrictMode -Version Latest

$script:ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Invoke-Npm {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw 'npm est introuvable. Installez Node.js 22.12 ou une version compatible, puis relancez le script.'
    }

    Push-Location $script:ProjectRoot
    try {
        & npm @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "La commande npm $($Arguments -join ' ') a échoué (code $LASTEXITCODE)."
        }
    }
    finally {
        Pop-Location
    }
}

function Assert-DependenciesInstalled {
    $nodeModules = Join-Path $script:ProjectRoot 'node_modules'
    if (-not (Test-Path $nodeModules)) {
        throw 'Les dépendances ne sont pas installées. Exécutez au préalable .\scripts\setup.ps1.'
    }
}

function Test-ExternalCommand {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Commande '$Name' introuvable. Vérifiez l'installation et le PATH."
    }
}
