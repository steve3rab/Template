[CmdletBinding()]
param(
    [ValidateSet('Build', 'Run', 'Stop', 'Logs', 'Status')]
    [string]$Action = 'Build',
    [string]$Image = 'template-react:local',
    [string]$Container = 'template-react-local',
    [ValidateRange(1, 65535)][int]$Port = 8080
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
Test-ExternalCommand -Name 'docker'

switch ($Action) {
    'Build' {
        Push-Location $script:ProjectRoot
        try {
            & docker build -t $Image .
            if ($LASTEXITCODE -ne 0) { throw "La construction Docker a échoué (code $LASTEXITCODE)." }
        }
        finally { Pop-Location }
    }
    'Run' {
        $existing = @(& docker ps -a --filter "name=^/$Container$" --format '{{.Names}}')
        if ($LASTEXITCODE -ne 0) { throw "Impossible d'interroger Docker. Vérifiez que le moteur est démarré." }
        if ($existing -contains $Container) { throw "Le conteneur '$Container' existe déjà. Utilisez Stop ou choisissez un autre nom." }
        & docker run --detach --name $Container --publish "${Port}:8080" $Image
        if ($LASTEXITCODE -ne 0) { throw "Le lancement Docker a échoué (code $LASTEXITCODE)." }
        Write-Host "Application disponible sur http://localhost:$Port" -ForegroundColor Green
    }
    'Stop' {
        & docker stop $Container
        if ($LASTEXITCODE -ne 0) { throw "L'arrêt du conteneur '$Container' a échoué (code $LASTEXITCODE)." }
    }
    'Logs' {
        & docker logs --follow $Container
        if ($LASTEXITCODE -ne 0) { throw "La lecture des logs a échoué (code $LASTEXITCODE)." }
    }
    'Status' {
        & docker ps -a --filter "name=^/$Container$" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
        if ($LASTEXITCODE -ne 0) { throw "Impossible de lire l'état du conteneur Docker." }
    }
}
