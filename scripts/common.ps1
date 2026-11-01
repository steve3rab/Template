Set-StrictMode -Version Latest

$script:ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Invoke-Npm {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    # On Windows, prefer npm.cmd: npm may resolve to npm.ps1, which can be blocked
    # by the machine's PowerShell execution policy when it is not digitally signed.
    $npmCommand = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
    if (-not $npmCommand) {
        throw 'npm.cmd est introuvable. Vérifiez que Node.js est installé et que son dossier est présent dans PATH.'
    }

    Push-Location $script:ProjectRoot
    try {
        & $npmCommand.Source @Arguments
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
